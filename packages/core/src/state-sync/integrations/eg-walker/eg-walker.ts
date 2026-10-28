import type { StateOperation } from '../../types.ts';
import type { DagSyncer } from './dag-syncer.ts';
import { EventGraph } from './event-graph.ts';
import { OperationHandlerRegistry } from './handlers.ts';

/**
 * Internal state for tracking prepare and effect versions during merge.
 * This is a temporary CRDT structure used only during merge operations.
 * Based on the Eg-walker algorithm's prepare/effect version tracking.
 */
class InternalState<TState> {
    private prepareVersion: Set<string>;
    private effectVersion: Set<string>;
    private effectState: TState;
    private prepareState: TState;
    private readonly baselineState: TState;
    private appliedOps: Map<string, StateOperation>;
    private handlerRegistry: OperationHandlerRegistry;

    constructor(initialState: TState, handlerRegistry: OperationHandlerRegistry) {
        this.prepareVersion = new Set();
        this.effectVersion = new Set();
        this.effectState = this.cloneState(initialState);
        this.baselineState = this.cloneState(initialState);
        this.prepareState = this.cloneState(initialState);
        this.appliedOps = new Map();
        this.handlerRegistry = handlerRegistry;
    }

    /**
     * Deep clone a state structure
     */
    private cloneState(state: any): any {
        if (state === null || state === undefined) {
            return state;
        }
        if (state instanceof Map) {
            return new Map(Array.from(state.entries()).map(([k, v]) => [k, this.cloneState(v)]));
        }
        if (state instanceof Set) {
            return new Set(Array.from(state).map((v) => this.cloneState(v)));
        }
        if (Array.isArray(state)) {
            return state.map((v) => this.cloneState(v));
        }
        if (typeof state === 'object') {
            const cloned: any = {};
            for (const key in state) {
                if (Object.prototype.hasOwnProperty.call(state, key)) {
                    cloned[key] = this.cloneState(state[key]);
                }
            }
            return cloned;
        }
        return state;
    }

    getState(): TState {
        return this.effectState;
    }

    /**
     * Apply an event to both prepare and effect versions.
     * Returns the transformed operation to apply to the document.
     */
    apply(cid: string, operation: StateOperation): StateOperation {
        this.prepareVersion.add(cid);
        this.effectVersion.add(cid);
        this.appliedOps.set(cid, operation);

        // Apply to both states
        const handler = this.handlerRegistry.getHandler(operation.type);
        handler.apply(this.prepareState, operation);
        handler.apply(this.effectState, operation);

        return operation;
    }

    /**
     * Remove an event from prepare version (move backwards)
     * This undoes the effect of the event on the prepare version
     */
    retreat(cid: string): void {
        if (this.prepareVersion.has(cid)) {
            this.prepareVersion.delete(cid);

            // Rebuild prepare state from scratch based on current prepare version
            this.rebuildPrepareState();
        }
    }

    /**
     * Add an event to prepare version (move forwards)
     * This only works if the event is already in the effect version
     */
    advance(cid: string): void {
        if (this.effectVersion.has(cid) && !this.prepareVersion.has(cid)) {
            this.prepareVersion.add(cid);

            // Rebuild prepare state from scratch based on current prepare version
            this.rebuildPrepareState();
        }
    }

    /**
     * Rebuild the prepare state based on which operations are in the prepare version
     */
    private rebuildPrepareState(): void {
        // Reconstruct from the merge baseline, then replay only events in prepareVersion.
        this.prepareState = this.cloneState(this.baselineState);
        const opsInPrepare = Array.from(this.prepareVersion)
            .map((cid) => ({ cid, op: this.appliedOps.get(cid) }))
            .filter((entry): entry is { cid: string; op: StateOperation } => entry.op !== undefined)
            .sort((a, b) => a.op.timestamp - b.op.timestamp || a.cid.localeCompare(b.cid));
        for (const { op } of opsInPrepare) {
            this.handlerRegistry.getHandler(op.type).apply(this.prepareState, op);
        }
    }

    /**
     * Adjust prepare version to match a target set of parent events
     */
    adjustPrepareVersion(
        targetParents: string[],
        allOps: Array<{ cid: string; parents: string[] }>,
    ): void {
        const eventMap = new Map<string, { cid: string; parents: string[] }>();
        for (const op of allOps) {
            eventMap.set(op.cid, op);
        }

        const targetAncestors = new Set<string>();
        const queue = [...targetParents];
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (targetAncestors.has(current)) continue;
            targetAncestors.add(current);

            const event = eventMap.get(current);
            if (event) {
                queue.push(...event.parents);
            }
        }

        const currentAncestors = new Set<string>();
        const currentQueue = Array.from(this.prepareVersion);
        while (currentQueue.length > 0) {
            const current = currentQueue.shift()!;
            if (currentAncestors.has(current)) continue;
            currentAncestors.add(current);

            const event = eventMap.get(current);
            if (event) {
                currentQueue.push(...event.parents);
            }
        }

        const toRetreat = Array.from(currentAncestors).filter((c) => !targetAncestors.has(c));
        const toAdvance = Array.from(targetAncestors).filter((c) => !currentAncestors.has(c));

        for (const cid of toRetreat.reverse()) {
            this.retreat(cid);
        }

        for (const cid of toAdvance) {
            this.advance(cid);
        }
    }

    /**
     * Check if an event is in the prepare version
     */
    isInPrepare(cid: string): boolean {
        return this.prepareVersion.has(cid);
    }

    /**
     * Check if an event is in the effect version
     */
    isInEffect(cid: string): boolean {
        return this.effectVersion.has(cid);
    }
}

export class EgWalker<TState> {
    graph: EventGraph;
    dagSyncer: DagSyncer;
    state: TState;
    private initialState: TState;
    lamportCounter: number;
    peerId: string;
    handlerRegistry: OperationHandlerRegistry;
    private onRemoteApplied?: (state: TState) => void;

    constructor(
        graph: EventGraph,
        dagSyncer: DagSyncer,
        state: TState,
        peerId: string,
        onRemoteApplied?: (state: TState) => void,
    ) {
        this.graph = graph;
        this.dagSyncer = dagSyncer;
        this.state = state;
        this.initialState = this.cloneState(state);
        this.lamportCounter = 0;
        this.peerId = peerId;
        this.handlerRegistry = new OperationHandlerRegistry();
        this.onRemoteApplied = onRemoteApplied;
    }

    getState() {
        return this.state;
    }

    setState(state: TState) {
        this.state = state;
        this.initialState = this.cloneState(state);
    }

    async applyLocal(operation: StateOperation) {
        const handler = this.handlerRegistry.getHandler(operation.type);
        handler.apply(this.state, operation);
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
        const operations: Array<{
            cid: string;
            operation: StateOperation;
            lamport: number;
            parents: string[];
        }> = [];
        const visited = new Set<string>(endCids);
        const queue = [...startCids];

        while (queue.length > 0) {
            const current = queue.shift()!;

            if (visited.has(current)) continue;
            visited.add(current);

            const node = this.graph.getNode(current);
            if (!node) continue;

            operations.push({
                cid: node.cid,
                operation: node.operation,
                lamport: node.lamport,
                parents: node.parents,
            });

            queue.push(...node.parents);
        }

        return operations;
    }

    /**
     * Get all operations from root to a specific node (inclusive)
     */
    private getAllOperationsTo(targetCid: string) {
        return this.getOperationsBetween([targetCid], []);
    }

    /**
     * Check if two operations are concurrent (neither is an ancestor of the other)
     */
    private isConcurrent(cid1: string, cid2: string): boolean {
        return !this.isAncestor(cid1, cid2) && !this.isAncestor(cid2, cid1);
    }

    /**
     * Check if ancestorCid is an ancestor of descendantCid
     */
    private isAncestor(ancestorCid: string, descendantCid: string): boolean {
        const visited = new Set<string>();
        const queue = [descendantCid];

        while (queue.length > 0) {
            const current = queue.shift()!;

            if (current === ancestorCid) {
                return true;
            }

            if (visited.has(current)) continue;
            visited.add(current);

            const node = this.graph.getNode(current);
            if (node) {
                queue.push(...node.parents);
            }
        }

        return false;
    }

    /**
     * Deep clone a state structure, preserving Maps, Sets, Arrays, and plain objects
     */
    private cloneState(state: any): any {
        if (state === null || state === undefined) {
            return state;
        }
        if (state instanceof Map) {
            return new Map(Array.from(state.entries()).map(([k, v]) => [k, this.cloneState(v)]));
        }
        if (state instanceof Set) {
            return new Set(Array.from(state).map((v) => this.cloneState(v)));
        }
        if (Array.isArray(state)) {
            return state.map((v) => this.cloneState(v));
        }
        if (typeof state === 'object') {
            const cloned: any = {};
            for (const key in state) {
                if (Object.prototype.hasOwnProperty.call(state, key)) {
                    cloned[key] = this.cloneState(state[key]);
                }
            }
            return cloned;
        }
        return state;
    }

    /**
     * Rebuild state from a specific point in the DAG by replaying all operations from root
     */
    private async rebuildStateFromLCA(lcaCid: string): Promise<TState> {
        const opsToLCA = this.getAllOperationsTo(lcaCid);
        opsToLCA.sort((a, b) => a.lamport - b.lamport);

        // Replay from the immutable baseline; cloning current state would apply ancestors twice.
        const freshState = this.cloneState(this.initialState) as TState;

        for (const op of opsToLCA) {
            const handler = this.handlerRegistry.getHandler(op.operation.type);
            handler.apply(freshState, op.operation);
        }
        return freshState;
    }

    /**
     * Topologically sort events, keeping branches consecutive
     */
    private topologicalSort(
        events: Array<{
            cid: string;
            operation: StateOperation;
            lamport: number;
            parents: string[];
        }>,
    ): typeof events {
        const sorted: typeof events = [];
        const visited = new Set<string>();

        const childrenMap = new Map<string, string[]>();
        for (const event of events) {
            for (const parent of event.parents) {
                if (!childrenMap.has(parent)) {
                    childrenMap.set(parent, []);
                }
                childrenMap.get(parent)!.push(event.cid);
            }
        }

        const eventCids = new Set(events.map((e) => e.cid));
        const roots = events.filter((e) => !e.parents.some((p) => eventCids.has(p)));
        const dfs = (cid: string) => {
            if (visited.has(cid)) return;
            visited.add(cid);

            const event = events.find((e) => e.cid === cid);
            if (event) {
                sorted.push(event);
            }

            const children = childrenMap.get(cid) || [];
            for (const child of children) {
                dfs(child);
            }
        };

        for (const root of roots) {
            dfs(root.cid);
        }

        return sorted;
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

        const frontier = this.graph.getFrontier();
        const lca = await this.findLCA(frontier, remoteCid);
        const localOps = this.getOperationsBetween(frontier, [lca]);
        const remoteOps = this.getOperationsBetween([remoteCid], [lca]);
        const allOps = [...localOps, ...remoteOps];
        const sortedOps = this.topologicalSort(allOps);
        const lcaState = await this.rebuildStateFromLCA(lca);
        const internalState = new InternalState(lcaState, this.handlerRegistry);

        for (const op of sortedOps) {
            internalState.adjustPrepareVersion(op.parents, allOps);

            let transformedOp = op.operation;
            for (const prevOp of sortedOps) {
                if (prevOp.lamport >= op.lamport) break;

                if (this.isConcurrent(op.cid, prevOp.cid)) {
                    const handler = this.handlerRegistry.getHandler(transformedOp.type);

                    if (handler.hasConflict(transformedOp, prevOp.operation)) {
                        transformedOp = handler.transform(transformedOp, prevOp.operation);
                    }
                }
            }

            // InternalState.apply applies the transformed operation to both versions.
            // Applying it to effectState here as well would duplicate every operation.
            internalState.apply(op.cid, transformedOp);
        }

        this.state = internalState.getState();

        const maxLamport = Math.max(...allOps.map((op) => op.lamport), this.lamportCounter);
        this.lamportCounter = maxLamport;

        // Emit event to notify that remote operations have been applied
        if (this.onRemoteApplied) {
            this.onRemoteApplied(this.state);
        }
    }
}
