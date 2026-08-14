import type { StateOperation } from '../types.ts';

export class SetWrapper<T> {
    private _store: Set<T>;
    private _emit: (op: StateOperation) => void;
    private _path: string[];

    constructor(initial: Set<T> = new Set(), emit: (op: StateOperation) => void, path: string[]) {
        this._emit = emit;
        this._path = path;
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
        }
        return this; // Always return for chaining
    }

    delete(value: T) {
        if (this._store.has(value)) {
            this._emit({
                type: 'SET_REMOVE',
                path: [...this._path],
                value: value,
                timestamp: Date.now(),
            });

            return Set.prototype.delete.apply(this._store, [value]);
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
                break;
            }
            case 'SET_REMOVE': {
                Set.prototype.delete.apply(this._store, [op.value]);
                break;
            }
            case 'SET_CLEAR': {
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
) {
    return new SetWrapper<T>(initial, emit, path);
}
