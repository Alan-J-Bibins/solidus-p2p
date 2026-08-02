export type StateOperationType =
    // Property Reading & Writing (Most Common for State)
    | 'GET'
    | 'SET'
    | 'HAS'
    | 'DELETE_PROPERTY'
    | 'OWN_KEYS'
    | 'DEFINE_PROPERTY'
    | 'GET_OWN_PROPERTY_DESCRIPTOR'
    | 'PREVENT_EXTENSIONS'
    | 'IS_EXTENSIBLE'
    | 'GET_PROTOTYPE_OF'
    | 'SET_PROTOTYPE_OF'
    | 'APPLY'
    | 'CONSTRUCT'
    | 'ARRAY_INSERT'
    | 'ARRAY_REMOVE'
    | 'ARRAY_UPDATE'
    | 'ARRAY_RESIZE'
    | 'ARRAY_REPLACE'
    | 'MAP_SET'
    | 'MAP_REMOVE'
    | 'MAP_CLEAR'
    | 'SET_ADD'
    | 'SET_REMOVE'
    | 'SET_CLEAR';

export type StateOperation = {
    type: StateOperationType;
    path: string[];
    value: any;
    timestamp: number;
};
