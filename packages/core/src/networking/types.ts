import type { SolidusPlugin } from '../types.ts';

export type SignalingMessage =
    | { type: 'offer'; sdp: RTCSessionDescriptionInit }
    | { type: 'answer'; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

export type PeerRole = 'offerer' | 'answerer';

export interface NetworkingConfig {
    /** e.g. "wss://xxxx.ngrok-free.app" or "ws://192.168.1.42:8080" */
    signalingServer: string;
    /** Both peers must use the same room id to be paired by the signaling server */
    room: string;
    /** 'offerer' initiates the WebRTC offer; 'answerer' waits for one to arrive */
    role: PeerRole;
    /**
     * The RAW object originally passed into createState(obj, ...) — NOT the
     * returned proxy. Required so incoming remote operations can be applied
     * without re-triggering local broadcast.
     */
    target: object;
    iceServers?: RTCIceServer[];
}

export interface NetworkHandle {
    connection: RTCPeerConnection;
    send(data: string): void;
    waitUntilOpen(): Promise<void>;
    onMessage(handler: (data: string) => void): void;
    close(): void;
}

/** Re-exported under a shorter local alias so networking/plugin.ts reads cleanly. */
export type Plugin = SolidusPlugin;
