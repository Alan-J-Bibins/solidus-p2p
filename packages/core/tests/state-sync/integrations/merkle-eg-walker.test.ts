import { describe, test, expect } from 'vite-plus/test';

import { EgWalker } from '../../../src/state-sync/integrations/merkle-eg-walker/eg-walker.ts';
import { MerkleEventGraph } from '../../../src/state-sync/integrations/merkle-eg-walker/event-graph.ts';
import {
    OperationHandlerRegistry,
    ArrayHandler,
    MapHandler,
    SetHandler,
    ObjectHandler,
} from '../../../src/state-sync/integrations/merkle-eg-walker/handlers.ts';
import type { StateOperation } from '../../../src/state-sync/types.ts';

describe('Merkle Eg Walker Plugin', () => {
    // ═════════════════════════════════════════════════════════════
    // 1. MERKLE EVENT GRAPH
    // ═════════════════════════════════════════════════════════════
    describe('MerkleEventGraph', () => {
        test('addNode creates a node with correct CID', async () => {
            const graph = new MerkleEventGraph();
            const operation: StateOperation = {
                type: 'SET',
                path: ['test'],
                value: 42,
                timestamp: Date.now(),
            };

            const cid = await graph.addNode(operation, [], 1, 'peer1');

            expect(cid).toBeDefined();
            expect(typeof cid).toBe('string');
            expect(graph.hasNode(cid)).toBe(true);
        });

        test('addNode with parents updates frontier correctly', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };

            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            expect(graph.getFrontier()).toEqual([cid1]);

            const cid2 = await graph.addNode(op2, [cid1], 2, 'peer1');
            expect(graph.getFrontier()).toEqual([cid2]);
        });

        test('getNode returns correct node data', async () => {
            const graph = new MerkleEventGraph();
            const operation: StateOperation = {
                type: 'SET',
                path: ['test'],
                value: 42,
                timestamp: Date.now(),
            };

            const cid = await graph.addNode(operation, [], 1, 'peer1');
            const node = graph.getNode(cid);

            expect(node).toBeDefined();
            expect(node?.cid).toBe(cid);
            expect(node?.operation).toEqual(operation);
            expect(node?.lamport).toBe(1);
            expect(node?.peerId).toBe('peer1');
            expect(node?.parents).toEqual([]);
        });

        test('hasNode returns false for non-existent nodes', () => {
            const graph = new MerkleEventGraph();
            expect(graph.hasNode('non-existent')).toBe(false);
        });

        test('getFrontier returns empty array for empty graph', () => {
            const graph = new MerkleEventGraph();
            expect(graph.getFrontier()).toEqual([]);
        });

        test('multiple parents create merge point', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };
            const op3: StateOperation = {
                type: 'SET',
                path: ['c'],
                value: 3,
                timestamp: Date.now(),
            };

            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            const cid2 = await graph.addNode(op2, [cid1], 2, 'peer1');
            const cid3 = await graph.addNode(op3, [cid1, cid2], 3, 'peer1');

            expect(graph.getFrontier()).toEqual([cid3]);
            const node3 = graph.getNode(cid3);
            expect(node3?.parents).toEqual([cid1, cid2]);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 2. OPERATION HANDLERS
    // ═════════════════════════════════════════════════════════════
    describe('Operation Handlers', () => {
        describe('ObjectHandler', () => {
            test('SET operation updates object property', () => {
                const handler = new ObjectHandler();
                const state = { count: 0 };
                const op: StateOperation = {
                    type: 'SET',
                    path: ['count'],
                    value: 42,
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.count).toBe(42);
            });

            test('DELETE_PROPERTY removes property', () => {
                const handler = new ObjectHandler();
                const state: { a?: number } = { a: 1 };
                const op: StateOperation = {
                    type: 'DELETE_PROPERTY',
                    path: ['a'],
                    value: undefined,
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.a).toBeUndefined();
                expect('a' in state).toBe(false);
            });

            test('hasConflict returns true for same path', () => {
                const handler = new ObjectHandler();
                const op1: StateOperation = {
                    type: 'SET',
                    path: ['a'],
                    value: 1,
                    timestamp: Date.now(),
                };
                const op2: StateOperation = {
                    type: 'SET',
                    path: ['a'],
                    value: 2,
                    timestamp: Date.now(),
                };

                expect(handler.hasConflict(op1, op2)).toBe(true);
            });

            test('hasConflict returns false for different paths', () => {
                const handler = new ObjectHandler();
                const op1: StateOperation = {
                    type: 'SET',
                    path: ['a'],
                    value: 1,
                    timestamp: Date.now(),
                };
                const op2: StateOperation = {
                    type: 'SET',
                    path: ['b'],
                    value: 2,
                    timestamp: Date.now(),
                };

                expect(handler.hasConflict(op1, op2)).toBe(false);
            });
        });

        describe('ArrayHandler', () => {
            test('ARRAY_INSERT inserts at index', () => {
                const handler = new ArrayHandler();
                const state = { items: ['a', 'b', 'c'] };
                const op: StateOperation = {
                    type: 'ARRAY_INSERT',
                    path: ['items', '1'],
                    value: 'x',
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items).toEqual(['a', 'x', 'b', 'c']);
            });

            test('ARRAY_DELETE removes at index', () => {
                const handler = new ArrayHandler();
                const state = { items: ['a', 'b', 'c'] };
                const op: StateOperation = {
                    type: 'ARRAY_DELETE',
                    path: ['items', '1'],
                    value: 'b',
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items).toEqual(['a', 'c']);
            });

            test('ARRAY_UPDATE updates at index', () => {
                const handler = new ArrayHandler();
                const state = { items: ['a', 'b', 'c'] };
                const op: StateOperation = {
                    type: 'ARRAY_UPDATE',
                    path: ['items', '1'],
                    value: 'x',
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items).toEqual(['a', 'x', 'c']);
            });

            // Regression: ARRAY_RESIZE/ARRAY_REPLACE address the array itself
            // (path's last segment is the array's own key), unlike
            // INSERT/DELETE/UPDATE (path's last segment is an element index).
            // A remote "clear board" (strokes.length = 0) is an ARRAY_RESIZE.
            test('ARRAY_RESIZE truncates the array itself, not an element', () => {
                const handler = new ArrayHandler();
                const state = { items: ['a', 'b', 'c'] };
                const op: StateOperation = {
                    type: 'ARRAY_RESIZE',
                    path: ['items'],
                    value: 0,
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items).toEqual([]);
            });

            test('ARRAY_REPLACE replaces the array itself, not an element', () => {
                const handler = new ArrayHandler();
                const state = { items: ['a', 'b', 'c'] };
                const op: StateOperation = {
                    type: 'ARRAY_REPLACE',
                    path: ['items'],
                    value: ['x', 'y'],
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items).toEqual(['x', 'y']);
            });

            test('transform adjusts index for concurrent insert', () => {
                const handler = new ArrayHandler();
                const op: StateOperation = {
                    type: 'ARRAY_INSERT',
                    path: ['items', '3'],
                    value: 'x',
                    timestamp: Date.now(),
                };
                const concurrentOp: StateOperation = {
                    type: 'ARRAY_INSERT',
                    path: ['items', '1'],
                    value: 'y',
                    timestamp: Date.now(),
                };

                const transformed = handler.transform(op, concurrentOp);

                expect(transformed.path).toEqual(['items', '4']);
            });

            test('transform adjusts index for concurrent delete', () => {
                const handler = new ArrayHandler();
                const op: StateOperation = {
                    type: 'ARRAY_INSERT',
                    path: ['items', '3'],
                    value: 'x',
                    timestamp: Date.now(),
                };
                const concurrentOp: StateOperation = {
                    type: 'ARRAY_DELETE',
                    path: ['items', '1'],
                    value: 'y',
                    timestamp: Date.now(),
                };

                const transformed = handler.transform(op, concurrentOp);

                expect(transformed.path).toEqual(['items', '2']);
            });
        });

        describe('MapHandler', () => {
            test('MAP_SET adds to map', () => {
                const handler = new MapHandler();
                const state = { data: new Map<string, number>() };
                const op: StateOperation = {
                    type: 'MAP_SET',
                    path: ['data', 'key1'],
                    value: 100,
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.data.get('key1')).toBe(100);
            });

            test('MAP_DELETE removes from map', () => {
                const handler = new MapHandler();
                const state = {
                    data: new Map([
                        ['a', 1],
                        ['b', 2],
                    ]),
                };
                const op: StateOperation = {
                    type: 'MAP_DELETE',
                    path: ['data', 'a'],
                    value: undefined,
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.data.has('a')).toBe(false);
                expect(state.data.get('b')).toBe(2);
            });

            test('MAP_CLEAR empties map', () => {
                const handler = new MapHandler();
                const state = {
                    data: new Map([
                        ['a', 1],
                        ['b', 2],
                    ]),
                };
                const op: StateOperation = {
                    type: 'MAP_CLEAR',
                    path: ['data'],
                    value: null,
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.data.size).toBe(0);
            });

            test('hasConflict returns true for same key', () => {
                const handler = new MapHandler();
                const op1: StateOperation = {
                    type: 'MAP_SET',
                    path: ['data', 'key1'],
                    value: 1,
                    timestamp: Date.now(),
                };
                const op2: StateOperation = {
                    type: 'MAP_SET',
                    path: ['data', 'key1'],
                    value: 2,
                    timestamp: Date.now(),
                };

                expect(handler.hasConflict(op1, op2)).toBe(true);
            });

            test('hasConflict returns false for different keys', () => {
                const handler = new MapHandler();
                const op1: StateOperation = {
                    type: 'MAP_SET',
                    path: ['data', 'key1'],
                    value: 1,
                    timestamp: Date.now(),
                };
                const op2: StateOperation = {
                    type: 'MAP_SET',
                    path: ['data', 'key2'],
                    value: 2,
                    timestamp: Date.now(),
                };

                expect(handler.hasConflict(op1, op2)).toBe(false);
            });
        });

        describe('SetHandler', () => {
            test('SET_ADD adds to set', () => {
                const handler = new SetHandler();
                const state = { items: new Set<string>() };
                const op: StateOperation = {
                    type: 'SET_ADD',
                    path: ['items'],
                    value: 'item1',
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items.has('item1')).toBe(true);
            });

            test('SET_REMOVE removes from set', () => {
                const handler = new SetHandler();
                const state = { items: new Set(['a', 'b', 'c']) };
                const op: StateOperation = {
                    type: 'SET_REMOVE',
                    path: ['items'],
                    value: 'b',
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items.has('b')).toBe(false);
                expect(state.items.has('a')).toBe(true);
                expect(state.items.has('c')).toBe(true);
            });

            test('SET_CLEAR empties set', () => {
                const handler = new SetHandler();
                const state = { items: new Set(['a', 'b']) };
                const op: StateOperation = {
                    type: 'SET_CLEAR',
                    path: ['items'],
                    value: null,
                    timestamp: Date.now(),
                };

                handler.apply(state, op);

                expect(state.items.size).toBe(0);
            });

            test('hasConflict always returns false (commutative)', () => {
                const handler = new SetHandler();
                const op1: StateOperation = {
                    type: 'SET_ADD',
                    path: ['items'],
                    value: 'a',
                    timestamp: Date.now(),
                };
                const op2: StateOperation = {
                    type: 'SET_ADD',
                    path: ['items'],
                    value: 'b',
                    timestamp: Date.now(),
                };

                expect(handler.hasConflict(op1, op2)).toBe(false);
            });
        });

        describe('OperationHandlerRegistry', () => {
            test('getHandler returns correct handler for operation type', () => {
                const registry = new OperationHandlerRegistry();

                expect(registry.getHandler('SET')).toBeInstanceOf(ObjectHandler);
                expect(registry.getHandler('ARRAY_INSERT')).toBeInstanceOf(ArrayHandler);
                expect(registry.getHandler('MAP_SET')).toBeInstanceOf(MapHandler);
                expect(registry.getHandler('SET_ADD')).toBeInstanceOf(SetHandler);
            });

            test('getHandler throws for unknown operation type', () => {
                const registry = new OperationHandlerRegistry();

                expect(() => registry.getHandler('UNKNOWN_OP')).toThrow();
            });
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 3. EG WALKER CORE
    // ═════════════════════════════════════════════════════════════
    describe('EgWalker', () => {
        test('applyLocal applies operation and adds to graph', async () => {
            const graph = new MerkleEventGraph();
            const dagSyncer = {
                getNode: async () => {
                    throw new Error('Not implemented');
                },
            } as any;
            const state = { count: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            const op: StateOperation = {
                type: 'SET',
                path: ['count'],
                value: 42,
                timestamp: Date.now(),
            };

            await walker.applyLocal(op);

            expect(state.count).toBe(42);
            expect(graph.getFrontier()).toHaveLength(1);
        });

        test('applyLocal increments lamport counter', async () => {
            const graph = new MerkleEventGraph();
            const dagSyncer = {} as any;
            const state = { a: 0, b: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            await walker.applyLocal({ type: 'SET', path: ['a'], value: 1, timestamp: Date.now() });
            await walker.applyLocal({ type: 'SET', path: ['b'], value: 2, timestamp: Date.now() });

            expect(walker.lamportCounter).toBe(2);
        });

        test('applyLocal uses frontier as parents', async () => {
            const graph = new MerkleEventGraph();
            const dagSyncer = {} as any;
            const state = { a: 0, b: 0, c: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            await walker.applyLocal({ type: 'SET', path: ['a'], value: 1, timestamp: Date.now() });
            const frontier1 = graph.getFrontier();

            await walker.applyLocal({ type: 'SET', path: ['b'], value: 2, timestamp: Date.now() });
            const frontier2 = graph.getFrontier();

            const node2 = graph.getNode(frontier2[0]);
            expect(node2?.parents).toEqual(frontier1);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 4. CONCURRENT OPERATION DETECTION
    // ═════════════════════════════════════════════════════════════
    describe('Concurrent Operations', () => {
        test('linear operations are not concurrent', async () => {
            const graph = new MerkleEventGraph();
            const dagSyncer = {} as any;
            const state = { a: 0, b: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            await walker.applyLocal({ type: 'SET', path: ['a'], value: 1, timestamp: Date.now() });
            const cid1 = graph.getFrontier()[0];

            await walker.applyLocal({ type: 'SET', path: ['b'], value: 2, timestamp: Date.now() });
            const cid2 = graph.getFrontier()[0];

            // cid2 is a child of cid1, so they're not concurrent
            expect((walker as any).isConcurrent(cid1, cid2)).toBe(false);
        });

        test('divergent operations are concurrent', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };
            const op3: StateOperation = {
                type: 'SET',
                path: ['c'],
                value: 3,
                timestamp: Date.now(),
            };

            // Create divergent branches
            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            const cid2 = await graph.addNode(op2, [cid1], 2, 'peer1');
            const cid3 = await graph.addNode(op3, [cid1], 2, 'peer2');

            const dagSyncer = {} as any;
            const state = {};
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            // cid2 and cid3 are concurrent (both children of cid1)
            expect((walker as any).isConcurrent(cid2, cid3)).toBe(true);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 5. LCA FINDING
    // ═════════════════════════════════════════════════════════════
    describe('LCA Finding', () => {
        test('findLCA finds common ancestor in linear history', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };
            const op3: StateOperation = {
                type: 'SET',
                path: ['c'],
                value: 3,
                timestamp: Date.now(),
            };

            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            const cid2 = await graph.addNode(op2, [cid1], 2, 'peer1');
            const cid3 = await graph.addNode(op3, [cid2], 3, 'peer1');

            const dagSyncer = {} as any;
            const state = {};
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            const lca = await (walker as any).findLCA([cid3], cid1);
            expect(lca).toBe(cid1);
        });

        test('findLCA finds common ancestor in divergent history', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };
            const op3: StateOperation = {
                type: 'SET',
                path: ['c'],
                value: 3,
                timestamp: Date.now(),
            };

            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            const cid2 = await graph.addNode(op2, [cid1], 2, 'peer1');
            const cid3 = await graph.addNode(op3, [cid1], 2, 'peer2');

            const dagSyncer = {} as any;
            const state = {};
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            const lca = await (walker as any).findLCA([cid2], cid3);
            expect(lca).toBe(cid1);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 6. TOPOLOGICAL SORT
    // ═════════════════════════════════════════════════════════════
    describe('Topological Sort', () => {
        test('sorts linear history correctly', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };
            const op3: StateOperation = {
                type: 'SET',
                path: ['c'],
                value: 3,
                timestamp: Date.now(),
            };

            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            const cid2 = await graph.addNode(op2, [cid1], 2, 'peer1');
            const cid3 = await graph.addNode(op3, [cid2], 3, 'peer1');

            const dagSyncer = {} as any;
            const state = {};
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            const ops = (walker as any).getOperationsBetween([cid3], []);
            const sorted = (walker as any).topologicalSort(ops);

            expect(sorted).toHaveLength(3);
            expect(sorted[0].cid).toBe(cid1);
            expect(sorted[1].cid).toBe(cid2);
            expect(sorted[2].cid).toBe(cid3);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 7. MERGE SCENARIOS
    // ═════════════════════════════════════════════════════════════
    describe('Merge Scenarios', () => {
        test('merge with no concurrent operations applies in order', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };

            await graph.addNode(op1, [], 1, 'peer1');
            const cid2 = await graph.addNode(op2, [graph.getFrontier()[0]], 2, 'peer1');

            const dagSyncer = {
                getNode: async (cid: string) => graph.getNode(cid),
            } as any;
            const state = { a: 0, b: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            await walker.mergeRemote(cid2);

            // After merge, walker may have created a new state object
            const mergedState = walker.getState();
            expect(mergedState.a).toBe(1);
            expect(mergedState.b).toBe(2);
        });

        test('merge with concurrent operations on different properties', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };
            const op3: StateOperation = {
                type: 'SET',
                path: ['c'],
                value: 3,
                timestamp: Date.now(),
            };

            // Create divergent branches
            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            await graph.addNode(op2, [cid1], 2, 'peer1');
            const cid3 = await graph.addNode(op3, [cid1], 2, 'peer2');

            const dagSyncer = {
                getNode: async (cid: string) => graph.getNode(cid),
            } as any;
            const state = { a: 0, b: 0, c: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            await walker.mergeRemote(cid3);

            // After merge, walker may have created a new state object
            const mergedState = walker.getState();
            // Both operations should be applied
            expect(mergedState.a).toBe(1);
            expect(mergedState.b).toBe(2);
            expect(mergedState.c).toBe(3);
        });

        test('merge with concurrent operations on same property uses last-writer-wins', async () => {
            const graph = new MerkleEventGraph();
            const op1: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const op2: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 2,
                timestamp: Date.now(),
            };
            const op3: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 3,
                timestamp: Date.now(),
            };

            // Create divergent branches with conflicting operations
            const cid1 = await graph.addNode(op1, [], 1, 'peer1');
            await graph.addNode(op2, [cid1], 2, 'peer1');
            const cid3 = await graph.addNode(op3, [cid1], 2, 'peer2');

            const dagSyncer = {
                getNode: async (cid: string) => graph.getNode(cid),
            } as any;
            const state = { a: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            await walker.mergeRemote(cid3);

            // After merge, walker may have created a new state object
            const mergedState = walker.getState();
            // Last writer wins (deterministic based on Lamport + peerId)
            expect(mergedState.a).toBeDefined();
            expect([2, 3]).toContain(mergedState.a);
        });

        // Regression: when the merged remote node is itself the LCA (the
        // common case — it's typically already the sole frontier item),
        // its lamport is absent from the "ops strictly between frontier and
        // LCA" list, so it must still be folded into lamportCounter
        // explicitly. Otherwise the next local op can be assigned a lamport
        // that collides with (and sorts before) the already-merged remote
        // op, corrupting replay order.
        test('lamportCounter does not fall behind when the merged remote node is the LCA', async () => {
            const graph = new MerkleEventGraph();
            const remoteOp: StateOperation = {
                type: 'SET',
                path: ['a'],
                value: 1,
                timestamp: Date.now(),
            };
            const remoteCid = await graph.addNode(remoteOp, [], 5, 'peer2');

            const dagSyncer = {
                getNode: async (cid: string) => graph.getNode(cid),
            } as any;
            const state = { a: 0, b: 0 };
            const walker = new EgWalker(graph, dagSyncer, state, 'peer1');

            await walker.mergeRemote(remoteCid);
            expect(walker.lamportCounter).toBeGreaterThanOrEqual(5);

            const localOp: StateOperation = {
                type: 'SET',
                path: ['b'],
                value: 2,
                timestamp: Date.now(),
            };
            const localCid = await walker.applyLocal(localOp);
            const localNode = graph.getNode(localCid);

            expect(localNode!.lamport).toBeGreaterThan(5);
        });
    });
});
