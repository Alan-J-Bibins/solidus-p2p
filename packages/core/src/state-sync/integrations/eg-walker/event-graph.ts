import type { StateOperation } from '../../types.ts';
import type { EventNode } from './types.ts';

/** A plain event graph: event IDs are local sequence IDs, not content hashes. */
export class EventGraph {
    private nodes = new Map<string, EventNode>();
    private frontier = new Set<string>();
    private sequence = 0;

    async addNode(operation: StateOperation, parents: string[], lamport: number, peerId: string) {
        const cid = `${peerId}:${Date.now().toString(36)}:${++this.sequence}`;
        const node: EventNode = { cid, operation, parents: [...parents], lamport, peerId };
        this.nodes.set(cid, node);
        for (const parent of parents) this.frontier.delete(parent);
        this.frontier.add(cid);
        return cid;
    }

    async importNode(node: EventNode) {
        if (this.nodes.has(node.cid)) return true;
        this.nodes.set(node.cid, node);
        for (const parent of node.parents) this.frontier.delete(parent);
        const hasChildren = Array.from(this.nodes.values()).some((n) =>
            n.parents.includes(node.cid),
        );
        if (!hasChildren) this.frontier.add(node.cid);
        return true;
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
