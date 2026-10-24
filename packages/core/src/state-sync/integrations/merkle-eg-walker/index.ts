import type { SolidusEvents, SolidusPlugin } from '../../../types.ts';
import type { StateOperation } from '../../types.ts';
import { EgWalker } from './eg-walker.ts';
import { MerkleEventGraph } from './event-graph.ts';
import type { MerkleEventNode } from './types.ts';

export interface MerkleEGWalkerOptions {
    peerId: string;
    initialState?: any;
}

export function merkleEGWalker(options: MerkleEGWalkerOptions): SolidusPlugin {
    let graph: MerkleEventGraph;
    let egWalker: EgWalker<any>;
    let isApplyingRemote = false;

    return {
        name: 'merkle-eg-walker',
        setup(events: SolidusEvents) {
            graph = new MerkleEventGraph();

            // Track pending node requests for the dagSyncer
            const pendingRequests = new Map<
                string,
                {
                    promise: Promise<MerkleEventNode>;
                    resolve: (node: MerkleEventNode) => void;
                    reject: (error: Error) => void;
                    timeout: ReturnType<typeof setTimeout>;
                }
            >();

            // Create a dagSyncer that uses the event bus instead of peerNetwork
            const dagSyncer = {
                getNode: async (cid: string): Promise<MerkleEventNode> => {
                    // Check if we already have it locally
                    const localNode = graph.getNode(cid);
                    if (localNode) return localNode;

                    // Check if we already have a pending request
                    const existing = pendingRequests.get(cid);
                    if (existing) return existing.promise;

                    // Create a promise that will be resolved when we receive the node
                    let resolve!: (node: MerkleEventNode) => void;
                    let reject!: (error: Error) => void;
                    const promise = new Promise<MerkleEventNode>((res, rej) => {
                        resolve = res;
                        reject = rej;
                    });

                    const timeout = setTimeout(() => {
                        pendingRequests.delete(cid);
                        reject(new Error(`Timeout: Node ${cid} not found`));
                    }, 10000);

                    pendingRequests.set(cid, { promise, resolve, reject, timeout });

                    // Broadcast request to all peers
                    events.emit('state:broadcast', { kind: 'dag:request', cid });

                    return promise;
                },
                sendNode: (peerId: string, node: MerkleEventNode) => {
                    events.emit('state:broadcast', { kind: 'dag:response', node, to: peerId });
                },
                destroy: () => {
                    for (const pending of pendingRequests.values()) {
                        clearTimeout(pending.timeout);
                        pending.reject(new Error('DagSyncer destroyed'));
                    }
                    pendingRequests.clear();
                },
            } as any;

            // Initialize the EgWalker
            egWalker = new EgWalker(graph, dagSyncer, options.initialState ?? {}, options.peerId);

            // Listen for state initialization
            events.on('state:init', (initialState: any) => {
                egWalker.setState(initialState);
            });

            // Listen for local state operations
            events.on('state:operation', async (op: StateOperation) => {
                if (isApplyingRemote) return;
                await egWalker.applyLocal(op);

                // Broadcast the new node to peers
                const frontier = graph.getFrontier();
                if (frontier.length > 0) {
                    const node = graph.getNode(frontier[frontier.length - 1]);
                    if (node) {
                        events.emit('state:broadcast', node);
                    }
                }
            });

            // Listen for remote messages from peers
            events.on('state:remote-operation', async (peerId: string, data: any) => {
                if (!data || typeof data !== 'object') return;

                // Handle dag protocol messages
                if (data.kind === 'dag:request' && data.cid) {
                    // Peer is requesting a node from us
                    const node = graph.getNode(data.cid);
                    if (node) {
                        events.emit('state:broadcast', {
                            kind: 'dag:response',
                            node,
                            to: peerId,
                        });
                    }
                    return;
                }

                if (data.kind === 'dag:response' && data.node?.cid) {
                    // We received a requested node
                    const pending = pendingRequests.get(data.node.cid);
                    if (pending) {
                        clearTimeout(pending.timeout);
                        pendingRequests.delete(data.node.cid);
                        pending.resolve(data.node);
                    }
                    return;
                }

                // Handle node broadcasts (full node data)
                if (data.cid) {
                    isApplyingRemote = true;
                    try {
                        await graph.importNode(data);
                        await egWalker.mergeRemote(data.cid);
                    } catch (err) {
                        console.error('[MerkleEGWalker] Failed to merge remote node:', err);
                    }
                    isApplyingRemote = false;
                }
            });

            // Listen for destroy
            events.on('destroy', () => {
                dagSyncer.destroy();
            });
        },
    };
}
