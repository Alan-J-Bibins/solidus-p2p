import { describe, expect, test } from 'vite-plus/test';

import { createArrayWrapper } from '../../../src/state-sync/datatypes/array.ts';
import { makeTracker } from '../utils.ts';

describe('Testing the ArrayWrapper class', () => {
    test('Testing reads', () => {
        const { ops, trackOp } = makeTracker();
        const initial: number[] = [];
        const array = createArrayWrapper(initial, trackOp);
        array.push(9);

        expect(ops).toHaveLength(1);
        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_INSERT',
                path: ['0'],
                value: 9,
                timestamp: expect.any(Number),
            },
        ]);
    });
    test('Assigning value to a specific index', () => {
        const { ops, trackOp } = makeTracker();
        const initial: number[] = [];
        const array = createArrayWrapper(initial, trackOp);
        array[0] = 10;

        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_INSERT',
                path: ['0'],
                value: 10,
                timestamp: expect.any(Number),
            },
        ]);
    });

    // ─── push ────────────────────────────────────────────────────────────────
    test('push with multiple items emits individual ARRAY_INSERT ops', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2], trackOp);
        array.push(3, 4, 5);

        expect(ops).toStrictEqual([
            { type: 'ARRAY_INSERT', path: ['2'], value: 3, timestamp: expect.any(Number) },
            { type: 'ARRAY_INSERT', path: ['3'], value: 4, timestamp: expect.any(Number) },
            { type: 'ARRAY_INSERT', path: ['4'], value: 5, timestamp: expect.any(Number) },
        ]);
    });

    test('push returns new length', () => {
        const { trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2], trackOp);
        expect(array.push(3)).toBe(3);
        expect(array.push(4, 5)).toBe(5);
    });

    // ─── pop ─────────────────────────────────────────────────────────────────
    test('pop emits ARRAY_REMOVE and returns last element', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([10, 20, 30], trackOp);
        const popped = array.pop();

        expect(popped).toBe(30);
        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_REMOVE',
                path: ['2'],
                value: 30,
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('pop on empty array emits no op and returns undefined', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper<number>([], trackOp);
        expect(array.pop()).toBeUndefined();
        expect(ops).toHaveLength(0);
    });

    // ─── shift ───────────────────────────────────────────────────────────────
    test('shift emits ARRAY_REMOVE at index 0 and returns first element', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([100, 200, 300], trackOp);
        const shifted = array.shift();

        expect(shifted).toBe(100);
        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_REMOVE',
                path: ['0'],
                value: 100,
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('shift on empty array emits no op', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper<number>([], trackOp);
        expect(array.shift()).toBeUndefined();
        expect(ops).toHaveLength(0);
    });

    // ─── unshift ─────────────────────────────────────────────────────────────
    test('unshift emits ARRAY_INSERT ops for each item at front', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([4], trackOp);
        array.unshift(1, 2, 3);

        expect(ops).toStrictEqual([
            { type: 'ARRAY_INSERT', path: ['0'], value: 1, timestamp: expect.any(Number) },
            { type: 'ARRAY_INSERT', path: ['1'], value: 2, timestamp: expect.any(Number) },
            { type: 'ARRAY_INSERT', path: ['2'], value: 3, timestamp: expect.any(Number) },
        ]);
    });

    test('unshift returns new length', () => {
        const { trackOp } = makeTracker();
        const array = createArrayWrapper([1], trackOp);
        expect(array.unshift(0)).toBe(2);
    });

    // ─── splice ──────────────────────────────────────────────────────────────
    test('splice delete-only emits ARRAY_REMOVE ops', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3, 4, 5], trackOp);
        const removed = array.splice(1, 2);

        expect(removed).toEqual([2, 3]);
        expect(ops).toStrictEqual([
            { type: 'ARRAY_REMOVE', path: ['1'], value: 2, timestamp: expect.any(Number) },
            { type: 'ARRAY_REMOVE', path: ['1'], value: 3, timestamp: expect.any(Number) },
        ]);
    });

    test('splice insert-only emits ARRAY_INSERT ops', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 4], trackOp);
        array.splice(1, 0, 2, 3);

        expect(ops).toStrictEqual([
            { type: 'ARRAY_INSERT', path: ['1'], value: 2, timestamp: expect.any(Number) },
            { type: 'ARRAY_INSERT', path: ['2'], value: 3, timestamp: expect.any(Number) },
        ]);
    });

    test('splice delete + insert emits REMOVE then INSERT', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3, 4], trackOp);
        array.splice(1, 2, 20, 30);

        expect(ops).toStrictEqual([
            { type: 'ARRAY_REMOVE', path: ['1'], value: 2, timestamp: expect.any(Number) },
            { type: 'ARRAY_REMOVE', path: ['1'], value: 3, timestamp: expect.any(Number) },
            { type: 'ARRAY_INSERT', path: ['1'], value: 20, timestamp: expect.any(Number) },
            { type: 'ARRAY_INSERT', path: ['2'], value: 30, timestamp: expect.any(Number) },
        ]);
    });

    test('splice with negative start resolves from end', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3, 4, 5], trackOp);
        array.splice(-2, 1);

        expect(ops[0].path).toEqual(['3']);
        expect(ops[0].value).toBe(4);
    });

    test('splice omitting deleteCount removes all from start to end', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3, 4], trackOp);
        const removed = array.splice(1);

        expect(removed).toEqual([2, 3, 4]);
        expect(ops).toHaveLength(3);
    });

    // ─── sort ────────────────────────────────────────────────────────────────
    test('sort emits ARRAY_REPLACE with sorted values', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([3, 1, 2], trackOp);
        array.sort();

        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_REPLACE',
                path: [],
                value: [1, 2, 3],
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('sort with custom compareFn', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3], trackOp);
        array.sort((a, b) => b - a);

        expect(ops[0].value).toEqual([3, 2, 1]);
    });

    test('sort on empty array emits ARRAY_REPLACE with empty array', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper<number>([], trackOp);
        array.sort();

        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_REPLACE',
                path: [],
                value: [],
                timestamp: expect.any(Number),
            },
        ]);
    });

    // ─── reverse ─────────────────────────────────────────────────────────────
    test('reverse emits ARRAY_REPLACE with reversed values', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3], trackOp);
        array.reverse();

        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_REPLACE',
                path: [],
                value: [3, 2, 1],
                timestamp: expect.any(Number),
            },
        ]);
    });

    // ─── fill ────────────────────────────────────────────────────────────────
    test('fill emits ARRAY_REPLACE with filled values', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3], trackOp);
        array.fill(0);

        expect(ops[0]).toStrictEqual({
            type: 'ARRAY_REPLACE',
            path: [],
            value: [0, 0, 0],
            timestamp: expect.any(Number),
        });
    });

    test('fill with start and end bounds', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3, 4], trackOp);
        array.fill(99, 1, 3);

        expect(ops[0].value).toEqual([1, 99, 99, 4]);
    });

    // ─── copyWithin ──────────────────────────────────────────────────────────
    test('copyWithin emits ARRAY_REPLACE', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3, 4, 5], trackOp);
        array.copyWithin(0, 3);

        expect(ops[0]).toStrictEqual({
            type: 'ARRAY_REPLACE',
            path: [],
            value: [4, 5, 3, 4, 5],
            timestamp: expect.any(Number),
        });
    });

    // ─── setIndex (via bracket assignment) ───────────────────────────────────
    test('setting existing index emits ARRAY_UPDATE', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([10, 20, 30], trackOp);
        array[1] = 99;

        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_UPDATE',
                path: ['1'],
                value: 99,
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('setting index past end emits ARRAY_INSERT', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1], trackOp);
        array[5] = 50;

        expect(ops[0].type).toBe('ARRAY_INSERT');
        expect(ops[0].path).toEqual(['5']);
        expect(ops[0].value).toBe(50);
    });

    // ─── setLength (via length assignment) ───────────────────────────────────
    test('setting length shorter emits ARRAY_RESIZE', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3, 4, 5], trackOp);
        array.length = 2;

        expect(ops).toStrictEqual([
            {
                type: 'ARRAY_RESIZE',
                path: [],
                value: 2,
                timestamp: expect.any(Number),
            },
        ]);
    });

    test('setting length to same value emits no op', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2, 3], trackOp);
        array.length = 3;
        expect(ops).toHaveLength(0);
    });

    test('setting length longer emits ARRAY_RESIZE', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1], trackOp);
        array.length = 5;

        expect(ops[0].type).toBe('ARRAY_RESIZE');
        expect(ops[0].value).toBe(5);
    });

    // ─── deleteIndex (via delete operator) ───────────────────────────────────
    test('delete emits ARRAY_REMOVE via splice delegation', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([10, 20, 30], trackOp);
        delete array[1];

        expect(ops).toStrictEqual([
            { type: 'ARRAY_REMOVE', path: ['1'], value: 20, timestamp: expect.any(Number) },
        ]);
    });

    test('delete out-of-bounds index emits no op', () => {
        const { ops, trackOp } = makeTracker();
        const array = createArrayWrapper([1, 2], trackOp);
        delete array[5];
        expect(ops).toHaveLength(0);
    });
});
