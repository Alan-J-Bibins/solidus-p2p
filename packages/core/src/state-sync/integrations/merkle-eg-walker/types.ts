export type MerkleEventNode = {
    cid: string;
    operation: unknown;
    parents: string[];
    lamport: number;
    peerId: string;
};
