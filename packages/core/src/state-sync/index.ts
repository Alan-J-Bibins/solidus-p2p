export function createState<T extends object>(obj: T, onUpdate?: (...args: any[]) => void) {
    return createStateProxy(obj);
}

export function createStateProxy<T extends object>(initial: T) {
    return new Proxy<T>(initial, {
        get: (target, property) => {
            return Reflect.get(target, property);
        },
        set: (target, property, value) => {
            return Reflect.set(target, property, value);
        },
        has: (target, property) => {
            return Reflect.has(target, property);
        },
        deleteProperty: (target, property) => {
            return Reflect.deleteProperty(target, property);
        },
        getPrototypeOf: (target) => {
            return Reflect.getPrototypeOf(target);
        },
        setPrototypeOf: (target, object) => {
            return Reflect.setPrototypeOf(target, object);
        },
        isExtensible: (target) => {
            return Reflect.isExtensible(target);
        },
        preventExtensions: (target) => {
            return Reflect.preventExtensions(target);
        },
        getOwnPropertyDescriptor: (target, property) => {
            return Reflect.getOwnPropertyDescriptor(target, property);
        },
        defineProperty: (target, property, attributes) => {
            return Reflect.defineProperty(target, property, attributes);
        },
        ownKeys: (target) => {
            return Reflect.ownKeys(target);
        },
    });
}
