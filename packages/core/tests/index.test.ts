import { describe, test, expect } from 'vite-plus/test';
import * as Y from 'yjs';

import { solidus } from '../src/index.ts';
import { AssetReferenceTracker } from '../src/state-sync/asset/reference-tracker.ts';
import { Asset } from '../src/state-sync/index.ts';
import { createState } from '../src/state-sync/index.ts';
import { yjs } from '../src/state-sync/integrations/yjs.ts';
describe('State Sync Functionality Test with YJs Integration', () => {
    // ═════════════════════════════════════════════════════════════
    // 1. BASIC OBJECT OPERATIONS
    // ═════════════════════════════════════════════════════════════
    test('SET operation updates Yjs doc', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ count: number }>({ count: 0 });

        state.count = 42;

        const rootMap = doc.getMap('root');
        expect(rootMap.get('count')).toBe(42);
    });

    test('nested SET creates nested Y.Map structure', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({ user: { name: 'Alice' } });

        state.user.name = 'Bob';

        const rootMap = doc.getMap('root');
        const userMap = rootMap.get('user') as Y.Map<any>;
        expect(userMap.get('name')).toBe('Bob');
    });

    test('DELETE_PROPERTY removes from Yjs doc', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ a?: number }>({ a: 1 });

        delete state.a;

        const rootMap = doc.getMap('root');
        expect(rootMap.has('a')).toBe(false);
    });

    // ═════════════════════════════════════════════════════════════
    // 2. ARRAY OPERATIONS
    // ═════════════════════════════════════════════════════════════
    test('array push updates Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({ items: ['a'] });

        state.items.push('b');

        const rootMap = doc.getMap('root');
        const itemsArray = rootMap.get('items') as Y.Array<any>;
        expect(itemsArray.toArray()).toEqual(['a', 'b']);
    });

    test('array pop updates Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({ items: ['a', 'b', 'c'] });

        state.items.pop();

        const rootMap = doc.getMap('root');
        const itemsArray = rootMap.get('items') as Y.Array<any>;
        expect(itemsArray.toArray()).toEqual(['a', 'b']);
    });

    test('array index assignment updates Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({ items: ['a', 'b', 'c'] });

        state.items[1] = 'X';

        const rootMap = doc.getMap('root');
        const itemsArray = rootMap.get('items') as Y.Array<any>;
        expect(itemsArray.toArray()).toEqual(['a', 'X', 'c']);
    });

    test('array splice updates Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({ items: ['a', 'b', 'c', 'd'] });

        state.items.splice(1, 2, 'x', 'y');

        const rootMap = doc.getMap('root');
        const itemsArray = rootMap.get('items') as Y.Array<any>;
        expect(itemsArray.toArray()).toEqual(['a', 'x', 'y', 'd']);
    });

    test('array length truncation updates Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({ items: [1, 2, 3, 4] });

        state.items.length = 2;

        const rootMap = doc.getMap('root');
        const itemsArray = rootMap.get('items') as Y.Array<any>;
        expect(itemsArray.toArray()).toEqual([1, 2]);
    });

    // ═════════════════════════════════════════════════════════════
    // 3. MAP OPERATIONS
    // ═════════════════════════════════════════════════════════════
    test('Map.set updates Y.Map', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ m: Map<string, number> }>({ m: new Map() });

        state.m.set('key1', 100);

        const rootMap = doc.getMap('root');
        const mMap = rootMap.get('m') as Y.Map<any>;
        expect(mMap.get('key1')).toBe(100);
    });

    test('Map.delete removes from Y.Map', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ m: Map<string, number> }>({
            m: new Map([
                ['a', 1],
                ['b', 2],
            ]),
        });

        state.m.delete('a');

        const rootMap = doc.getMap('root');
        const mMap = rootMap.get('m') as Y.Map<any>;
        expect(mMap.has('a')).toBe(false);
        expect(mMap.get('b')).toBe(2);
    });

    test('Map.clear empties Y.Map', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ m: Map<string, number> }>({
            m: new Map([
                ['a', 1],
                ['b', 2],
            ]),
        });

        state.m.clear();

        const rootMap = doc.getMap('root');
        const mMap = rootMap.get('m') as Y.Map<any>;
        expect(mMap.size).toBe(0);
    });

    // ═════════════════════════════════════════════════════════════
    // 4. SET OPERATIONS
    // ═════════════════════════════════════════════════════════════
    test('Set.add updates Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ s: Set<string> }>({ s: new Set() });

        state.s.add('item1');

        const rootMap = doc.getMap('root');
        const sArray = rootMap.get('s') as Y.Array<any>;
        expect(sArray.toArray()).toEqual(['item1']);
    });

    test('Set.delete removes from Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ s: Set<string> }>({ s: new Set(['a', 'b', 'c']) });

        state.s.delete('b');

        const rootMap = doc.getMap('root');
        const sArray = rootMap.get('s') as Y.Array<any>;
        expect(sArray.toArray()).toEqual(['a', 'c']);
    });

    test('Set.clear empties Y.Array', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ s: Set<string> }>({ s: new Set(['a', 'b']) });

        state.s.clear();

        const rootMap = doc.getMap('root');
        const sArray = rootMap.get('s') as Y.Array<any>;
        expect(sArray.toArray()).toEqual([]);
    });

    // ═════════════════════════════════════════════════════════════
    // 5. COMPLEX SCENARIOS
    // ═════════════════════════════════════════════════════════════
    test('multiple operations in sequence', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({
            user: { name: 'Alice', scores: [10, 20] },
        });

        state.user.name = 'Bob';
        state.user.scores.push(30);
        state.user.scores[0] = 15;

        const rootMap = doc.getMap('root');
        const userMap = rootMap.get('user') as Y.Map<any>;
        const scoresArray = userMap.get('scores') as Y.Array<any>;

        expect(userMap.get('name')).toBe('Bob');
        expect(scoresArray.toArray()).toEqual([15, 20, 30]);
    });

    test('deeply nested structure', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({
            level1: {
                level2: {
                    level3: {
                        items: [] as string[],
                    },
                },
            },
        });

        state.level1.level2.level3.items.push('deep');

        const rootMap = doc.getMap('root');
        const l1 = rootMap.get('level1') as Y.Map<any>;
        const l2 = l1.get('level2') as Y.Map<any>;
        const l3 = l2.get('level3') as Y.Map<any>;
        const items = l3.get('items') as Y.Array<any>;

        expect(items.toArray()).toEqual(['deep']);
    });

    test('array of objects', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState({
            users: [{ id: 1, name: 'Alice' }],
        });

        state.users.push({ id: 2, name: 'Bob' });

        const rootMap = doc.getMap('root');
        const usersArray = rootMap.get('users') as Y.Array<any>;
        const secondUser = usersArray.get(1) as Y.Map<any>;

        expect(secondUser.get('id')).toBe(2);
        expect(secondUser.get('name')).toBe('Bob');
    });

    test('object replacement creates new Y.Map', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ user: { name: string; age?: number } }>({
            user: { name: 'Alice' },
        });

        state.user = { name: 'Bob', age: 30 };

        const rootMap = doc.getMap('root');
        const userMap = rootMap.get('user') as Y.Map<any>;
        expect(userMap.get('name')).toBe('Bob');
        expect(userMap.get('age')).toBe(30);
    });

    // ═════════════════════════════════════════════════════════════
    // 6. OPERATION TRACKING
    // ═════════════════════════════════════════════════════════════
    test('operations are emitted and Yjs is updated', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const generatedOps: any[] = [];
        const state = instance.createState({ a: 1, b: [1, 2, 3] }, (op) => {
            generatedOps.push(op);
        });

        state.a = 2;
        state.b.push(4);

        // Verify operations were emitted
        expect(generatedOps).toHaveLength(2);
        expect(generatedOps[0]).toMatchObject({ type: 'SET', path: ['a'], value: 2 });
        expect(generatedOps[1]).toMatchObject({ type: 'ARRAY_INSERT', path: ['b', '3'], value: 4 });

        // Verify Yjs doc was updated
        const rootMap = doc.getMap('root');
        expect(rootMap.get('a')).toBe(2);
        const bArray = rootMap.get('b') as Y.Array<any>;
        expect(bArray.toArray()).toEqual([1, 2, 3, 4]);
    });

    // ═════════════════════════════════════════════════════════════
    // 7. VALUE SERIALIZATION
    // ═════════════════════════════════════════════════════════════
    test('nested objects are serialized correctly', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ data: any }>({ data: {} });

        state.data = { nested: { deep: { value: 42 } } };

        const rootMap = doc.getMap('root');
        const dataMap = rootMap.get('data') as Y.Map<any>;
        const nestedMap = dataMap.get('nested') as Y.Map<any>;
        const deepMap = nestedMap.get('deep') as Y.Map<any>;
        expect(deepMap.get('value')).toBe(42);
    });

    test('Date objects are serialized to ISO strings', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ date: Date | null }>({ date: null });

        const testDate = new Date('2024-01-01T00:00:00Z');
        state.date = testDate;

        const rootMap = doc.getMap('root');
        expect(rootMap.get('date')).toBe('2024-01-01T00:00:00.000Z');
    });
    test('Asset references are stored without binary data', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });

        const asset = new Asset('asset-123', 1024, 'image/png', 'photo.png');

        instance.createState<{ asset: Asset }>({ asset });

        const rootMap = doc.getMap('root');
        const storedAsset = rootMap.get('asset');

        expect(storedAsset).toEqual({
            __solidusType: 'Asset',
            id: 'asset-123',
            size: 1024,
            type: 'image/png',
            name: 'photo.png',
        });
    });
    test('Asset references deserialize from a remote Yjs update', () => {
        const sourceDoc = new Y.Doc();
        const targetDoc = new Y.Doc();

        const sourceInstance = solidus({
            plugins: [yjs({ doc: sourceDoc })],
        });

        const targetInstance = solidus({
            plugins: [yjs({ doc: targetDoc })],
        });

        sourceInstance.createState<{ asset: Asset }>({
            asset: new Asset('asset-123', 1024, 'image/png', 'photo.png'),
        });

        const targetState = targetInstance.createState<{
            asset?: Asset;
        }>({});

        const update = Y.encodeStateAsUpdate(sourceDoc);
        Y.applyUpdate(targetDoc, update);

        expect(targetState.asset).toBeInstanceOf(Asset);
        expect(targetState.asset?.id).toBe('asset-123');
        expect(targetState.asset?.size).toBe(1024);
        expect(targetState.asset?.type).toBe('image/png');
        expect(targetState.asset?.name).toBe('photo.png');
    });
    test('remote Asset updates replace an existing Asset reference', () => {
        const sourceDoc = new Y.Doc();
        const targetDoc = new Y.Doc();

        const sourceInstance = solidus({
            plugins: [yjs({ doc: sourceDoc })],
        });

        const targetInstance = solidus({
            plugins: [yjs({ doc: targetDoc })],
        });

        const sourceState = sourceInstance.createState<{ asset: Asset }>({
            asset: new Asset('asset-1', 1024, 'image/png', 'first.png'),
        });

        const targetState = targetInstance.createState<{
            asset?: Asset;
        }>({});

        // Initial synchronization.
        Y.applyUpdate(targetDoc, Y.encodeStateAsUpdate(sourceDoc));

        expect(targetState.asset).toBeInstanceOf(Asset);
        expect(targetState.asset?.id).toBe('asset-1');

        // Change the Asset on the source side.
        sourceState.asset = new Asset('asset-2', 2048, 'image/jpeg', 'second.jpg');

        // Synchronize only the new changes.
        const update = Y.encodeStateAsUpdate(sourceDoc, Y.encodeStateVector(targetDoc));
        const sourceAsset = sourceDoc.getMap('root').get('asset');

        expect(sourceAsset).toEqual({
            __solidusType: 'Asset',
            id: 'asset-2',
            size: 2048,
            type: 'image/jpeg',
            name: 'second.jpg',
        });
        Y.applyUpdate(targetDoc, update);

        expect(targetState.asset).toBeInstanceOf(Asset);
        expect(targetState.asset?.id).toBe('asset-2');
        expect(targetState.asset?.size).toBe(2048);
        expect(targetState.asset?.type).toBe('image/jpeg');
        expect(targetState.asset?.name).toBe('second.jpg');
    });
    test('tracks Assets in the initial state', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-123', 1024, 'image/png');

        createState(
            {
                image: asset,
            },
            undefined,
            tracker,
        );

        expect(tracker.count('asset-123')).toBe(1);
    });
    test('updates Asset references when a property is replaced', async () => {
        const tracker = new AssetReferenceTracker();

        const asset1 = new Asset('asset-1', 100, 'image/png');
        const asset2 = new Asset('asset-2', 200, 'image/jpeg');

        const state = createState(
            {
                image: asset1,
            },
            undefined,
            tracker,
        );

        expect(tracker.count('asset-1')).toBe(1);
        expect(tracker.count('asset-2')).toBe(0);

        state.image = asset2;

        expect(tracker.count('asset-1')).toBe(0);
        expect(tracker.count('asset-2')).toBe(1);
    });
    test('keeps an Asset while another reference still exists', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-1', 100, 'image/png');
        const anotherAsset = new Asset('asset-2', 200, 'image/jpeg');

        const state = createState(
            {
                image: asset,
                thumbnail: asset,
            },
            undefined,
            tracker,
        );

        expect(tracker.count('asset-1')).toBe(2);

        state.image = anotherAsset;

        expect(tracker.count('asset-1')).toBe(1);
        expect(tracker.count('asset-2')).toBe(1);
    });
    test('removes Asset reference when a property is deleted', async () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-1', 100, 'image/png');

        const state = createState(
            {
                image: asset,
            } as { image?: Asset },
            undefined,
            tracker,
        );

        expect(tracker.count('asset-1')).toBe(1);

        delete state.image;

        expect(tracker.count('asset-1')).toBe(0);
    });
    test('null and undefined are preserved', () => {
        const doc = new Y.Doc();
        const instance = solidus({ plugins: [yjs({ doc })] });
        const state = instance.createState<{ a: any; b: any }>({ a: 1, b: 2 });

        state.a = null;
        state.b = undefined;

        const rootMap = doc.getMap('root');
        expect(rootMap.get('a')).toBe(null);
        expect(rootMap.get('b')).toBe(undefined);
    });
    test('tracks Assets created through the public Solidus API', () => {
        const instance = solidus();

        const asset = new Asset('public-api-asset', 1024, 'image/png');
        const state = instance.createState({ asset });

        expect(state.asset).toBe(asset);
    });
});
