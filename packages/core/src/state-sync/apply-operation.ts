import { AssetReferenceTracker } from './asset/reference-tracker.ts';
import type { StateOperation } from './types.ts';

/**
 * Applies a StateOperation directly onto a raw (non-proxied) object, so the
 * local createState() Proxy's traps don't re-fire and re-broadcast the same
 * operation back out (which would cause an infinite echo between peers).
 */
export function applyOperation(
    target: any,
    op: StateOperation,
    assetTracker?: AssetReferenceTracker,
): void {
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
        case 'SET': {
            const oldValue = node[key];
            node[key] = value;
            if (assetTracker) {
                void assetTracker.removeState(oldValue);
                assetTracker.addState(value);
            }
            break;
        }
        case 'DELETE_PROPERTY': {
            const oldValue = node[key];
            delete node[key];
            if (assetTracker) {
                void assetTracker.removeState(oldValue);
            }
            break;
        }
        case 'DEFINE_PROPERTY': {
            const oldValue = node[key];
            Object.defineProperty(node, key, value);
            if (assetTracker) {
                void assetTracker.removeState(oldValue);
                assetTracker.addState(value?.value);
            }
            break;
        }
        case 'ARRAY_INSERT':
            if (Array.isArray(node)) {
                node.splice(Number(key), 0, value);
                assetTracker?.addState(value);
            }
            break;
        case 'ARRAY_DELETE':
            if (Array.isArray(node)) {
                const oldValue = node[Number(key)];
                node.splice(Number(key), 1);
                if (assetTracker) void assetTracker.removeState(oldValue);
            }
            break;
        case 'ARRAY_UPDATE':
            if (Array.isArray(node)) {
                const index = Number(key);
                const oldValue = node[index];
                node[index] = value;
                if (assetTracker) {
                    void assetTracker.removeState(oldValue);
                    assetTracker.addState(value);
                }
            }
            break;
        case 'ARRAY_RESIZE':
            if (Array.isArray(node)) {
                node.length = value as number;
            }
            break;
        case 'ARRAY_REPLACE':
            if (Array.isArray(node)) {
                const oldValues = [...node];
                node.splice(0, node.length, ...(value as any[]));
                if (assetTracker) {
                    for (const oldValue of oldValues) void assetTracker.removeState(oldValue);
                    for (const newValue of node) assetTracker.addState(newValue);
                }
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
        default:
            break;
    }
}
