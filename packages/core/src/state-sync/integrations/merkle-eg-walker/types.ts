import type { StateOperation } from '../../types.ts';

export type MerkleEventNode = {
    cid: string;
    operation: StateOperation;
    parents: string[];
    lamport: number;
    peerId: string;
};
