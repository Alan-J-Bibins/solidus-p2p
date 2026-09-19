import { AssetReferenceTracker } from '../asset/reference-tracker.ts';
import type { StateOperation } from '../types.ts';

export class SetWrapper<T> {
    private _store: Set<T>;
    private _emit: (op: StateOperation) => void;
    private _path: string[];
    private _assetTracker?: AssetReferenceTracker;

    constructor(
        initial: Set<T> = new Set(),
        emit: (op: StateOperation) => void,
        path: string[],
        assetTracker?: AssetReferenceTracker,
    ) {
        this._emit = emit;
        this._path = path;
        this._assetTracker = assetTracker;
        this._store = new Set(initial);
    }

    add(value: T) {
        if (!this._store.has(value)) {
            this._emit({
                type: 'SET_ADD',
                path: [...this._path],
                value: value,
                timestamp: Date.now(),
            });

            Set.prototype.add.apply(this._store, [value]);

            if (this._assetTracker) {
                this._assetTracker.addState(value);
            }
        }

        return this;
    }

    delete(value: T) {
        if (this._store.has(value)) {
            this._emit({
                type: 'SET_REMOVE',
                path: [...this._path],
                value: value,
                timestamp: Date.now(),
            });

            const result = Set.prototype.delete.apply(this._store, [value]);

            if (this._assetTracker) {
                void this._assetTracker.removeState(value);
            }

            return result;
        }

        return false;
    }

    clear() {
        this._emit({
            type: 'SET_CLEAR',
            path: [...this._path],
            value: null,
            timestamp: Date.now(),
        });

        if (this._assetTracker) {
            for (const value of this._store) {
                void this._assetTracker.removeState(value);
            }
        }

        return Set.prototype.clear.apply(this._store);
    }

    has(value: T) {
        return Set.prototype.has.apply(this._store, [value]);
    }

    get size() {
        return this._store.size;
    }

    keys() {
        return Set.prototype.keys.apply(this._store);
    }

    values() {
        return Set.prototype.values.apply(this._store);
    }

    entries() {
        return Set.prototype.entries.apply(this._store);
    }

    forEach(callbackfn: (value: T, set: Set<T>) => void, thisArg?: any): void {
        Set.prototype.forEach.call(this._store, callbackfn, thisArg);
    }

    [Symbol.iterator](): IterableIterator<T> {
        return this._store[Symbol.iterator]();
    }

    get [Symbol.toStringTag]() {
        return 'Set';
    }

    __applyRemote(op: StateOperation) {
        switch (op.type) {
            case 'SET_ADD': {
                Set.prototype.add.apply(this._store, [op.value]);

                if (this._assetTracker) {
                    this._assetTracker.addState(op.value);
                }

                break;
            }

            case 'SET_REMOVE': {
                Set.prototype.delete.apply(this._store, [op.value]);

                if (this._assetTracker) {
                    void this._assetTracker.removeState(op.value);
                }

                break;
            }

            case 'SET_CLEAR': {
                if (this._assetTracker) {
                    for (const value of this._store) {
                        void this._assetTracker.removeState(value);
                    }
                }

                Set.prototype.clear.apply(this._store);
                break;
            }
        }
    }
}

export function createSetWrapper<T>(
    initial: Set<T> = new Set(),
    emit: (op: StateOperation) => void,
    path: string[] = [],
    assetTracker?: AssetReferenceTracker,
) {
    return new SetWrapper<T>(initial, emit, path, assetTracker);
}
