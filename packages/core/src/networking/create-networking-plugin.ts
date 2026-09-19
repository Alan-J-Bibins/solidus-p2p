import { applyOperation } from '../state-sync/apply-operation.ts';
import type { StateOperation } from '../state-sync/types.ts';
import type { SolidusPlugin } from '../types.ts';
import type {
    BaseNetworkingConfig,
    NetworkHandle,
    NetworkTransport,
    NetworkTransportFactory,
} from './types.ts';

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

    return {
        name: pluginName,
        provides: [
            'peer-network',
            ...(additionallyProvides ? Object.keys(additionallyProvides) : []),
        ] as (keyof Resources & string)[],

        setup(events, registry) {
            rawStateRegistry = registry;
            events.on('state:operation', (op: StateOperation) => {
                const payload = JSON.stringify({ kind: 'state-update', op });
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
                            for (const rawState of rawStateRegistry.values()) {
                                applyOperation(rawState, op);
                            }
                            events.emit('state:remote-applied', { peerId, op });
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
