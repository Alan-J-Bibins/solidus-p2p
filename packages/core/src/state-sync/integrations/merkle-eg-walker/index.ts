import type { SolidusEvents, SolidusPlugin } from '../../../types.ts';
import type { StateOperation } from '../../types.ts';
import { EgWalker } from './eg-walker.ts';
import { MerkleEventGraph } from './event-graph.ts';
import type { MerkleEventNode } from './types.ts';

export interface MerkleEGWalkerOptions {
    peerId?: string;
    initialState?: any;
}

export function merkleEGWalker(options: MerkleEGWalkerOptions): SolidusPlugin {
    let graph: MerkleEventGraph;
    let egWalker: EgWalker<any>;
    let isApplyingRemote = false;

    return {
        name: 'merkle-eg-walker',
        setup(events: SolidusEvents, rawStateRegistry: Map<string, any>) {
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

            // Initialize the EgWalker with a callback to emit remote-applied events
            egWalker = new EgWalker(
                graph,
                dagSyncer,
                options.initialState ?? {},
                options.peerId ?? 'local',
                (state) => {
                    // Copy properties from EgWalker's state to the Solidus state
                    // This triggers the proxy's set handler
                    const proxies = Array.from(rawStateRegistry.values());
                    for (const proxy of proxies) {
                        // Copy all properties from the EgWalker's state to the proxy
                        for (const key of Object.keys(state)) {
                            if (proxy[key] !== state[key]) {
                                proxy[key] = state[key];
                            }
                        }
                        // Remove properties that are no longer in the state
                        for (const key of Object.keys(proxy)) {
                            if (!(key in state)) {
                                delete proxy[key];
                            }
                        }
                    }

                    // Emit state:remote-applied for each operation that was merged
                    // We need to get the operations from the graph
                    const frontier = graph.getFrontier();
                    if (frontier.length > 0) {
                        const latestNode = graph.getNode(frontier[frontier.length - 1]);
                        if (latestNode) {
                            events.emit('state:remote-applied', {
                                peerId: latestNode.peerId,
                                op: latestNode.operation,
                            });
                        }
                    }
                },
            );

            // Listen for network connection to get the actual peerId
            events.on('network:peer-joined', ({ peerId }: { peerId: string }) => {
                // Update the EgWalker's peerId if it was using the default
                if (!options.peerId) {
                    (egWalker as any).peerId = peerId;
                }
            });

            // Listen for state initialization
            events.on('state:init', (initialState: any) => {
                egWalker.setState(initialState);
            });

            // The whiteboard (and any other app) can emit several
            // 'state:operation' events back-to-back with no await between
            // them (e.g. pushing a stroke then bumping a version counter).
            // applyLocal()/addNode() are async (they await a SHA-256 hash),
            // so without serialization two overlapping calls would race:
            // the second op's "parents" would be read before the first op
            // finished being added to the graph, corrupting the DAG and
            // causing the earlier operation's broadcast to be lost. Chain
            // all operation handling through one queue so each op fully
            // completes (added to the graph, broadcast) before the next
            // one starts.
            let opQueue: Promise<void> = Promise.resolve();
            const enqueue = (task: () => Promise<void>) => {
                opQueue = opQueue.then(task, task);
                return opQueue;
            };

            // Listen for local state operations
            events.on('state:operation', (op: StateOperation) => {
                if (isApplyingRemote) return;
                enqueue(async () => {
                    const cid = await egWalker.applyLocal(op);
                    const node = graph.getNode(cid);
                    if (node) {
                        events.emit('state:broadcast', node);
                    }
                });
            });

            // Listen for remote messages from peers
            events.on('state:remote-operation', (peerId: string, data: any) => {
                if (!data || typeof data !== 'object') return;

                // Dag protocol control messages are handled immediately, not
                // through the op queue below: a merge can block mid-queue
                // waiting on a 'dag:response' for a missing ancestor, and
                // that response itself arrives as a 'state:remote-operation'
                // event. Queuing it behind the blocked merge would deadlock.
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

                // Handle node broadcasts (full node data). These do mutate
                // shared graph/lamport state, so they're serialized with
                // local operations via the op queue.
                if (data.cid) {
                    enqueue(async () => {
                        isApplyingRemote = true;
                        try {
                            await graph.importNode(data);
                            await egWalker.mergeRemote(data.cid);
                        } catch (err) {
                            console.error('[MerkleEGWalker] Failed to merge remote node:', err);
                        }
                        isApplyingRemote = false;
                    });
                }
            });

            // Listen for destroy
            events.on('destroy', () => {
                dagSyncer.destroy();
            });
        },
    };
}
