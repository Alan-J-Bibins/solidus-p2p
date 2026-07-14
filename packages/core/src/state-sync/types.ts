export type StateOperationType =
    // Property Reading & Writing (Most Common for State)
    | 'get'
    | 'set'
    | 'has'
    | 'deleteProperty'
    // Object Configuration & Reflection
    | 'ownKeys'
    | 'defineProperty'
    | 'getOwnPropertyDescriptor'
    | 'preventExtensions'
    | 'isExtensible'
    // Prototype Chain Interception
    | 'getPrototypeOf'
    | 'setPrototypeOf'
    // Function & Class Execution (If your state has callable functions)
    | 'apply'
    | 'construct';

export type StateOperation = {
    type: StateOperationType;
    path: string[];
    value: any;
    timestamp: number;
};
