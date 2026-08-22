import type { StateOperation } from '../state-sync/types.ts';
import { WebRtcPeer } from './peer-connection.ts';
import { SignalingClient } from './signaling-client.ts';
import type { NetworkingConfig, NetworkHandle, Plugin } from './types.ts';

export function createNetworkingPlugin(): Plugin {
    const activeConnections = new Set<NetworkHandle>();

    return {
        name: 'networking',
        provides: ['peer-network'],

        setup(events) {
            events.on('state:operation', (op: StateOperation) => {
                const payload = JSON.stringify({ kind: 'state-op', op });
                activeConnections.forEach((handle) => {
                    try {
                        handle.send(payload);
                    } catch {
                        // Channel not open yet / already closed — drop silently.
                    }
                });
            });
        },

        create(_type, resourceConfig, events) {
            const config = resourceConfig.config as NetworkingConfig;
            if (!config?.signalingServer || !config?.room || !config?.role || !config?.target) {
                throw new Error(
                    '[solidus-p2p] networking plugin requires config: { signalingServer, room, role, target }',
                );
            }

            const signaling = new SignalingClient(config.signalingServer, config.room);
            const peer = new WebRtcPeer({
                iceServers: config.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }],
                onSignal: (message) => signaling.send(message),
            });

            signaling.onMessage((message) => {
                void peer.handleSignal(message);
            });

            peer.onMessage((raw) => {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.kind === 'state-op') {
                        events.emit('state:remote-operation', parsed.op);
                    }
                } catch {
                    // Malformed/unexpected payload from peer — ignore.
                }
            });

            const handle: NetworkHandle = {
                connection: peer.connection,
                send: (data) => peer.send(data),
                waitUntilOpen: () => peer.waitUntilOpen(),
                onMessage: (handler) => peer.onMessage(handler),
                close: () => {
                    activeConnections.delete(handle);
                    peer.close();
                    signaling.close();
                },
            };

            activeConnections.add(handle);

            void (async () => {
                await signaling.waitUntilOpen();
                events.emit('network:signaling-open', {});
                if (config.role === 'offerer') {
                    await peer.createOffer();
                    events.emit('network:offer-sent', {});
                }
            })();

            void peer
                .waitUntilOpen()
                .then(() => {
                    events.emit('network:connected', {});
                })
                .catch(() => {
                    console.log('Connection failure');
                });

            return handle;
        },
    };
}
