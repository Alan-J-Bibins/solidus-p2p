import type { StateOperation } from './types.ts';

/**
 * Applies a StateOperation directly onto a raw (non-proxied) object, so the
 * local createState() Proxy's traps don't re-fire and re-broadcast the same
 * operation back out (which would cause an infinite echo between peers).
 */
export function applyOperation(target: any, op: StateOperation): void {
    const { path, type, value } = op;

    if (path.length === 0) {
        // Root-level ops (PREVENT_EXTENSIONS / SET_PROTOTYPE_OF) aren't keyed to
        // a specific property — intentionally not replayed remotely.
        return;
    }

    let node = target;
    for (let i = 0; i < path.length - 1; i++) {
        node = node?.[path[i]];
        if (node == null) return; // remote path no longer exists locally — drop it
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
        default:
            break;
    }
}
