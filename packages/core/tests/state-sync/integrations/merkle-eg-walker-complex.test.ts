import { describe, test, expect } from 'vite-plus/test';

import { EgWalker } from '../../../src/state-sync/integrations/merkle-eg-walker/eg-walker.ts';
import { MerkleEventGraph } from '../../../src/state-sync/integrations/merkle-eg-walker/event-graph.ts';
import type { StateOperation } from '../../../src/state-sync/types.ts';

describe('Merkle Eg Walker - Complex State Types', () => {
    test('rebuildStateFromLCA handles Maps correctly', async () => {
        const graph = new MerkleEventGraph();
        const dagSyncer = {
            getNode: async () => {
                throw new Error('Not implemented');
            },
            sendNode: () => {},
            destroy: () => {},
        } as any;

        const initialState = {
            data: new Map<string, number>(),
        };

        const walker = new EgWalker(graph, dagSyncer, initialState, 'peer1');

        // Add operations to build up state
        const op1: StateOperation = {
            type: 'MAP_SET',
            path: ['data', 'key1'],
            value: 100,
            timestamp: Date.now(),
        };

        await walker.applyLocal(op1);

        const op2: StateOperation = {
            type: 'MAP_SET',
            path: ['data', 'key2'],
            value: 200,
            timestamp: Date.now(),
        };

        await walker.applyLocal(op2);

        // Verify state was built correctly
        const state = walker.getState();
        expect(state.data.get('key1')).toBe(100);
        expect(state.data.get('key2')).toBe(200);
    });

    test('rebuildStateFromLCA handles Sets correctly', async () => {
        const graph = new MerkleEventGraph();
        const dagSyncer = {
            getNode: async () => {
                throw new Error('Not implemented');
            },
            sendNode: () => {},
            destroy: () => {},
        } as any;

        const initialState = {
            items: new Set<string>(),
        };

        const walker = new EgWalker(graph, dagSyncer, initialState, 'peer1');

        const op1: StateOperation = {
            type: 'SET_ADD',
            path: ['items'],
            value: 'item1',
            timestamp: Date.now(),
        };

        await walker.applyLocal(op1);

        const op2: StateOperation = {
            type: 'SET_ADD',
            path: ['items'],
            value: 'item2',
            timestamp: Date.now(),
        };

        await walker.applyLocal(op2);

        const state = walker.getState();
        expect(state.items.has('item1')).toBe(true);
        expect(state.items.has('item2')).toBe(true);
    });

    test('rebuildStateFromLCA handles nested objects correctly', async () => {
        const graph = new MerkleEventGraph();
        const dagSyncer = {
            getNode: async () => {
                throw new Error('Not implemented');
            },
            sendNode: () => {},
            destroy: () => {},
        } as any;

        const initialState = {
            user: {
                profile: {
                    name: '',
                    age: 0,
                },
            },
        };

        const walker = new EgWalker(graph, dagSyncer, initialState, 'peer1');

        const op1: StateOperation = {
            type: 'SET',
            path: ['user', 'profile', 'name'],
            value: 'Alice',
            timestamp: Date.now(),
        };

        await walker.applyLocal(op1);

        const op2: StateOperation = {
            type: 'SET',
            path: ['user', 'profile', 'age'],
            value: 30,
            timestamp: Date.now(),
        };

        await walker.applyLocal(op2);

        const state = walker.getState();
        expect(state.user.profile.name).toBe('Alice');
        expect(state.user.profile.age).toBe(30);
    });

    test('retreat/advance properly mutates prepare state', async () => {
        const graph = new MerkleEventGraph();
        const dagSyncer = {
            getNode: async () => {
                throw new Error('Not implemented');
            },
            sendNode: () => {},
            destroy: () => {},
        } as any;

        const initialState = {
            count: 0,
        };

        const walker = new EgWalker(graph, dagSyncer, initialState, 'peer1');

        // Create divergent branches
        const op1: StateOperation = {
            type: 'SET',
            path: ['count'],
            value: 1,
            timestamp: Date.now(),
        };

        await walker.applyLocal(op1);

        const op2: StateOperation = {
            type: 'SET',
            path: ['count'],
            value: 2,
            timestamp: Date.now(),
        };

        await walker.applyLocal(op2);

        // Create a remote branch
        const remoteGraph = new MerkleEventGraph();
        const remoteWalker = new EgWalker(remoteGraph, dagSyncer, { count: 0 }, 'peer2');

        const remoteOp: StateOperation = {
            type: 'SET',
            path: ['count'],
            value: 10,
            timestamp: Date.now(),
        };

        await remoteWalker.applyLocal(remoteOp);
        const remoteCid = remoteGraph.getFrontier()[0];

        // Import remote node
        const remoteNode = remoteGraph.getNode(remoteCid)!;
        await graph.importNode(remoteNode);

        // Merge should trigger retreat/advance logic
        await walker.mergeRemote(remoteCid);

        // Verify state was properly merged
        const state = walker.getState();
        expect(state.count).toBeDefined();
    });

    test('emits state:remote-applied event after merge', async () => {
        const graph = new MerkleEventGraph();
        const dagSyncer = {
            getNode: async () => {
                throw new Error('Not implemented');
            },
            sendNode: () => {},
            destroy: () => {},
        } as any;

        let remoteAppliedCalled = false;
        let appliedState: any = null;

        const initialState = {
            value: 0,
        };

        const walker = new EgWalker(graph, dagSyncer, initialState, 'peer1', (state) => {
            remoteAppliedCalled = true;
            appliedState = state;
        });

        // Create a local operation
        const op1: StateOperation = {
            type: 'SET',
            path: ['value'],
            value: 1,
            timestamp: Date.now(),
        };

        await walker.applyLocal(op1);

        // Create a remote operation
        const remoteGraph = new MerkleEventGraph();
        const remoteWalker = new EgWalker(remoteGraph, dagSyncer, { value: 0 }, 'peer2');

        const remoteOp: StateOperation = {
            type: 'SET',
            path: ['value'],
            value: 10,
            timestamp: Date.now(),
        };

        await remoteWalker.applyLocal(remoteOp);
        const remoteCid = remoteGraph.getFrontier()[0];

        // Import and merge
        const remoteNode = remoteGraph.getNode(remoteCid)!;
        await graph.importNode(remoteNode);
        await walker.mergeRemote(remoteCid);

        // Verify callback was called
        expect(remoteAppliedCalled).toBe(true);
        expect(appliedState).toBeDefined();
        expect(appliedState.value).toBeDefined();
    });

    test('handles complex nested state with Maps and Sets', async () => {
        const graph = new MerkleEventGraph();
        const dagSyncer = {
            getNode: async () => {
                throw new Error('Not implemented');
            },
            sendNode: () => {},
            destroy: () => {},
        } as any;

        const initialState = {
            users: new Map<string, { name: string; tags: Set<string> }>(),
        };

        const walker = new EgWalker(graph, dagSyncer, initialState, 'peer1');

        // Add a user with tags
        const op1: StateOperation = {
            type: 'MAP_SET',
            path: ['users', 'user1'],
            value: { name: 'Alice', tags: new Set(['admin', 'user']) },
            timestamp: Date.now(),
        };

        await walker.applyLocal(op1);

        const state = walker.getState();
        expect(state.users.has('user1')).toBe(true);
        const user = state.users.get('user1');
        expect(user?.name).toBe('Alice');
        expect(user?.tags.has('admin')).toBe(true);
        expect(user?.tags.has('user')).toBe(true);
    });
});
