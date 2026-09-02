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

    return {
        name: pluginName,
        provides: [
            'peer-network',
            ...(additionallyProvides ? Object.keys(additionallyProvides) : []),
        ] as (keyof Resources & string)[],

        setup(events) {
            events.on('state:broadcast', (op: Uint8Array) => {
                const payload = JSON.stringify({ kind: 'state-update', op });
                activeTransports.forEach((transport) => {
                    try {
                        transport.broadcast(payload);
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
                            events.emit('state:remote-operation', { peerId, op: parsed.op });
                        }
                    } catch {
                        console.log('Malformed/unexpected payload from a peer.');
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
                    onMessage: (handler) => transport.onMessage(handler),
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
