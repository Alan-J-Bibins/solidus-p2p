import type { StateOperation } from '../../src/state-sync/types.ts';

export function makeTracker() {
    const ops: StateOperation[] = [];
    const trackOp = (op: StateOperation) => ops.push(op);
    return { ops, trackOp };
}
