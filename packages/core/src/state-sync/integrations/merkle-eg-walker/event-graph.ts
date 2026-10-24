import type { MerkleEventNode } from './types.ts';
import { hash } from './utils.ts';

export class MerkleEventGraph {
    private nodes: Map<string, MerkleEventNode>;
    private frontier: Set<string>;

    constructor() {
        this.nodes = new Map<string, MerkleEventNode>();
        this.frontier = new Set<string>();
    }

    async addNode(operation: unknown, parents: string[], lamport: number, peerId: string) {
        const nodeContent = {
            operation: operation,
            parents: parents,
            lamport: lamport,
            peerId: peerId,
        };

        const cid = await hash(
            JSON.stringify(nodeContent, ['operation', 'parents', 'lamport', 'peerId']),
        );

        this.nodes.set(cid, {
            cid: cid,
            ...nodeContent,
        });

        for (const parentCid of parents) {
            this.frontier.delete(parentCid);
        }

        this.frontier.add(cid);

        return cid;
    }

    async importNode(node: MerkleEventNode) {
        const { cid: nodeCid, ...nodeContent } = node;

        const expectedCid = await hash(
            JSON.stringify(nodeContent, ['operation', 'parents', 'lamport', 'peerId']),
        );

        if (nodeCid !== expectedCid) {
            return false;
        }

        if (this.nodes.has(nodeCid)) {
            return true;
        }

        this.nodes.set(node.cid, node);

        for (const parentCid of node.parents) {
            this.frontier.delete(parentCid);
        }

        const hasChildren = Array.from(this.nodes.values()).some((n) =>
            n.parents.includes(node.cid),
        );

        if (!hasChildren) {
            this.frontier.add(node.cid);
        }
    }

    getFrontier() {
        return Array.from(this.frontier);
    }

    getNode(cid: string) {
        return this.nodes.get(cid);
    }

    hasNode(cid: string) {
        return this.nodes.has(cid);
    }
}
