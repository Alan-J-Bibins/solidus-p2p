import type { StateOperation } from '../../types.ts';

export type EventNode = {
    cid: string;
    operation: StateOperation;
    parents: string[];
    lamport: number;
    peerId: string;
};
