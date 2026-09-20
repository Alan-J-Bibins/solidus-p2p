import { SignalingClient } from '../signaling-client.ts';
import type { Chunk, NetworkTransport } from '../types.ts';
import { WebRtcPeer } from './peer.ts';
import type { WebRTCTransportConfig } from './types.ts';

// Wire format: 1-char tag + payload. State payload is the raw string,
// chunk payload is JSON.stringify(chunk).
const STATE_TAG = 'S';
const CHUNK_TAG = 'C';

export function createWebRTCTransport(config: WebRTCTransportConfig): NetworkTransport {
    let localPeerId = '';
    const peerConnections = new Map<string, WebRtcPeer>();
    const messageHandlers: Array<(peerId: string, data: string) => void> = [];
    const chunkHandlers: Array<(peerId: string, chunk: Chunk) => void> = [];
    const joinHandlers: Array<(peerId: string) => void> = [];
    const leaveHandlers: Array<(peerId: string) => void> = [];

    const signaling = new SignalingClient(config.signalingServer, config.room);
    const iceServers = config.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];

    function handleIncoming(remotePeerId: string, raw: string): void {
        const tag = raw[0];
        const body = raw.slice(1);

        if (tag === STATE_TAG) {
            messageHandlers.forEach((handler) => handler(remotePeerId, body));
        } else if (tag === CHUNK_TAG) {
            let chunk: unknown;
            try {
                chunk = JSON.parse(body);
            } catch {
                console.error(`[solidus-p2p webrtc] Malformed chunk from peer "${remotePeerId}"`);
                return;
            }
            if (!Array.isArray(chunk)) return;
            chunkHandlers.forEach((handler) => handler(remotePeerId, chunk as Chunk));
        } else {
            console.warn(`[solidus-p2p webrtc] Unknown message tag from peer "${remotePeerId}"`);
        }
    }

    function setupPeer(remotePeerId: string, isInitiator: boolean): WebRtcPeer {
        const peer = new WebRtcPeer({
            iceServers,
            onSignal: (signal) => signaling.sendSignal(remotePeerId, signal),
            stateBurstLimit: config.stateBurstLimit,
            highWaterMark: config.highWaterMark,
        });
        peerConnections.set(remotePeerId, peer);

        peer.onMessage((data) => handleIncoming(remotePeerId, data));

        void peer.waitUntilOpen().then(() => {
            joinHandlers.forEach((handler) => handler(remotePeerId));
        });

        if (isInitiator) void peer.createOffer();

        return peer;
    }

    // Serialize once, then hand the same string to every peer's queue
    function fanOut(frame: string, lane: 'state' | 'chunk'): void {
        peerConnections.forEach((peer) => {
            if (!peer.isChannelOpen) return; // channel not open yet, skip it
            if (lane === 'state') peer.enqueueState(frame);
            else peer.enqueueChunk(frame);
        });
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
            peer.send(STATE_TAG + data); // direct, bypasses the queue
        },

        /** High priority. */
        broadcastState(data: string) {
            fanOut(STATE_TAG + data, 'state');
        },

        /** Low priority, but guaranteed a share of bandwidth. */
        broadcastChunk(chunk: Chunk) {
            fanOut(CHUNK_TAG + JSON.stringify(chunk), 'chunk');
        },

        /** Kept for compatibility: a plain broadcast is a state broadcast. */
        broadcast(data) {
            fanOut(STATE_TAG + data, 'state');
        },

        getPeers() {
            return Array.from(peerConnections.keys());
        },

        onMessage: (handler) => messageHandlers.push(handler),
        onChunk: (handler) => chunkHandlers.push(handler),
        onPeerJoin: (handler) => joinHandlers.push(handler),
        onPeerLeave: (handler) => leaveHandlers.push(handler),

        close() {
            peerConnections.forEach((peer) => peer.close());
            peerConnections.clear();
            signaling.close();
        },
    };
}
