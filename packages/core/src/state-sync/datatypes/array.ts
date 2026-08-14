import type { StateOperation } from '../types.ts';

export function createArrayWrapper<T>(
    initial: T[] = [],
    emit: (op: StateOperation) => void,
    path: string[] = [],
): T[] {
    const store = [...initial];

    return new Proxy(store, {
        get(target, property, receiver): any {
            // Numeric index access
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                return target[Number(property)];
            }

            // Symbol.iterator
            if (property === Symbol.iterator) {
                return target[Symbol.iterator].bind(target);
            }

            // toJSON for serialization
            if (property === 'toJSON') {
                return () => [...target];
            }

            // Mutation methods that emit operations
            if (property === 'push') {
                return (...items: T[]) => {
                    const start = target.length;
                    const now = Date.now();
                    for (let i = 0; i < items.length; i++) {
                        emit({
                            type: 'ARRAY_INSERT',
                            path: [...path, String(start + i)],
                            value: items[i],
                            timestamp: now,
                        });
                    }
                    return Array.prototype.push.apply(target, items);
                };
            }

            if (property === 'pop') {
                return () => {
                    if (target.length === 0) return undefined;
                    const idx = target.length - 1;
                    const value = target[idx];
                    emit({
                        type: 'ARRAY_DELETE',
                        path: [...path, String(idx)],
                        value,
                        timestamp: Date.now(),
                    });
                    return Array.prototype.pop.call(target);
                };
            }

            if (property === 'shift') {
                return () => {
                    if (target.length === 0) return undefined;
                    const value = target[0];
                    emit({
                        type: 'ARRAY_DELETE',
                        path: [...path, '0'],
                        value,
                        timestamp: Date.now(),
                    });
                    return Array.prototype.shift.call(target);
                };
            }

            if (property === 'unshift') {
                return (...items: T[]) => {
                    const now = Date.now();
                    for (let i = 0; i < items.length; i++) {
                        emit({
                            type: 'ARRAY_INSERT',
                            path: [...path, String(i)],
                            value: items[i],
                            timestamp: now,
                        });
                    }
                    return Array.prototype.unshift.apply(target, items);
                };
            }

            if (property === 'splice') {
                return (start: number, deleteCount?: number, ...items: T[]) => {
                    const len = target.length;
                    const actualStart = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
                    const actualDelete = deleteCount ?? len - actualStart;
                    const now = Date.now();

                    // Snapshot removed values
                    const removed = target.slice(actualStart, actualStart + actualDelete);

                    // Emit deletes
                    for (let i = 0; i < removed.length; i++) {
                        emit({
                            type: 'ARRAY_DELETE',
                            path: [...path, String(actualStart)],
                            value: removed[i],
                            timestamp: now,
                        });
                    }

                    // Emit inserts
                    for (let i = 0; i < items.length; i++) {
                        emit({
                            type: 'ARRAY_INSERT',
                            path: [...path, String(actualStart + i)],
                            value: items[i],
                            timestamp: now,
                        });
                    }

                    return Array.prototype.splice.apply(target, [
                        actualStart,
                        actualDelete,
                        ...items,
                    ] as any);
                };
            }

            if (property === 'sort') {
                return (compareFn?: (a: T, b: T) => number) => {
                    Array.prototype.sort.call(target, compareFn);
                    emit({
                        type: 'ARRAY_REPLACE',
                        path,
                        value: [...target],
                        timestamp: Date.now(),
                    });
                    return target;
                };
            }

            if (property === 'reverse') {
                return () => {
                    Array.prototype.reverse.call(target);
                    emit({
                        type: 'ARRAY_REPLACE',
                        path,
                        value: [...target],
                        timestamp: Date.now(),
                    });
                    return target;
                };
            }

            if (property === 'fill') {
                return (value: T, start?: number, end?: number) => {
                    Array.prototype.fill.call(target, value, start, end);
                    emit({
                        type: 'ARRAY_REPLACE',
                        path,
                        value: [...target],
                        timestamp: Date.now(),
                    });
                    return target;
                };
            }

            if (property === 'copyWithin') {
                return (targetIdx: number, start: number, end?: number) => {
                    Array.prototype.copyWithin.call(target, targetIdx, start, end);
                    emit({
                        type: 'ARRAY_REPLACE',
                        path,
                        value: [...target],
                        timestamp: Date.now(),
                    });
                    return target;
                };
            }

            if (property === '__applyRemote') {
                return (op: StateOperation) => {
                    switch (op.type) {
                        case 'ARRAY_INSERT': {
                            const index = Number(op.path[op.path.length - 1]);
                            target.splice(index, 0, op.value);
                            break;
                        }
                        case 'ARRAY_DELETE': {
                            const index = Number(op.path[op.path.length - 1]);
                            target.splice(index, 1);
                            break;
                        }
                        case 'ARRAY_UPDATE': {
                            const index = Number(op.path[op.path.length - 1]);
                            target[index] = op.value;
                            break;
                        }
                        case 'ARRAY_REPLACE': {
                            // Replace entire array contents
                            target.length = 0;
                            target.push(...op.value);
                            break;
                        }
                        case 'ARRAY_RESIZE': {
                            target.length = op.value;
                            break;
                        }
                    }
                };
            }

            // Read-only methods pass through unchanged
            const value = Reflect.get(target, property, receiver);
            if (typeof value === 'function') {
                return value.bind(target);
            }
            return value;
        },

        set(target, property, value): boolean {
            // Indexed assignment
            if (typeof property === 'string' && /^\d+$/.test(property)) {
                const index = Number(property);
                const isExtension = index >= target.length;
                target[index] = value;
                emit({
                    type: isExtension ? 'ARRAY_INSERT' : 'ARRAY_UPDATE',
                    path: [...path, String(index)],
                    value,
                    timestamp: Date.now(),
                });
                return true;
            }

            // Length assignment
            if (property === 'length') {
                const oldLength = target.length;
                if (value !== oldLength) {
                    target.length = value;
                    emit({
                        type: 'ARRAY_RESIZE',
                        path,
                        value,
                        timestamp: Date.now(),
                    });
                }
                return true;
            }

            // Other properties pass through
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
                const index = Number(property);
                // Out of bounds - return true (success) but emit nothing
                if (index < 0 || index >= target.length) return true;

                const value = target[index];
                target.splice(index, 1);
                emit({
                    type: 'ARRAY_DELETE',
                    path: [...path, String(index)],
                    value,
                    timestamp: Date.now(),
                });
                return true;
            }
            return Reflect.deleteProperty(target, property);
        },
        ownKeys(target): (string | symbol)[] {
            return Reflect.ownKeys(target);
        },

        getOwnPropertyDescriptor(target, property): PropertyDescriptor | undefined {
            return Reflect.getOwnPropertyDescriptor(target, property);
        },
    });
}
