import type { StateOperation } from '../state-sync/types.ts';
import { applyOperation } from './../state-sync/apply-operation.ts';
import type {
    BaseNetworkingConfig,
    NetworkHandle,
    NetworkTransport,
    NetworkTransportFactory,
    Plugin,
} from './types.ts';

/**
 * Generic factory: turns ANY NetworkTransport implementation into a solidus
 * networking plugin. This is the extension point for open-source
 * contributors — implement NetworkTransport for your protocol of choice,
 * then call createNetworkingPlugin(myTransportFactory, 'my-transport-name').
 *
 * The bundled default (WebRTC) is built exactly this way — see
 * networking/webrtc/index.ts's createWebRTCNetworkingPlugin().
 */
export function createNetworkingPlugin<Config extends BaseNetworkingConfig>(
    createTransport: NetworkTransportFactory<Config>,
    pluginName = 'networking',
): Plugin {
    const activeTransports = new Set<NetworkTransport>();

    return {
        name: pluginName,
        provides: ['peer-network'],

        setup(events) {
            events.on('state:operation', (op: StateOperation) => {
                const payload = JSON.stringify({ kind: 'state-op', op });
                activeTransports.forEach((transport) => {
                    try {
                        transport.broadcast(payload);
                    } catch {
                        console.log('No open peers yet');
                    }
                });
            });
        },

        create(_type, resourceConfig, events) {
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
                    if (parsed.kind === 'state-op') {
                        applyOperation(config.target, parsed.op as StateOperation);
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
        },
    };
}
