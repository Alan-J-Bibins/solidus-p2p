import type { SolidusEvents, SolidusPlugin } from '../../../types.ts';
import type { StateOperation } from '../../types.ts';
import { EgWalker } from './eg-walker.ts';
import { EventGraph } from './event-graph.ts';
import type { EventNode } from './types.ts';

export interface EGWalkerOptions {
    peerId: string;
    initialState?: any;
}

export function egWalker(options: EGWalkerOptions): SolidusPlugin {
    let graph: EventGraph;
    let egWalker: EgWalker<any>;
    let isApplyingRemote = false;

    return {
        name: 'eg-walker',
        setup(events: SolidusEvents) {
            graph = new EventGraph();

            // Track pending node requests for the dagSyncer
            const pendingRequests = new Map<
                string,
                {
                    promise: Promise<EventNode>;
                    resolve: (node: EventNode) => void;
                    reject: (error: Error) => void;
                    timeout: ReturnType<typeof setTimeout>;
                }
            >();

            // Create a dagSyncer that uses the event bus instead of peerNetwork
            const dagSyncer = {
                getNode: async (cid: string): Promise<EventNode> => {
                    // Check if we already have it locally
                    const localNode = graph.getNode(cid);
                    if (localNode) return localNode;

                    // Check if we already have a pending request
                    const existing = pendingRequests.get(cid);
                    if (existing) return existing.promise;

                    // Create a promise that will be resolved when we receive the node
                    let resolve!: (node: EventNode) => void;
                    let reject!: (error: Error) => void;
                    const promise = new Promise<EventNode>((res, rej) => {
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
                sendNode: (peerId: string, node: EventNode) => {
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
                options.peerId,
                (state) => {
                    events.emit('state:remote-applied', state);
                },
            );

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
                        console.error('[EGWalker] Failed to merge remote node:', err);
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
