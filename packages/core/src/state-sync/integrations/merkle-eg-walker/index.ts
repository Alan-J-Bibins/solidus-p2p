import type { SolidusPlugin } from '../../../types.ts';
import { DagSyncer } from './dag-syncer.ts';
import { EgWalker } from './eg-walker.ts';
import { MerkleEventGraph } from './event-graph.ts';

export function merkleEGWalker(): SolidusPlugin {
    let graph: MerkleEventGraph;
    let dagSyncer: DagSyncer;

    return {
        name: 'merkle-eg-walker',
        setup: (events) => {
            // Initialize the MerkleEventGraph
            graph = new MerkleEventGraph();
            const egwalker = new EgWalker(graph, dagSyncer, {}, '');
            console.log(egwalker);

            // Listen for when a peer requests a node from us
            events.on(
                'dag:node-requested',
                async ({ cid, peerId }: { cid: string; peerId: string }) => {
                    const node = graph.getNode(cid);
                    if (node && dagSyncer) {
                        // Send the node back to the requesting peer
                        dagSyncer.sendNode(peerId, node);
                    }
                },
            );

            // Listen for when a peer announces they have a new node
            events.on('dag:node-announced', async ({ cid }: { cid: string; peerId: string }) => {
                // Check if we already have this node
                if (!graph.hasNode(cid) && dagSyncer) {
                    try {
                        // Fetch the node from the peer
                        const node = await dagSyncer.getNode(cid);
                        // Import it into our local graph
                        await graph.importNode(node);
                        console.log('[MerkleEGWalker] Imported node:', cid);
                    } catch (err) {
                        console.error('[MerkleEGWalker] Failed to fetch node:', cid, err);
                    }
                }
            });
        },
        provides: ['merkle-event-graph', 'dag-syncer'],
        create: (type, options, events) => {
            if (type === 'merkle-event-graph') {
                return graph;
            }

            if (type === 'dag-syncer') {
                // The peer-network resource is provided by the networking plugin
                // We need to get it from the events or resources
                // For now, we'll create the DagSyncer when we have access to peerNetwork
                if (!dagSyncer) {
                    // This will be called when the user creates a dag-syncer resource
                    // They need to pass the peerNetwork handle
                    const peerNetwork = options.config?.peerNetwork;
                    if (!peerNetwork) {
                        throw new Error(
                            '[merkle-eg-walker] dag-syncer requires config.peerNetwork',
                        );
                    }
                    dagSyncer = new DagSyncer(events, peerNetwork);
                }
                return dagSyncer;
            }

            return undefined;
        },
    };
}
