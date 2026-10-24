import type { SolidusEvents } from '../../../types.ts';
import type { MerkleEventNode } from './types.ts';

/**
 * DagSyncer handles the network layer for fetching and announcing Merkle-DAG nodes.
 * It bridges between the local MerkleEventGraph and the peer-to-peer network.
 */
export class DagSyncer {
    private events: SolidusEvents;
    private peerNetwork: any; // NetworkHandle from networking plugin
    private pendingRequests: Map<
        string,
        {
            promise: Promise<MerkleEventNode>;
            resolve: (node: MerkleEventNode) => void;
            reject: (error: Error) => void;
            timeout: ReturnType<typeof setTimeout>;
        }
    >;

    constructor(events: SolidusEvents, peerNetwork: any) {
        this.events = events;
        this.peerNetwork = peerNetwork;
        this.pendingRequests = new Map();

        // Listen for incoming messages from peers
        this.peerNetwork.onMessage((peerId: string, raw: string) => {
            this.handleMessage(peerId, raw);
        });

        // Listen for peer connection events
        this.events.on('network:peer-joined', ({ peerId }: { peerId: string }) => {
            console.log('[DagSyncer] Peer joined:', peerId);
        });

        this.events.on('network:peer-left', ({ peerId }: { peerId: string }) => {
            console.log('[DagSyncer] Peer left:', peerId);
        });
    }

    /**
     * Announce to all peers that we have a new node available.
     * This broadcasts the CID so peers can request it if they need it.
     */
    async announceNode(cid: string): Promise<void> {
        const message = JSON.stringify({
            kind: 'dag:announce',
            cid,
        });

        this.peerNetwork.broadcast(message);
    }

    /**
     * Request a node from peers by CID.
     * Returns a promise that resolves when a peer provides the node.
     */
    async getNode(cid: string, timeoutMs = 5000): Promise<MerkleEventNode> {
        // Check if we already have a pending request for this CID
        if (this.pendingRequests.has(cid)) {
            return this.pendingRequests.get(cid)!.promise;
        }

        // Create a promise that will be resolved when we receive the node
        let resolve!: (node: MerkleEventNode) => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<MerkleEventNode>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        const timeout = setTimeout(() => {
            this.pendingRequests.delete(cid);
            reject(new Error(`Timeout: Node ${cid} not found`));
        }, timeoutMs);

        this.pendingRequests.set(cid, { promise, resolve, reject, timeout });

        // Broadcast request to all peers
        const message = JSON.stringify({
            kind: 'dag:request',
            cid,
        });

        this.peerNetwork.broadcast(message);

        return promise;
    }

    /**
     * Handle incoming messages from peers
     */
    private handleMessage(peerId: string, raw: string): void {
        try {
            const message = JSON.parse(raw);

            switch (message.kind) {
                case 'dag:request':
                    // Peer is requesting a node from us
                    this.handleNodeRequest(peerId, message.cid);
                    break;

                case 'dag:response':
                    // Peer is sending us a node we requested
                    this.handleNodeResponse(peerId, message.node);
                    break;

                case 'dag:announce':
                    // Peer is announcing they have a new node
                    this.handleNodeAnnounce(peerId, message.cid);
                    break;
            }
        } catch (err) {
            console.error('[DagSyncer] Failed to parse message:', err);
        }
    }

    /**
     * Handle a peer requesting a node from us
     */
    private handleNodeRequest(peerId: string, cid: string): void {
        // Emit event so the MerkleEventGraph can provide the node
        this.events.emit('dag:node-requested', { cid, peerId });
    }

    /**
     * Handle receiving a node from a peer
     */
    private handleNodeResponse(_peerId: string, node: MerkleEventNode): void {
        const pending = this.pendingRequests.get(node.cid);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(node.cid);
            pending.resolve(node);
        }
    }

    /**
     * Handle a peer announcing they have a new node
     */
    private handleNodeAnnounce(peerId: string, cid: string): void {
        // Emit event so the plugin can decide whether to fetch it
        this.events.emit('dag:node-announced', { cid, peerId });
    }

    /**
     * Send a node to a specific peer (in response to their request)
     */
    sendNode(peerId: string, node: MerkleEventNode): void {
        const message = JSON.stringify({
            kind: 'dag:response',
            node,
        });

        this.peerNetwork.send(peerId, message);
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        // Clear all pending requests
        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('DagSyncer destroyed'));
        }
        this.pendingRequests.clear();
    }
}
