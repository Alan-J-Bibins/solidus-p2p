import type { SolidusPlugin } from '../types.ts';

export type PeerId = string;

/**
 * The contract any networking transport (WebRTC, a plain WebSocket relay,
 * libp2p, etc.) must implement to plug into solidus' networking plugin.
 * Open-source contributors add support for a new transport by implementing
 * this interface — see networking/webrtc/webrtc-transport.ts for the
 * reference implementation.
 */
export interface NetworkTransport {
    /** This peer's own id within the current room, once connected. */
    readonly localPeerId: PeerId;

    /** Establish the connection (join the room / signaling channel). */
    connect(): Promise<void>;

    /** Send data to one specific peer. */
    sendTo(peerId: PeerId, data: string): void;

    /** Send data to every currently-connected peer. */
    broadcast(data: string): void;

    /** Currently connected peer ids (excludes self). */
    getPeers(): PeerId[];

    onMessage(handler: (peerId: PeerId, data: string) => void): void;
    onPeerJoin(handler: (peerId: PeerId) => void): void;
    onPeerLeave(handler: (peerId: PeerId) => void): void;

    close(): void;
}

export type NetworkTransportFactory<Config = any> = (config: Config) => NetworkTransport;

export interface NetworkHandle {
    readonly localPeerId: PeerId;
    readonly peers: PeerId[];
    send(peerId: PeerId, data: string): void;
    broadcast(data: string): void;
    onMessage(handler: (peerId: PeerId, data: string) => void): void;
    onPeerJoin(handler: (peerId: PeerId) => void): void;
    onPeerLeave(handler: (peerId: PeerId) => void): void;
    waitUntilOpen(): Promise<void>;
    close(): void;
}

/** Base config every networking transport's config object must satisfy. */
export interface BaseNetworkingConfig {
    /**
     * The RAW object originally passed into createState(obj, ...) — NOT the
     * returned proxy. Required so incoming remote operations can be applied
     * without re-triggering local broadcast.
     */
    target: object;
}

export type Plugin = SolidusPlugin;
