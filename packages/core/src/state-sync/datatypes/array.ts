import type { StateOperation } from '../types.ts';

export class ArrayWrapper<T> {
    private _store: T[];
    private _emit: (op: StateOperation) => void;
    private _path: string[];

    constructor(initial: T[] = [], emit: (op: StateOperation) => void, path: string[]) {
        this._emit = emit;
        this._path = path;
        this._store = [...initial];
    }

    get raw(): T[] {
        return this._store;
    }

    get path(): string[] {
        return this._path;
    }

    get length(): number {
        return this._store.length;
    }

    push(...items: T[]): number {
        const start = this._store.length;
        const now = Date.now();
        for (let i = 0; i < items.length; i++) {
            this._emit({
                type: 'ARRAY_INSERT',
                path: [...this._path, String(start + i)],
                value: items[i],
                timestamp: now,
            });
        }
        return Array.prototype.push.apply(this._store, items);
    }

    pop(): T | undefined {
        if (this._store.length === 0) return undefined;
        const idx = this._store.length - 1;
        const value = this._store[idx];
        this._emit({
            type: 'ARRAY_DELETE',
            path: [...this._path, String(idx)],
            value,
            timestamp: Date.now(),
        });
        return Array.prototype.pop.call(this._store);
    }

    shift(): T | undefined {
        if (this._store.length === 0) return undefined;
        const value = this._store[0];
        this._emit({
            type: 'ARRAY_DELETE',
            path: [...this._path, '0'],
            value,
            timestamp: Date.now(),
        });
        return Array.prototype.shift.call(this._store);
    }

    unshift(...items: T[]): number {
        const now = Date.now();
        for (let i = 0; i < items.length; i++) {
            this._emit({
                type: 'ARRAY_INSERT',
                path: [...this._path, String(i)],
                value: items[i],
                timestamp: now,
            });
        }
        return Array.prototype.unshift.apply(this._store, items);
    }

    splice(start: number, deleteCount?: number, ...items: T[]): T[] {
        const len = this._store.length;
        const actualStart = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
        const actualDelete = deleteCount ?? len - actualStart;
        const now = Date.now();

        // Snapshot the values being removed BEFORE the mutation
        const removed = this._store.slice(actualStart, actualStart + actualDelete);

        for (let i = 0; i < removed.length; i++) {
            this._emit({
                type: 'ARRAY_DELETE',
                path: [...this._path, String(actualStart)],
                value: removed[i],
                timestamp: now,
            });
        }
        for (let i = 0; i < items.length; i++) {
            this._emit({
                type: 'ARRAY_INSERT',
                path: [...this._path, String(actualStart + i)],
                value: items[i],
                timestamp: now,
            });
        }
        return Array.prototype.splice.apply(this._store, [
            actualStart,
            actualDelete,
            ...items,
        ] as any);
    }

    sort(compareFn?: (a: T, b: T) => number): T[] {
        Array.prototype.sort.call(this._store, compareFn);
        this._emit({
            type: 'ARRAY_REPLACE',
            path: this._path,
            value: [...this._store],
            timestamp: Date.now(),
        });
        return this._store;
    }

    reverse(): T[] {
        Array.prototype.reverse.call(this._store);
        this._emit({
            type: 'ARRAY_REPLACE',
            path: this._path,
            value: [...this._store],
            timestamp: Date.now(),
        });
        return this._store;
    }

    fill(value: T, start?: number, end?: number): T[] {
        Array.prototype.fill.call(this._store, value, start, end);
        this._emit({
            type: 'ARRAY_REPLACE',
            path: this._path,
            value: [...this._store],
            timestamp: Date.now(),
        });
        return this._store;
    }

    copyWithin(target: number, start: number, end?: number): T[] {
        Array.prototype.copyWithin.call(this._store, target, start, end);
        this._emit({
            type: 'ARRAY_REPLACE',
            path: this._path,
            value: [...this._store],
            timestamp: Date.now(),
        });
        return this._store;
    }

    setIndex(index: number, value: T): void {
        const oldLength = this._store.length;
        const oldValue = this._store[index];
        this._store[index] = value;

        // Extension (was past end) → INSERT; otherwise → UPDATE
        const isExtension = index >= oldLength;
        this._emit({
            type: isExtension ? 'ARRAY_INSERT' : 'ARRAY_UPDATE',
            path: [...this._path, String(index)],
            value,
            timestamp: Date.now(),
        });

        // If extension caused length to grow, also emit a resize op
        // (optional — consumers may or may not care about implicit resizes)
        void oldValue; // explicit acknowledgment that we captured it
    }

    setLength(newLength: number): void {
        const oldLength = this._store.length;
        if (newLength === oldLength) return;
        this._store.length = newLength;
        this._emit({
            type: 'ARRAY_RESIZE',
            path: this._path,
            value: newLength,
            timestamp: Date.now(),
        });
    }

    deleteIndex(index: number): boolean {
        if (index < 0 || index >= this._store.length) return false;
        const value = this._store[index];
        // splice removes AND shifts subsequent elements (native JS delete semantics)
        this.splice(index, 1);
        void value;
        return true;
    }

    toJSON(): T[] {
        return [...this._store];
    }

    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[] {
        return this._store.map(callbackfn, thisArg);
    }

    filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[] {
        return this._store.filter(predicate, thisArg);
    }

    find(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined {
        return this._store.find(predicate, thisArg);
    }

    findIndex(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): number {
        return this._store.findIndex(predicate, thisArg);
    }

    includes(searchElement: T, fromIndex?: number): boolean {
        return this._store.includes(searchElement, fromIndex);
    }

    indexOf(searchElement: T, fromIndex?: number): number {
        return this._store.indexOf(searchElement, fromIndex);
    }

    lastIndexOf(searchElement: T, fromIndex?: number): number {
        return this._store.lastIndexOf(searchElement, fromIndex);
    }

    every(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean {
        return this._store.every(predicate, thisArg);
    }

    some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean {
        return this._store.some(predicate, thisArg);
    }

    reduce<U>(
        callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U,
        initialValue: U,
    ): U {
        return this._store.reduce(callbackfn, initialValue);
    }

    reduceRight<U>(
        callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U,
        initialValue: U,
    ): U {
        return this._store.reduceRight(callbackfn, initialValue);
    }

    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void {
        this._store.forEach(callbackfn, thisArg);
    }

    slice(start?: number, end?: number): T[] {
        return this._store.slice(start, end);
    }

    concat(...items: (T | readonly T[])[]): T[] {
        return this._store.concat(...items);
    }

    join(separator?: string): string {
        return this._store.join(separator);
    }

    toString(): string {
        return this._store.toString();
    }

    toLocaleString(): string {
        return this._store.toLocaleString();
    }

    flat<A = T>(depth?: number): A[] {
        return (this._store as any).flat(depth);
    }

    flatMap<U>(
        callback: (value: T, index: number, array: T[]) => U | readonly U[],
        thisArg?: any,
    ): U[] {
        return (this._store as any).flatMap(callback, thisArg);
    }

    at(index: number): T | undefined {
        return (this._store as any).at(index);
    }

    entries(): IterableIterator<[number, T]> {
        return this._store.entries();
    }

    keys(): IterableIterator<number> {
        return this._store.keys();
    }

    values(): IterableIterator<T> {
        return this._store.values();
    }
}

export function createArrayWrapper<T>(
    initial: T[] = [],
    emit: (op: StateOperation) => void,
    path: string[] = [],
): T[] {
    const wrapper = new ArrayWrapper<T>(initial, emit, path);

    return new Proxy(wrapper, {
        get(target, property, receiver): any {
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                const index = Number(property);
                return target.raw[index];
            }

            if (property === Symbol.iterator) {
                return target.raw[Symbol.iterator].bind(target.raw);
            }

            if (property === 'toJSON') {
                return () => [...target.raw];
            }

            const value = Reflect.get(target, property, receiver);
            if (typeof value === 'function' && typeof property === 'string') {
                return value.bind(target);
            }
            return value;
        },

        set(target, property, value): boolean {
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                target.setIndex(Number(property), value);
                return true;
            }

            if (property === 'length') {
                target.setLength(value);
                return true;
            }

            return Reflect.set(target, property, value);
        },

        has(target, property): boolean {
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                return Number(property) < target.length;
            }
            return Reflect.has(target, property);
        },

        deleteProperty(target, property): boolean {
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                target.deleteIndex(Number(property));
                return true;
            }
            return Reflect.deleteProperty(target, property);
        },

        ownKeys(target): (string | symbol)[] {
            const indices: string[] = [];
            for (let i = 0; i < target.length; i++) indices.push(String(i));
            return [...indices, 'length'];
        },

        getOwnPropertyDescriptor(target, property): PropertyDescriptor | undefined {
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                const index = Number(property);
                if (index < target.length) {
                    return {
                        value: target.raw[index],
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    };
                }
                return undefined;
            }
            if (property === 'length') {
                return {
                    value: target.length,
                    writable: true,
                    enumerable: false,
                    configurable: true,
                };
            }
            return Reflect.getOwnPropertyDescriptor(target, property);
        },
    }) as unknown as T[];
}
