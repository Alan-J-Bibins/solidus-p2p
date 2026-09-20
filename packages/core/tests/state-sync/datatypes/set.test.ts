import { describe, expect, test } from 'vite-plus/test';

import { AssetReferenceTracker } from '../../../src/state-sync/asset/reference-tracker.ts';
import { Asset } from '../../../src/state-sync/datatypes/asset.ts';
import { createSetWrapper } from '../../../src/state-sync/datatypes/set.ts';
import { makeTracker } from '../utils.ts';

describe('Testing the SetWrapper class', () => {
    // ─── Basic reads ─────────────────────────────────────────────────────────
    test('has returns true for existing value', () => {
        const { trackOp } = makeTracker();
        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        expect(set.has(2)).toBe(true);
    });

    test('has returns false for missing value', () => {
        const { trackOp } = makeTracker();
        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        expect(set.has(99)).toBe(false);
    });

    test('size returns correct count', () => {
        const { trackOp } = makeTracker();
        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        expect(set.size).toBe(3);
    });

    // ─── add ─────────────────────────────────────────────────────────────────
    test('add emits SET_ADD for new value', () => {
        const { ops, trackOp } = makeTracker();
        const set = createSetWrapper(new Set(), trackOp);

        set.add('value');

        expect(ops).toStrictEqual([
            {
                type: 'SET_ADD',
                path: [],
                value: 'value',
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('add emits no op for duplicate value', () => {
        const { ops, trackOp } = makeTracker();
        const set = createSetWrapper(new Set(['value']), trackOp);

        set.add('value');

        expect(ops).toHaveLength(0);
    });

    test('add returns the set for chaining', () => {
        const { trackOp } = makeTracker();
        const set = createSetWrapper(new Set(), trackOp);

        const result = set.add('a');

        expect(result).toBe(set);
    });

    test('multiple adds emit individual ops', () => {
        const { ops, trackOp } = makeTracker();
        const set = createSetWrapper(new Set(), trackOp);

        set.add(1);
        set.add(2);
        set.add(3);

        expect(ops).toHaveLength(3);
    });

    // ─── delete ──────────────────────────────────────────────────────────────
    test('delete emits SET_REMOVE for existing value', () => {
        const { ops, trackOp } = makeTracker();

        const set = createSetWrapper(new Set(['value']), trackOp);

        const result = set.delete('value');

        expect(result).toBe(true);
        expect(ops).toStrictEqual([
            {
                type: 'SET_REMOVE',
                path: [],
                value: 'value',
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('delete returns false for missing value and emits no op', () => {
        const { ops, trackOp } = makeTracker();
        const set = createSetWrapper(new Set(), trackOp);

        const result = set.delete('missing');

        expect(result).toBe(false);
        expect(ops).toHaveLength(0);
    });

    // ─── clear ───────────────────────────────────────────────────────────────
    test('clear emits SET_CLEAR and empties set', () => {
        const { ops, trackOp } = makeTracker();

        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        set.clear();

        expect(ops).toStrictEqual([
            {
                type: 'SET_CLEAR',
                path: [],
                value: null,
                timestamp: expect.any(Number),
            },
        ]);

        expect(set.size).toBe(0);
    });

    test('clear on empty set emits op', () => {
        const { ops, trackOp } = makeTracker();
        const set = createSetWrapper(new Set(), trackOp);

        set.clear();

        expect(ops).toHaveLength(1);
        expect(set.size).toBe(0);
    });

    // ─── keys, values, entries ───────────────────────────────────────────────
    test('keys returns iterator of values', () => {
        const { trackOp } = makeTracker();

        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        const keys = [...set.keys()];

        expect(keys).toEqual([1, 2, 3]);
    });

    test('values returns iterator of values', () => {
        const { trackOp } = makeTracker();

        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        const values = [...set.values()];

        expect(values).toEqual([1, 2, 3]);
    });

    test('entries returns iterator of [value, value] pairs', () => {
        const { trackOp } = makeTracker();

        const set = createSetWrapper(new Set([1, 2]), trackOp);

        const entries = [...set.entries()];

        expect(entries).toEqual([
            [1, 1],
            [2, 2],
        ]);
    });

    // ─── forEach ─────────────────────────────────────────────────────────────
    test('forEach iterates over all values', () => {
        const { trackOp } = makeTracker();

        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        const collected: number[] = [];

        set.forEach((value) => {
            collected.push(value);
        });

        expect(collected).toEqual([1, 2, 3]);
    });

    // ─── Symbol.iterator ─────────────────────────────────────────────────────
    test('set is iterable via for...of', () => {
        const { trackOp } = makeTracker();

        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        const collected: number[] = [];

        for (const value of set) {
            collected.push(value);
        }

        expect(collected).toEqual([1, 2, 3]);
    });

    test('spread operator works on set', () => {
        const { trackOp } = makeTracker();

        const set = createSetWrapper(new Set([1, 2, 3]), trackOp);

        const values = [...set];

        expect(values).toEqual([1, 2, 3]);
    });

    // ─── Empty set operations ────────────────────────────────────────────────
    test('operations on empty set', () => {
        const { ops, trackOp } = makeTracker();

        const set = createSetWrapper(new Set(), trackOp);

        expect(set.size).toBe(0);
        expect(set.has('anything')).toBe(false);
        expect([...set.values()]).toEqual([]);
        expect(ops).toHaveLength(0);
    });

    // ─── Different value types ───────────────────────────────────────────────
    test('works with number values', () => {
        const { ops, trackOp } = makeTracker();

        const set = createSetWrapper(new Set<number>(), trackOp);

        set.add(42);

        expect(ops[0].value).toBe(42);
        expect(set.has(42)).toBe(true);
    });

    test('works with object values (reference equality)', () => {
        const { ops, trackOp } = makeTracker();

        const set = createSetWrapper(new Set<object>(), trackOp);

        const obj = { foo: 'bar' };

        set.add(obj);

        expect(ops).toHaveLength(1);
        expect(set.has(obj)).toBe(true);
        expect(set.has({ foo: 'bar' })).toBe(false);
    });

    // ─── Asset tracking ──────────────────────────────────────────────────────
    test('tracks Asset added to a set', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('set-asset-1', 100, 'image/png');

        const set = createSetWrapper<Asset>(new Set(), () => {}, [], tracker);

        set.add(asset);

        expect(tracker.count('set-asset-1')).toBe(1);
    });

    test('does not add duplicate Asset references to a set', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('set-asset-duplicate', 100, 'image/png');

        const set = createSetWrapper<Asset>(new Set(), () => {}, [], tracker);

        set.add(asset);
        set.add(asset);

        expect(tracker.count('set-asset-duplicate')).toBe(1);
    });

    test('removes Asset reference when a set value is deleted', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('set-asset-delete', 100, 'image/png');

        const set = createSetWrapper<Asset>(new Set([asset]), () => {}, [], tracker);

        tracker.addState(set);

        set.delete(asset);

        expect(tracker.count('set-asset-delete')).toBe(0);
    });

    test('removes Asset references when a set is cleared', () => {
        const tracker = new AssetReferenceTracker();

        const asset1 = new Asset('set-clear-1', 100, 'image/png');

        const asset2 = new Asset('set-clear-2', 200, 'image/jpeg');

        const set = createSetWrapper<Asset>(new Set([asset1, asset2]), () => {}, [], tracker);

        tracker.addState(set);

        expect(tracker.count('set-clear-1')).toBe(1);
        expect(tracker.count('set-clear-2')).toBe(1);

        set.clear();

        expect(tracker.count('set-clear-1')).toBe(0);
        expect(tracker.count('set-clear-2')).toBe(0);
    });
});
