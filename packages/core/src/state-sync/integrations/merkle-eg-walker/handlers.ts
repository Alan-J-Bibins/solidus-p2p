import type { StateOperation } from '../../types.ts';

/**
 * Interface for CRDT operation handlers.
 * Each data type (array, map, set, etc.) implements this interface
 * to define how operations are applied and transformed.
 */
export interface OperationHandler {
    /**
     * Apply an operation to the state
     */
    apply(state: any, operation: StateOperation): void;

    /**
     * Transform an operation relative to a concurrent operation.
     * Returns the transformed operation that can be safely applied
     * after the concurrent operation has been applied.
     */
    transform(op: StateOperation, concurrentOp: StateOperation): StateOperation;

    /**
     * Check if two operations conflict (need transformation)
     */
    hasConflict(op1: StateOperation, op2: StateOperation): boolean;
}

/**
 * Handler for array operations (text, sequences)
 */
export class ArrayHandler implements OperationHandler {
    apply(state: any, operation: StateOperation): void {
        const { path, type, value } = operation;

        // ARRAY_INSERT/DELETE/UPDATE address an element: path's last segment
        // is the index, and everything before it locates the array. But
        // ARRAY_RESIZE/ARRAY_REPLACE (length=, sort, reverse, fill, clear())
        // address the whole array itself: path's last segment is the
        // array's own key in its parent, not an index. One extra level of
        // navigation is needed to reach the actual array in that case.
        const isWholeArrayOp = type === 'ARRAY_RESIZE' || type === 'ARRAY_REPLACE';

        let node = state;
        for (let i = 0; i < path.length - 1; i++) {
            node = node?.[path[i]];
            if (node == null) return;
        }

        const key = path[path.length - 1];

        if (isWholeArrayOp) {
            node = node?.[key];
        }

        // Use __applyRemote if available (for proxied arrays)
        if (node?.__applyRemote) {
            node.__applyRemote(operation);
            return;
        }

        // Fallback for raw arrays
        if (!Array.isArray(node)) return;

        switch (type) {
            case 'ARRAY_INSERT':
                node.splice(Number(key), 0, value);
                break;
            case 'ARRAY_DELETE':
                node.splice(Number(key), 1);
                break;
            case 'ARRAY_UPDATE':
                node[Number(key)] = value;
                break;
            case 'ARRAY_RESIZE':
                node.length = value as number;
                break;
            case 'ARRAY_REPLACE':
                node.splice(0, node.length, ...(value as any[]));
                break;
        }
    }

    transform(op: StateOperation, concurrentOp: StateOperation): StateOperation {
        if (!this.containerPathsEqual(op.path, concurrentOp.path)) {
            return op;
        }

        const opIndex = Number(op.path[op.path.length - 1]);
        const concurrentIndex = Number(concurrentOp.path[concurrentOp.path.length - 1]);

        let adjustedIndex = opIndex;

        if (concurrentOp.type === 'ARRAY_INSERT' && concurrentIndex < opIndex) {
            adjustedIndex++;
        } else if (concurrentOp.type === 'ARRAY_DELETE' && concurrentIndex < opIndex) {
            adjustedIndex--;
        }

        const newPath = [...op.path.slice(0, -1), String(adjustedIndex)];
        return { ...op, path: newPath };
    }

    hasConflict(op1: StateOperation, op2: StateOperation): boolean {
        if (!this.containerPathsEqual(op1.path, op2.path)) {
            return false;
        }

        const index1 = Number(op1.path[op1.path.length - 1]);
        const index2 = Number(op2.path[op2.path.length - 1]);

        return Math.abs(index1 - index2) <= 1;
    }

    /**
     * Compare container paths (everything except the last element which is the index)
     */
    private containerPathsEqual(path1: string[], path2: string[]): boolean {
        const container1 = path1.slice(0, -1);
        const container2 = path2.slice(0, -1);

        if (container1.length !== container2.length) return false;
        for (let i = 0; i < container1.length; i++) {
            if (container1[i] !== container2[i]) return false;
        }
        return true;
    }
}

/**
 * Handler for Map operations (key-value stores)
 */
export class MapHandler implements OperationHandler {
    apply(state: any, operation: StateOperation): void {
        const { path, type, value } = operation;

        const isClearOp = type === 'MAP_CLEAR';
        const navigateTo = isClearOp ? path.length : path.length - 1;

        let node = state;
        for (let i = 0; i < navigateTo; i++) {
            node = node?.[path[i]];
            if (node == null) return;
        }

        // Use __applyRemote if available (for proxied maps)
        if (node?.__applyRemote) {
            node.__applyRemote(operation);
            return;
        }

        // Fallback for raw maps
        if (!(node instanceof Map)) return;

        switch (type) {
            case 'MAP_SET': {
                const key = path[path.length - 1];
                node.set(key, value);
                break;
            }
            case 'MAP_DELETE': {
                const key = path[path.length - 1];
                node.delete(key);
                break;
            }
            case 'MAP_CLEAR':
                node.clear();
                break;
        }
    }

    transform(op: StateOperation, _concurrentOp: StateOperation): StateOperation {
        return op;
    }

    hasConflict(op1: StateOperation, op2: StateOperation): boolean {
        if (!this.pathsEqual(op1.path, op2.path)) {
            return false;
        }

        return true;
    }

    private pathsEqual(path1: string[], path2: string[]): boolean {
        if (path1.length !== path2.length) return false;
        for (let i = 0; i < path1.length; i++) {
            if (path1[i] !== path2[i]) return false;
        }
        return true;
    }
}

/**
 * Handler for Set operations
 */
export class SetHandler implements OperationHandler {
    apply(state: any, operation: StateOperation): void {
        const { path, type, value } = operation;

        let node = state;
        for (let i = 0; i < path.length; i++) {
            node = node?.[path[i]];
            if (node == null) return;
        }

        // Use __applyRemote if available (for proxied sets)
        if (node?.__applyRemote) {
            node.__applyRemote(operation);
            return;
        }

        // Fallback for raw sets
        if (!(node instanceof Set)) return;

        switch (type) {
            case 'SET_ADD':
                node.add(value);
                break;
            case 'SET_REMOVE':
                node.delete(value);
                break;
            case 'SET_CLEAR':
                node.clear();
                break;
        }
    }

    transform(op: StateOperation, _concurrentOp: StateOperation): StateOperation {
        return op;
    }

    hasConflict(_op1: StateOperation, _op2: StateOperation): boolean {
        return false;
    }
}

/**
 * Handler for plain object property operations
 */
export class ObjectHandler implements OperationHandler {
    apply(state: any, operation: StateOperation): void {
        const { path, type, value } = operation;

        let node = state;
        for (let i = 0; i < path.length - 1; i++) {
            node = node?.[path[i]];
            if (node == null) return;
        }

        // Use __applyRemote if available (for proxied objects)
        if (node?.__applyRemote) {
            node.__applyRemote(operation);
            return;
        }

        // Fallback for raw objects
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
        }
    }

    transform(op: StateOperation, _concurrentOp: StateOperation): StateOperation {
        return op;
    }

    hasConflict(op1: StateOperation, op2: StateOperation): boolean {
        if (!this.pathsEqual(op1.path, op2.path)) {
            return false;
        }

        return true;
    }

    private pathsEqual(path1: string[], path2: string[]): boolean {
        if (path1.length !== path2.length) return false;
        for (let i = 0; i < path1.length; i++) {
            if (path1[i] !== path2[i]) return false;
        }
        return true;
    }
}

/**
 * Registry that maps operation types to their handlers
 */
export class OperationHandlerRegistry {
    private handlers: Map<string, OperationHandler> = new Map();

    constructor() {
        const arrayHandler = new ArrayHandler();
        const mapHandler = new MapHandler();
        const setHandler = new SetHandler();
        const objectHandler = new ObjectHandler();

        this.handlers.set('ARRAY_INSERT', arrayHandler);
        this.handlers.set('ARRAY_DELETE', arrayHandler);
        this.handlers.set('ARRAY_UPDATE', arrayHandler);
        this.handlers.set('ARRAY_RESIZE', arrayHandler);
        this.handlers.set('ARRAY_REPLACE', arrayHandler);

        this.handlers.set('MAP_SET', mapHandler);
        this.handlers.set('MAP_DELETE', mapHandler);
        this.handlers.set('MAP_CLEAR', mapHandler);

        this.handlers.set('SET_ADD', setHandler);
        this.handlers.set('SET_REMOVE', setHandler);
        this.handlers.set('SET_CLEAR', setHandler);

        this.handlers.set('SET', objectHandler);
        this.handlers.set('DELETE_PROPERTY', objectHandler);
        this.handlers.set('DEFINE_PROPERTY', objectHandler);
    }

    getHandler(operationType: string): OperationHandler {
        const handler = this.handlers.get(operationType);
        if (!handler) {
            throw new Error(`No handler registered for operation type: ${operationType}`);
        }
        return handler;
    }

    registerHandler(operationType: string, handler: OperationHandler): void {
        this.handlers.set(operationType, handler);
    }
}
