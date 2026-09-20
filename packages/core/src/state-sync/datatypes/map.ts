import { AssetReferenceTracker } from '../asset/reference-tracker.ts';
import type { StateOperation } from '../types.ts';

export class MapWrapper<K, V> {
    private _store: Map<K, V>;
    private _emit: (op: StateOperation) => void;
    private _path: string[];
    private _assetTracker?: AssetReferenceTracker;

    constructor(
        initial: Map<K, V> = new Map(),
        emit: (op: StateOperation) => void,
        path: string[],
        assetTracker?: AssetReferenceTracker,
    ) {
        this._emit = emit;
        this._path = path;
        this._assetTracker = assetTracker;
        this._store = new Map(initial);
    }

    set(key: K, value: V) {
        const oldValue = this._store.get(key);
        const hadKey = this._store.has(key);

        this._emit({
            type: 'MAP_SET',
            path: [...this._path, String(key)],
            value: value,
            timestamp: Date.now(),
        });

        Map.prototype.set.apply(this._store, [key, value]);

        if (this._assetTracker) {
            if (hadKey) {
                void this._assetTracker.removeState(oldValue);
            }

            this._assetTracker.addState(value);
        }

        return this;
    }

    delete(key: K) {
        if (this._store.has(key)) {
            const oldValue = this._store.get(key);

            this._emit({
                type: 'MAP_DELETE',
                path: [...this._path, String(key)],
                value: key,
                timestamp: Date.now(),
            });

            const result = Map.prototype.delete.apply(this._store, [key]);

            if (this._assetTracker) {
                void this._assetTracker.removeState(oldValue);
            }

            return result;
        }

        return false;
    }

    clear() {
        this._emit({
            type: 'MAP_CLEAR',
            path: [...this._path],
            value: null,
            timestamp: Date.now(),
        });

        if (this._assetTracker) {
            for (const value of this._store.values()) {
                void this._assetTracker.removeState(value);
            }
        }

        return Map.prototype.clear.apply(this._store);
    }

    get(key: K) {
        return Map.prototype.get.apply(this._store, [key]);
    }

    has(key: K) {
        return Map.prototype.has.apply(this._store, [key]);
    }

    get size() {
        return this._store.size;
    }

    keys() {
        return Map.prototype.keys.apply(this._store);
    }

    values() {
        return Map.prototype.values.apply(this._store);
    }

    entries() {
        return Map.prototype.entries.apply(this._store);
    }

    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
        Map.prototype.forEach.call(this._store, callbackfn, thisArg);
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this._store[Symbol.iterator]();
    }

    get [Symbol.toStringTag]() {
        return 'Map';
    }

    __applyRemote(op: any) {
        switch (op.type) {
            case 'MAP_SET': {
                const key = op.key ?? op.path[op.path.length - 1];
                const oldValue = this._store.get(key);
                const hadKey = this._store.has(key);

                Map.prototype.set.apply(this._store, [key, op.value]);

                if (this._assetTracker) {
                    if (hadKey) {
                        void this._assetTracker.removeState(oldValue);
                    }

                    this._assetTracker.addState(op.value);
                }

                break;
            }

            case 'MAP_DELETE': {
                const key = op.key ?? op.path[op.path.length - 1];
                const oldValue = this._store.get(key);

                Map.prototype.delete.apply(this._store, [key]);

                if (this._assetTracker) {
                    void this._assetTracker.removeState(oldValue);
                }

                break;
            }

            case 'MAP_CLEAR': {
                if (this._assetTracker) {
                    for (const value of this._store.values()) {
                        void this._assetTracker.removeState(value);
                    }
                }

                Map.prototype.clear.apply(this._store);
                break;
            }
        }
    }
}

export function createMapWrapper<K, V>(
    initial: Map<K, V> = new Map(),
    emit: (op: StateOperation) => void,
    path: string[] = [],
    assetTracker?: AssetReferenceTracker,
) {
    return new MapWrapper<K, V>(initial, emit, path, assetTracker);
}
