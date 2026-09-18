export type PeerId = string;

export type RTCSignal =
    | { type: 'offer'; sdp: RTCSessionDescriptionInit }
    | { type: 'answer'; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

export interface NetworkTransport {
    readonly localPeerId: PeerId;
    connect(): Promise<void>;
    sendTo(peerId: PeerId, data: string): void;
    broadcast(data: string): void;
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

export interface BaseNetworkingConfig {
    target: object;
}

export interface SignalingServerHooks {
    onConnection?: (peerId: string, roomId: string) => void;
    onDisconnection?: (peerId: string, roomId: string) => void;
    onMessage?: (peerId: string, message: any) => void;
    onSignalForward?: (from: string, to: string, signal: any) => void;
    onRoomCreated?: (roomId: string) => void;
    onRoomDestroyed?: (roomId: string) => void;
    onError?: (error: Error, context?: string) => void;
    onReady?: (port: number, host: string) => void;
}

export interface SignalingServerConfig {
    port: number;
    host?: string;
    hooks?: SignalingServerHooks;
}
