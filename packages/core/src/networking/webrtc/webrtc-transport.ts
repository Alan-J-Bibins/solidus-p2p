import type { BaseNetworkingConfig, NetworkTransport } from '../types.ts';
import { WebRtcPeer } from './peer-connection.ts';
import { SignalingClient } from './signaling-client.ts';

export interface WebRTCTransportConfig extends BaseNetworkingConfig {
    /** e.g. "192.168.1.42:8080" or "wss://xxxx.ngrok-free.app" */
    signalingServer: string;
    /** All peers using the same room id connect to each other (full mesh). */
    room: string;
    iceServers?: RTCIceServer[];
}

export function createWebRTCTransport(config: WebRTCTransportConfig): NetworkTransport {
    let localPeerId = '';
    const peerConnections = new Map<string, WebRtcPeer>();
    const messageHandlers: Array<(peerId: string, data: string) => void> = [];
    const joinHandlers: Array<(peerId: string) => void> = [];
    const leaveHandlers: Array<(peerId: string) => void> = [];

    const signaling = new SignalingClient(config.signalingServer, config.room);
    const iceServers = config.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];

    function setupPeer(remotePeerId: string, isInitiator: boolean): WebRtcPeer {
        const peer = new WebRtcPeer({
            iceServers,
            onSignal: (signal) => signaling.sendSignal(remotePeerId, signal),
        });
        peerConnections.set(remotePeerId, peer);

        peer.onMessage((data) => {
            messageHandlers.forEach((handler) => handler(remotePeerId, data));
        });

        peer.waitUntilOpen().then(() => {
            joinHandlers.forEach((handler) => handler(remotePeerId));
        });

        if (isInitiator) void peer.createOffer();

        return peer;
    }

    let readyPromise: Promise<void> | null = null;

    signaling.onPeerJoined((peerId) => {
        if (!peerConnections.has(peerId)) setupPeer(peerId, false);
    });

    signaling.onPeerLeft((peerId) => {
        peerConnections.get(peerId)?.close();
        peerConnections.delete(peerId);
        leaveHandlers.forEach((handler) => handler(peerId));
    });

    signaling.onSignal((from, signal) => {
        const peer = peerConnections.get(from) ?? setupPeer(from, false);
        void peer.handleSignal(signal);
    });

    return {
        get localPeerId() {
            return localPeerId;
        },

        connect(): Promise<void> {
            if (!readyPromise) {
                readyPromise = new Promise((resolve, reject) => {
                    signaling.waitUntilOpen().catch(reject);
                    signaling.onWelcome((peerId, existingPeers) => {
                        localPeerId = peerId;
                        // We're the new joiner — initiate a connection to everyone already here.
                        existingPeers.forEach((id) => setupPeer(id, true));
                        resolve();
                    });
                });
            }
            return readyPromise;
        },

        sendTo(peerId, data) {
            const peer = peerConnections.get(peerId);
            if (!peer) throw new Error(`[solidus-p2p webrtc] No connection to peer "${peerId}"`);
            peer.send(data);
        },

        broadcast(data) {
            peerConnections.forEach((peer) => {
                try {
                    peer.send(data);
                } catch {
                    // That peer's channel isn't open yet — skip it, keep broadcasting to others.
                }
            });
        },

        getPeers() {
            return Array.from(peerConnections.keys());
        },

        onMessage: (handler) => messageHandlers.push(handler),
        onPeerJoin: (handler) => joinHandlers.push(handler),
        onPeerLeave: (handler) => leaveHandlers.push(handler),

        close() {
            peerConnections.forEach((peer) => peer.close());
            peerConnections.clear();
            signaling.close();
        },
    };
}
