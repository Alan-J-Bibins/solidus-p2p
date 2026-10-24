import type { StateOperation } from '../../types.ts';
import { DagSyncer } from './dag-syncer.ts';
import { MerkleEventGraph } from './event-graph.ts';

export class EgWalker<TState> {
    graph: MerkleEventGraph;
    dagSyncer: DagSyncer;
    state: TState;
    lamportCounter: number;
    peerId: string;

    constructor(graph: MerkleEventGraph, dagSyncer: DagSyncer, state: TState, peerId: string) {
        this.graph = graph;
        this.dagSyncer = dagSyncer;
        this.state = state;
        // FIX: Pretty sure this should take the last event's lamport counter to properly be in sync next time the client comes online
        // Perhaps get the frontier nodes and take the latest Lamport from them?
        this.lamportCounter = 0;
        this.peerId = peerId;
    }

    getState() {
        return this.state;
    }

    setState(state: TState) {
        this.state = state;
    }

    async applyLocal(operation: StateOperation) {
        const { path, type, value } = operation;

        if (path.length === 0) {
            return;
        }

        let node = this.state as any;
        for (let i = 0; i < path.length - 1; i++) {
            node = node?.[path[i]];
            if (node == null) return;
        }

        const key = path[path.length - 1];

        switch (type) {
            case 'SET':
                node[key] = value;
                break;
            case 'DELETE_PROPERTY':
                delete node[key];
                break;
            case 'DEFINE_PROPERTY':
                Object.defineProperty(node, key, value);
                break;

            case 'ARRAY_INSERT':
                if (Array.isArray(node)) {
                    node.splice(Number(key), 0, value);
                }
                break;
            case 'ARRAY_DELETE':
                if (Array.isArray(node)) {
                    node.splice(Number(key), 1);
                }
                break;
            case 'ARRAY_UPDATE':
                if (Array.isArray(node)) {
                    node[Number(key)] = value;
                }
                break;
            case 'ARRAY_RESIZE':
                if (Array.isArray(node)) {
                    node.length = value as number;
                }
                break;
            case 'ARRAY_REPLACE':
                if (Array.isArray(node)) {
                    node.splice(0, node.length, ...(value as any[]));
                }
                break;

            case 'MAP_SET':
                if (node instanceof Map) {
                    node.set(key, value);
                }
                break;
            case 'MAP_DELETE':
                if (node instanceof Map) {
                    node.delete(key);
                }
                break;
            case 'MAP_CLEAR':
                if (node instanceof Map) {
                    node.clear();
                }
                break;

            case 'SET_ADD':
                if (node instanceof Set) {
                    node.add(value);
                }
                break;
            case 'SET_REMOVE':
                if (node instanceof Set) {
                    node.delete(value);
                }
                break;
            case 'SET_CLEAR':
                if (node instanceof Set) {
                    node.clear();
                }
                break;

            case 'GET':
            case 'HAS':
            case 'OWN_KEYS':
            case 'GET_OWN_PROPERTY_DESCRIPTOR':
            case 'IS_EXTENSIBLE':
            case 'GET_PROTOTYPE_OF':
                break;

            case 'PREVENT_EXTENSIONS':
            case 'SET_PROTOTYPE_OF':
            case 'APPLY':
            case 'CONSTRUCT':
                break;

            default:
                break;
        }

        this.lamportCounter++;

        const parents = this.graph.getFrontier();
        await this.graph.addNode(operation, parents, this.lamportCounter, this.peerId);
    }

    private async findLCA(frontier: string[], remoteCid: string): Promise<string> {
        const localQueue = [...frontier];
        const remoteQueue = [remoteCid];

        const localVisited = new Set<string>();
        const remoteVisited = new Set<string>();

        while (localQueue.length > 0 || remoteQueue.length > 0) {
            if (localQueue.length > 0) {
                const current = localQueue.shift()!;

                if (remoteVisited.has(current)) {
                    return current;
                }

                localVisited.add(current);

                const node = this.graph.getNode(current);
                if (node) {
                    localQueue.push(...node.parents);
                }
            }

            if (remoteQueue.length > 0) {
                const current = remoteQueue.shift()!;

                if (localVisited.has(current)) {
                    return current;
                }

                remoteVisited.add(current);

                let node = this.graph.getNode(current);
                if (!node) {
                    node = await this.dagSyncer.getNode(current);
                    await this.graph.importNode(node);
                }

                remoteQueue.push(...node.parents);
            }
        }

        throw new Error('No common ancestor found');
    }

    private getOperationsBetween(startCids: string[], endCids: string[]) {
        const operations: unknown[] = [];
        const visited = new Set<string>(endCids);
        const queue = [...startCids];

        while (queue.length > 0) {
            const current = queue.shift()!;

            if (visited.has(current)) continue;
            visited.add(current);

            const node = this.graph.getNode(current);
            if (!node) continue;

            operations.push(node.operation);

            queue.push(...node.parents);
        }

        return operations;
    }

    async mergeRemote(remoteCid: string) {
        if (!this.graph.hasNode(remoteCid)) {
            const node = await this.dagSyncer.getNode(remoteCid);
            await this.graph.importNode(node);

            for (const parentCid of node.parents) {
                if (!this.graph.hasNode(parentCid)) {
                    await this.mergeRemote(parentCid);
                }
            }
        }

        const frontiers = this.graph.getFrontier();
        const lca = await this.findLCA(frontiers, remoteCid);
        const operationsList = this.getOperationsBetween(frontiers, [...lca]);
        console.log(operationsList);
    }
}
