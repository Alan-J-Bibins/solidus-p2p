import type { StateOperation } from './types.ts';

export function createState<T extends object>(obj: T, onUpdate?: (op: StateOperation) => void) {
    const proxyCache = new WeakMap<object, any>();
    return createStateProxy(obj, onUpdate, [], proxyCache);
}

export function createStateProxy<T extends object>(
    initial: T,
    onUpdate?: (op: StateOperation) => void,
    path: string[] = [],
    proxyCache: WeakMap<object, any> = new WeakMap(),
) {
    const handleUpdation = (op: StateOperation) => {
        if (onUpdate) onUpdate(op);
    };

    return new Proxy<T>(initial, {
        get: (target, property) => {
            const value = Reflect.get(target, property);

            if (value !== null && typeof value === 'object') {
                if (proxyCache.has(value)) {
                    return proxyCache.get(value);
                }

                const childProxy = createStateProxy(
                    value,
                    onUpdate,
                    [...path, String(property)],
                    proxyCache,
                );
                proxyCache.set(value, childProxy);
                return childProxy;
            }

            return value;
        },
        set: (target, property, value) => {
            const result = Reflect.set(target, property, value);
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
            const result = Reflect.has(target, property);
            handleUpdation({
                type: 'HAS',
                path: [...path, String(property)],
                value: result,
                timestamp: Date.now(),
            });
            return result;
        },

        deleteProperty: (target, property) => {
            const value = Reflect.get(target, property);
            const result = Reflect.deleteProperty(target, property);
            handleUpdation({
                type: 'DELETE_PROPERTY',
                path: [...path, String(property)],
                value,
                timestamp: Date.now(),
            });
            return result;
        },

        ownKeys: (target) => {
            const keys = Reflect.ownKeys(target);
            handleUpdation({
                type: 'OWN_KEYS',
                path,
                value: keys,
                timestamp: Date.now(),
            });
            return keys;
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
            const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
            handleUpdation({
                type: 'GET_OWN_PROPERTY_DESCRIPTOR',
                path: [...path, String(property)],
                value: descriptor,
                timestamp: Date.now(),
            });
            return descriptor;
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
            const result = Reflect.isExtensible(target);
            handleUpdation({
                type: 'IS_EXTENSIBLE',
                path,
                value: result,
                timestamp: Date.now(),
            });
            return result;
        },

        getPrototypeOf: (target) => {
            const proto = Reflect.getPrototypeOf(target);
            handleUpdation({
                type: 'GET_PROTOTYPE_OF',
                path,
                value: proto,
                timestamp: Date.now(),
            });
            return proto;
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
