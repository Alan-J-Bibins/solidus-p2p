import type { BaseNetworkingConfig, SignalingServerConfig } from '../types.ts';

export type WebRTCResources = {
    'peer-network': WebRTCTransportConfig;
    'signaling-server': SignalingServerConfig;
};

export interface WebRTCTransportConfig extends BaseNetworkingConfig {
    target: object;
    signalingServer: string;
    room: string;
    iceServers?: RTCIceServer[];
}
