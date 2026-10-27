import type { StateOperation } from '../../types.ts';

/** The original EG-Walker integration intentionally supports plain-object state only. */
export interface OperationHandler {
    apply(state: any, operation: StateOperation): void;
    transform(op: StateOperation, concurrentOp: StateOperation): StateOperation;
    hasConflict(op1: StateOperation, op2: StateOperation): boolean;
}

class PlainObjectHandler implements OperationHandler {
    apply(state: any, operation: StateOperation): void {
        const { path, type, value } = operation;
        if (path.length === 0) throw new Error(`EG-Walker requires a non-empty path for ${type}`);
        let parent = state;
        for (let i = 0; i < path.length - 1; i++) {
            parent = parent?.[path[i]];
            if (parent == null || typeof parent !== 'object') return;
        }
        if (
            parent == null ||
            typeof parent !== 'object' ||
            Array.isArray(parent) ||
            parent instanceof Map ||
            parent instanceof Set
        )
            return;
        const key = path[path.length - 1];
        switch (type) {
            case 'SET':
                parent[key] = value;
                break;
            case 'DELETE_PROPERTY':
                delete parent[key];
                break;
            case 'DEFINE_PROPERTY':
                Object.defineProperty(parent, key, value);
                break;
            default:
                throw new Error(`Unsupported operation type for plain-object EG-Walker: ${type}`);
        }
    }
    transform(op: StateOperation, _concurrentOp: StateOperation): StateOperation {
        return op;
    }
    hasConflict(op1: StateOperation, op2: StateOperation): boolean {
        return (
            op1.path.length === op2.path.length && op1.path.every((part, i) => part === op2.path[i])
        );
    }
}

/** Only object property operations are supported; arrays, Maps, and Sets are deliberately excluded. */
export class OperationHandlerRegistry {
    private readonly handler = new PlainObjectHandler();
    getHandler(operationType: string): OperationHandler {
        if (
            operationType === 'SET' ||
            operationType === 'DELETE_PROPERTY' ||
            operationType === 'DEFINE_PROPERTY'
        )
            return this.handler;
        throw new Error(`Unsupported operation type for plain-object EG-Walker: ${operationType}`);
    }
}
