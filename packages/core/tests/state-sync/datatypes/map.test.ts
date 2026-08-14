import { describe, expect, test } from 'vite-plus/test';

import { createMapWrapper } from '../../../src/state-sync/datatypes/map.ts';
import { makeTracker } from '../utils.ts';

describe('Testing the MapWrapper class', () => {
    // ─── Basic reads ─────────────────────────────────────────────────────────
    test('get returns value for existing key', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        expect(map.get('a')).toBe(1);
        expect(map.get('b')).toBe(2);
    });

    test('get returns undefined for missing key', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(new Map([['a', 1]]), trackOp);
        expect(map.get('missing')).toBeUndefined();
    });

    test('has returns true for existing key', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(new Map([['a', 1]]), trackOp);
        expect(map.has('a')).toBe(true);
    });

    test('has returns false for missing key', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(new Map([['a', 1]]), trackOp);
        expect(map.has('missing')).toBe(false);
    });

    test('size returns correct count', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
                ['c', 3],
            ]),
            trackOp,
        );
        expect(map.size).toBe(3);
    });

    // ─── set ─────────────────────────────────────────────────────────────────
    test('set emits MAP_SET for new key', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map(), trackOp);
        map.set('key', 'value');

        expect(ops).toStrictEqual([
            {
                type: 'MAP_SET',
                path: ['key'],
                value: 'value',
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('set emits MAP_SET for existing key (update)', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map([['key', 'old']]), trackOp);
        map.set('key', 'new');

        expect(ops).toStrictEqual([
            {
                type: 'MAP_SET',
                path: ['key'],
                value: 'new',
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('set returns the map for chaining', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(new Map(), trackOp);
        const result = map.set('a', 1);
        expect(result).toBe(map);
    });

    test('multiple sets emit individual ops', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map(), trackOp);
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);

        expect(ops).toHaveLength(3);
        expect(ops[0].path).toEqual(['a']);
        expect(ops[1].path).toEqual(['b']);
        expect(ops[2].path).toEqual(['c']);
    });

    // ─── delete ──────────────────────────────────────────────────────────────
    test('delete emits MAP_DELETE for existing key', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map([['key', 'value']]), trackOp);
        const result = map.delete('key');

        expect(result).toBe(true);
        expect(ops).toStrictEqual([
            {
                type: 'MAP_DELETE',
                path: ['key'],
                value: 'key',
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('delete returns false for missing key and emits no op', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map(), trackOp);
        const result = map.delete('missing');

        expect(result).toBe(false);
        expect(ops).toHaveLength(0);
    });

    // ─── clear ───────────────────────────────────────────────────────────────
    test('clear emits MAP_CLEAR and empties map', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        map.clear();

        expect(ops).toStrictEqual([
            {
                type: 'MAP_CLEAR',
                path: [],
                value: null,
                timestamp: expect.any(Number),
            },
        ]);
        expect(map.size).toBe(0);
    });

    test('clear on empty map emits op', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map(), trackOp);
        map.clear();

        expect(ops).toHaveLength(1);
        expect(map.size).toBe(0);
    });

    // ─── keys, values, entries ───────────────────────────────────────────────
    test('keys returns iterator of keys', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        const keys = [...map.keys()];
        expect(keys).toEqual(['a', 'b']);
    });

    test('values returns iterator of values', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        const values = [...map.values()];
        expect(values).toEqual([1, 2]);
    });

    test('entries returns iterator of [key, value] pairs', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        const entries = [...map.entries()];
        expect(entries).toEqual([
            ['a', 1],
            ['b', 2],
        ]);
    });

    // ─── forEach ─────────────────────────────────────────────────────────────
    test('forEach iterates over all entries', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        const collected: [string, number][] = [];
        map.forEach((value, key) => {
            collected.push([key, value]);
        });
        expect(collected).toEqual([
            ['a', 1],
            ['b', 2],
        ]);
    });

    // ─── Symbol.iterator ─────────────────────────────────────────────────────
    test('map is iterable via for...of', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        const collected: [string, number][] = [];
        for (const entry of map) {
            collected.push(entry);
        }
        expect(collected).toEqual([
            ['a', 1],
            ['b', 2],
        ]);
    });

    test('spread operator works on map', () => {
        const { trackOp } = makeTracker();
        const map = createMapWrapper(
            new Map([
                ['a', 1],
                ['b', 2],
            ]),
            trackOp,
        );
        const entries = [...map];
        expect(entries).toEqual([
            ['a', 1],
            ['b', 2],
        ]);
    });

    // ─── Empty map operations ────────────────────────────────────────────────
    test('operations on empty map', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map(), trackOp);

        expect(map.size).toBe(0);
        expect(map.get('anything')).toBeUndefined();
        expect(map.has('anything')).toBe(false);
        expect([...map.keys()]).toEqual([]);
        expect([...map.values()]).toEqual([]);
        expect([...map.entries()]).toEqual([]);
        expect(ops).toHaveLength(0);
    });

    // ─── Non-string keys ─────────────────────────────────────────────────────
    test('number keys', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map<number, string>(), trackOp);
        map.set(42, 'answer');

        expect(ops[0].path).toEqual(['42']);
        expect(map.get(42)).toBe('answer');
    });

    test('object keys (stringified path)', () => {
        const { ops, trackOp } = makeTracker();
        const map = createMapWrapper(new Map<object, string>(), trackOp);
        const obj = { foo: 'bar' };
        map.set(obj, 'value');

        // Object keys get stringified in path
        expect(ops[0].path).toEqual([String(obj)]);
        expect(map.get(obj)).toBe('value');
    });
});
