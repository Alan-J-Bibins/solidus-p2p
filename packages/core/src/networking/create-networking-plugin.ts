import { applyOperation } from '../state-sync/apply-operation.ts';
import { AssetReferenceTracker } from '../state-sync/asset/reference-tracker.ts';
import { Asset } from '../state-sync/datatypes/asset.ts';
import type { StateOperation } from '../state-sync/types.ts';
import type { SolidusPlugin } from '../types.ts';
import type {
    BaseNetworkingConfig,
    NetworkHandle,
    Chunk,
    NetworkTransport,
    NetworkTransportFactory,
} from './types.ts';

function serializeNetworkValue(value: any): any {
    if (value instanceof Asset) {
        return {
            __solidusType: 'Asset',
            id: value.id,
            size: value.size,
            type: value.type,
            name: value.name,
        };
    }

    if (Array.isArray(value)) return value.map(serializeNetworkValue);

    if (value !== null && typeof value === 'object') {
        const result: Record<string, any> = {};
        for (const [key, child] of Object.entries(value)) {
            result[key] = serializeNetworkValue(child);
        }
        return result;
    }

    return value;
}

function deserializeNetworkValue(value: any): any {
    if (Array.isArray(value)) return value.map(deserializeNetworkValue);

    if (value !== null && typeof value === 'object') {
        if (value.__solidusType === 'Asset') {
            return new Asset(value.id, value.size, value.type, value.name);
        }

        const result: Record<string, any> = {};
        for (const [key, child] of Object.entries(value)) {
            result[key] = deserializeNetworkValue(child);
        }
        return result;
    }

    return value;
}

export function createNetworkingPlugin<
    Config extends BaseNetworkingConfig,
    Resources extends Record<string, any> = Record<string, any>,
>(
    createTransport: NetworkTransportFactory<Config>,
    pluginName = 'networking',
    additionallyProvides?: Record<string, Function>,
): SolidusPlugin<Resources> {
    const activeTransports = new Set<NetworkTransport>();
    let rawStateRegistry: Map<string, any>;
    let assetTracker: AssetReferenceTracker | undefined;

    return {
        name: pluginName,
        provides: [
            'peer-network',
            ...(additionallyProvides ? Object.keys(additionallyProvides) : []),
        ] as (keyof Resources & string)[],

        setup(events, registry, _assetStore, tracker?: AssetReferenceTracker) {
            rawStateRegistry = registry;
            assetTracker = tracker;

            events.on('network:chunk', (chunk: Chunk) => {
                activeTransports.forEach((transport) => {
                    try {
                        transport.broadcastChunk(chunk);
                    } catch {
                        console.log('No open peers yet');
                    }
                });
            });

            events.on('state:operation', (op: StateOperation) => {
                const payload = JSON.stringify({
                    kind: 'state-update',
                    op: { ...op, value: serializeNetworkValue(op.value) },
                });
                activeTransports.forEach((transport) => {
                    try {
                        transport.broadcastState(payload);
                    } catch {
                        console.log('No open peers yet');
                    }
                });
            });
        },

        create(type, resourceConfig, events) {
            if (type === 'peer-network') {
                const config = resourceConfig.config as Config;
                if (!config?.target) {
                    throw new Error(
                        `[solidus-p2p] "${pluginName}" plugin requires config.target (the raw state object)`,
                    );
                }

                const transport = createTransport(config);
                activeTransports.add(transport);

                transport.onMessage((peerId, raw) => {
                    try {
                        const parsed = JSON.parse(raw);
                        if (parsed.kind === 'state-update') {
                            const op = parsed.op as StateOperation;
                            const revivedOp: StateOperation = {
                                ...op,
                                value: deserializeNetworkValue(op.value),
                            };
                            for (const rawState of rawStateRegistry.values()) {
                                applyOperation(rawState, revivedOp, assetTracker);
                            }
                            events.emit('state:remote-applied', { peerId, op: revivedOp });
                        }
                    } catch (err) {
                        console.log('[Networking] Failed to parse message:', err, 'raw:', raw);
                    }
                });

                transport.onPeerJoin((peerId) => events.emit('network:peer-joined', { peerId }));
                transport.onPeerLeave((peerId) => events.emit('network:peer-left', { peerId }));

                const connectPromise = transport.connect();

                const handle: NetworkHandle = {
                    get localPeerId() {
                        return transport.localPeerId;
                    },
                    get peers() {
                        return transport.getPeers();
                    },
                    send: (peerId, data) => transport.sendTo(peerId, data),
                    broadcast: (data) => transport.broadcast(data),
                    broadcastState: (data) => transport.broadcastState(data),
                    broadcastChunk: (chunk) => transport.broadcastChunk(chunk),
                    onMessage: (handler) => transport.onMessage(handler),
                    onChunk: (handler) => transport.onChunk(handler),
                    onPeerJoin: (handler) => transport.onPeerJoin(handler),
                    onPeerLeave: (handler) => transport.onPeerLeave(handler),
                    waitUntilOpen: () => connectPromise,
                    close: () => {
                        activeTransports.delete(transport);
                        transport.close();
                    },
                };

                return handle;
            }

            const handler = additionallyProvides?.[type];
            if (handler) {
                return handler(resourceConfig, events);
            }

            return undefined;
        },
    };
}
