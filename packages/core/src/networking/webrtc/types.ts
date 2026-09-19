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
    /** Max consecutive state messages sent while chunks are waiting. Default 4 (~80% states / 20% chunks under load). */
    stateBurstLimit?: number;
    /** Bytes buffered in the data channel before we hold messages in the priority queue. Default 65536. */
    highWaterMark?: number;
}
