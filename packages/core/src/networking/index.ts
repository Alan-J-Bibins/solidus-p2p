export { webrtc } from './webrtc/index.ts';
export { createNetworkingPlugin } from './create-networking-plugin.ts';
export { createWebRTCTransport } from './webrtc/transport.ts';
export { WebRtcPeer } from './webrtc/peer.ts';
export { SignalingClient } from './signaling-client.ts';

export type {
    NetworkTransport,
    NetworkTransportFactory,
    NetworkHandle,
    BaseNetworkingConfig,
    PeerId,
    RTCSignal,
} from './types.ts';

export type { WebRTCTransportConfig, WebRTCResources } from './webrtc/types.ts';
