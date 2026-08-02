export type StateOperationType =
    // Property Reading & Writing (Most Common for State)
    | 'GET'
    | 'SET'
    | 'HAS'
    | 'DELETE_PROPERTY'
    // Object Configuration & Reflection
    | 'OWN_KEYS'
    | 'DEFINE_PROPERTY'
    | 'GET_OWN_PROPERTY_DESCRIPTOR'
    | 'PREVENT_EXTENSIONS'
    | 'IS_EXTENSIBLE'
    // Prototype Chain Interception
    | 'GET_PROTOTYPE_OF'
    | 'SET_PROTOTYPE_OF'
    // Function & Class Execution (If your state has callable functions)
    | 'APPLY'
    | 'CONSTRUCT'
    // Array specific functions
    | 'ARRAY_INSERT'
    | 'ARRAY_REMOVE'
    | 'ARRAY_UPDATE'
    | 'ARRAY_RESIZE'
    | 'ARRAY_REPLACE'
    | 'MAP_SET'
    | 'MAP_REMOVE'
    | 'MAP_CLEAR';

export type StateOperation = {
    type: StateOperationType;
    path: string[];
    value: any;
    timestamp: number;
};
