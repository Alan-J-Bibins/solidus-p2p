import { AssetReferenceTracker } from './asset/reference-tracker.ts';
import { createArrayWrapper } from './datatypes/array.ts';
import { Asset } from './datatypes/asset.ts';
import { createMapWrapper } from './datatypes/map.ts';
import { createSetWrapper } from './datatypes/set.ts';
import type { StateOperation } from './types.ts';
export function createState<T extends object>(
    obj: T,
    onUpdate?: (op: StateOperation) => void,
    assetTracker?: AssetReferenceTracker,
) {
    assetTracker?.addState(obj);

    const proxyCache = new WeakMap<object, any>();
    return createStateProxy(obj, onUpdate, [], proxyCache, assetTracker);
}
export { Asset } from './datatypes/asset.ts';
export { applyOperation } from './apply-operation.ts';
export function createStateProxy<T extends object>(
    initial: T,
    onUpdate?: (op: StateOperation) => void,
    path: string[] = [],
    proxyCache: WeakMap<object, any> = new WeakMap(),
    assetTracker?: AssetReferenceTracker,
) {
    const handleUpdation = (op: StateOperation) => {
        if (onUpdate) onUpdate(op);
    };

    return new Proxy<T>(initial, {
        get: (target, property) => {
            const value = Reflect.get(target, property);

            if (value !== null && typeof value === 'object') {
                if (value instanceof Date || value instanceof RegExp || value instanceof Asset) {
                    return value;
                }

                if (proxyCache.has(value)) {
                    return proxyCache.get(value);
                }

                const childPath = [...path, String(property)];
                let childProxy;

                if (Array.isArray(value)) {
                    childProxy = createArrayWrapper(value, handleUpdation, childPath, assetTracker);
                } else if (value instanceof Map) {
                    childProxy = createMapWrapper(value, handleUpdation, childPath, assetTracker);
                } else if (value instanceof Set) {
                    childProxy = createSetWrapper(value, handleUpdation, childPath, assetTracker);
                } else {
                    childProxy = createStateProxy(
                        value,
                        onUpdate,
                        childPath,
                        proxyCache,
                        assetTracker,
                    );
                }

                proxyCache.set(value, childProxy);
                return childProxy;
            }

            return value;
        },
        set: (target, property, value) => {
            if (typeof property === 'symbol') {
                return Reflect.set(target, property, value);
            }

            const oldValue = Reflect.get(target, property);

            const result = Reflect.set(target, property, value);

            if (assetTracker) {
                void assetTracker.removeState(oldValue);
                assetTracker.addState(value);
            }

            const fullPath = [...path, String(property)];

            handleUpdation({
                type: 'SET',
                path: fullPath,
                value,
                timestamp: Date.now(),
            });

            return result;
        },
        has: (target, property) => {
            return Reflect.has(target, property);
        },

        deleteProperty: (target, property) => {
            if (!Reflect.has(target, property)) {
                return Reflect.deleteProperty(target, property);
            }

            const value = Reflect.get(target, property);
            const result = Reflect.deleteProperty(target, property);

            if (assetTracker) {
                void assetTracker.removeState(value);
            }

            handleUpdation({
                type: 'DELETE_PROPERTY',
                path: [...path, String(property)],
                value,
                timestamp: Date.now(),
            });

            return result;
        },

        ownKeys: (target) => {
            return Reflect.ownKeys(target);
        },

        defineProperty: (target, property, attributes) => {
            const result = Reflect.defineProperty(target, property, attributes);
            handleUpdation({
                type: 'DEFINE_PROPERTY',
                path: [...path, String(property)],
                value: attributes,
                timestamp: Date.now(),
            });
            return result;
        },

        getOwnPropertyDescriptor: (target, property) => {
            return Reflect.getOwnPropertyDescriptor(target, property);
        },

        preventExtensions: (target) => {
            const result = Reflect.preventExtensions(target);
            handleUpdation({
                type: 'PREVENT_EXTENSIONS',
                path,
                value: null,
                timestamp: Date.now(),
            });
            return result;
        },

        isExtensible: (target) => {
            return Reflect.isExtensible(target);
        },

        getPrototypeOf: (target) => {
            return Reflect.getPrototypeOf(target);
        },

        setPrototypeOf: (target, object) => {
            const result = Reflect.setPrototypeOf(target, object);
            handleUpdation({
                type: 'SET_PROTOTYPE_OF',
                path,
                value: object,
                timestamp: Date.now(),
            });
            return result;
        },
    });
}
