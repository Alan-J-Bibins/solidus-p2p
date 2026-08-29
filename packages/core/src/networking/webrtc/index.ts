import { createNetworkingPlugin } from '../create-networking-plugin.ts';
import { createWebRTCTransport, type WebRTCTransportConfig } from './webrtc-transport.ts';

/** The default, bundled networking plugin — WebRTC mesh over a signaling server. */
export function createWebRTCNetworkingPlugin() {
    return createNetworkingPlugin<WebRTCTransportConfig>(
        createWebRTCTransport,
        'networking-webrtc',
    );
}

export { createWebRTCTransport } from './webrtc-transport.ts';
export type { WebRTCTransportConfig } from './webrtc-transport.ts';
export { WebRtcPeer } from './peer-connection.ts';
export { SignalingClient } from './signaling-client.ts';
export type { RTCSignal } from './types.ts';
