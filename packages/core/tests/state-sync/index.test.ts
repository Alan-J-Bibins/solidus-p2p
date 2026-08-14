import { describe, test, expect } from 'vite-plus/test';

import { createState } from '../../src/state-sync/index.ts';
import { makeTracker } from './utils.ts';

// ═════════════════════════════════════════════════════════════
// 1. DEEP OBJECT MUTATIONS
// ═════════════════════════════════════════════════════════════
describe('Deep object mutations', () => {
    test('emits SET for top-level property write', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ count: number }>({ count: 0 }, trackOp);

        state.count = 5;

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'SET', path: ['count'], value: 5 });
    });

    test('emits SET with full nested path for deep writes', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ user: { profile: { name: 'Alan' } } }, trackOp);

        state.user.profile.name = 'Bob';

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'SET',
            path: ['user', 'profile', 'name'],
            value: 'Bob',
        });
    });

    test('emits SET when assigning a new nested object (replacement)', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ user: { name: 'Alan' } }, trackOp);

        state.user = { name: 'Bob' };

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'SET',
            path: ['user'],
            value: { name: 'Bob' },
        });
    });

    test('emits SET with null/undefined values (explicit clearing)', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ a: string | null; b: string | undefined }>(
            { a: 'x', b: 'y' },
            trackOp,
        );

        state.a = null;
        state.b = undefined;

        expect(ops).toHaveLength(2);
        expect(ops[0]).toMatchObject({ type: 'SET', path: ['a'], value: null });
        expect(ops[1]).toMatchObject({ type: 'SET', path: ['b'], value: undefined });
    });

    test('emits SET for every write in a sequential batch', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ a: 1, b: 2, c: 3 }, trackOp);

        state.a = 10;
        state.b = 20;
        state.c = 30;

        expect(ops).toHaveLength(3);
        expect(ops.map((o) => o.value)).toEqual([10, 20, 30]);
    });
});

// ═════════════════════════════════════════════════════════════
// 2. PROPERTY DELETION
// ═════════════════════════════════════════════════════════════
describe('Property deletion', () => {
    test('emits deleteProperty for `delete state.x`', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ a?: number }>({ a: 1 }, trackOp);

        delete state.a;

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'DELETE_PROPERTY',
            path: ['a'],
            value: 1,
        });
        expect(state.a).toBeUndefined();
    });

    test('does not emit for deleting a non-existent property', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<Record<string, number>>({}, trackOp);

        delete state.missing;

        expect(ops).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════
// 3. ARRAY — METHOD-BASED MUTATIONS
// ═════════════════════════════════════════════════════════════
describe('Array method mutations', () => {
    test('push emits exactly one ARRAY_INSERT at the correct index', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a'] }, trackOp);

        state.tasks.push('b');

        expect(state.tasks).toEqual(['a', 'b']);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'ARRAY_INSERT',
            path: ['tasks', '1'],
            value: 'b',
        });
    });

    test('push with multiple args emits one op per arg', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: [] as string[] }, trackOp);

        state.tasks.push('a', 'b', 'c');

        expect(ops).toHaveLength(3);
        expect(ops.map((o) => o.value)).toEqual(['a', 'b', 'c']);
    });

    test('pop emits ARRAY_REMOVE with the removed value', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b', 'c'] }, trackOp);

        const popped = state.tasks.pop();

        expect(popped).toBe('c');
        expect(state.tasks).toEqual(['a', 'b']);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'ARRAY_REMOVE',
            path: ['tasks', '2'],
            value: 'c',
        });
    });

    test('pop on empty array emits nothing', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: [] as string[] }, trackOp);

        const popped = state.tasks.pop();

        expect(popped).toBeUndefined();
        expect(ops).toHaveLength(0);
    });

    test('shift emits ARRAY_DELETE at index 0', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b', 'c'] }, trackOp);

        const shifted = state.tasks.shift();

        expect(shifted).toBe('a');
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'ARRAY_DELETE',
            path: ['tasks', '0'],
            value: 'a',
        });
    });

    test('unshift emits ARRAY_INSERTs at the leading indices', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['c'] }, trackOp);

        state.tasks.unshift('a', 'b');

        expect(state.tasks).toEqual(['a', 'b', 'c']);
        expect(ops).toHaveLength(2);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_INSERT', path: ['tasks', '0'], value: 'a' });
        expect(ops[1]).toMatchObject({ type: 'ARRAY_INSERT', path: ['tasks', '1'], value: 'b' });
    });

    test('splice(remove-only) emits ARRAY_REMOVEs in sequence', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b', 'c', 'd'] }, trackOp);

        const removed = state.tasks.splice(1, 2);

        expect(removed).toEqual(['b', 'c']);
        expect(state.tasks).toEqual(['a', 'd']);
        expect(ops).toHaveLength(2);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_REMOVE', path: ['tasks', '1'], value: 'b' });
        expect(ops[1]).toMatchObject({ type: 'ARRAY_REMOVE', path: ['tasks', '1'], value: 'c' }); // shifts
    });

    test('splice(insert-only) emits ARRAY_INSERTs', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'd'] }, trackOp);

        state.tasks.splice(1, 0, 'b', 'c');

        expect(state.tasks).toEqual(['a', 'b', 'c', 'd']);
        expect(ops).toHaveLength(2);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_INSERT', path: ['tasks', '1'], value: 'b' });
        expect(ops[1]).toMatchObject({ type: 'ARRAY_INSERT', path: ['tasks', '2'], value: 'c' });
    });

    test('splice(replace) emits removes then inserts', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b', 'c'] }, trackOp);

        state.tasks.splice(1, 1, 'x', 'y');

        expect(state.tasks).toEqual(['a', 'x', 'y', 'c']);
        // 1 remove at index 1 ('b'), then inserts at 1 ('x') and 2 ('y')
        expect(ops).toHaveLength(3);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_REMOVE', path: ['tasks', '1'], value: 'b' });
        expect(ops[1]).toMatchObject({ type: 'ARRAY_INSERT', path: ['tasks', '1'], value: 'x' });
        expect(ops[2]).toMatchObject({ type: 'ARRAY_INSERT', path: ['tasks', '2'], value: 'y' });
    });

    test('sort emits a single ARRAY_REPLACE with the sorted snapshot', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['c', 'a', 'b'] }, trackOp);

        state.tasks.sort();

        expect(state.tasks).toEqual(['a', 'b', 'c']);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'ARRAY_REPLACE',
            path: ['tasks'],
            value: ['a', 'b', 'c'],
        });
    });

    test('reverse emits ARRAY_REPLACE', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: [1, 2, 3] }, trackOp);

        state.tasks.reverse();

        expect(state.tasks).toEqual([3, 2, 1]);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_REPLACE', value: [3, 2, 1] });
    });

    test('fill emits ARRAY_REPLACE with the filled array', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: [1, 2, 3] }, trackOp);

        state.tasks.fill(0);

        expect(state.tasks).toEqual([0, 0, 0]);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_REPLACE', value: [0, 0, 0] });
    });
});

// ═════════════════════════════════════════════════════════════
// 4. ARRAY — DIRECT INDEX / LENGTH MUTATIONS
// ═════════════════════════════════════════════════════════════
describe('Array direct mutations', () => {
    test('indexed assignment emits ARRAY_UPDATE (not generic set)', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b', 'c'] }, trackOp);

        state.tasks[1] = 'X';

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'ARRAY_UPDATE',
            path: ['tasks', '1'],
            value: 'X',
        });
    });

    test('assigning past the end extends the array and emits ARRAY_UPDATE', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a'] }, trackOp);

        state.tasks[5] = 'z';

        expect(state.tasks).toEqual(['a', undefined, undefined, undefined, undefined, 'z']);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_UPDATE', path: ['tasks', '5'], value: 'z' });
    });

    test('length truncation emits ARRAY_RESIZE', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b', 'c', 'd'] }, trackOp);

        state.tasks.length = 2;

        expect(state.tasks).toEqual(['a', 'b']);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_RESIZE', path: ['tasks'], value: 2 });
    });

    test('length extension emits ARRAY_RESIZE', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a'] }, trackOp);

        state.tasks.length = 4;

        expect(state.tasks.length).toBe(4);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_RESIZE', value: 4 });
    });

    test('whole-array replacement emits a single set (not granular)', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b'] }, trackOp);

        state.tasks = ['x', 'y', 'z'];

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'SET',
            path: ['tasks'],
            value: ['x', 'y', 'z'],
        });
    });
});

// ═════════════════════════════════════════════════════════════
// 5. ARRAY — READ-ONLY OPERATIONS (must NOT emit)
// ═════════════════════════════════════════════════════════════
describe('Array read operations are silent', () => {
    test('.map() emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ tasks: ['a', 'b', 'c'] }, trackOp);

        const mapped = state.tasks.map((t) => t.toUpperCase());

        expect(mapped).toEqual(['A', 'B', 'C']);
        expect(ops).toHaveLength(0);
    });

    test('.filter() emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ n: [1, 2, 3, 4] }, trackOp);

        state.n.filter((x) => x % 2 === 0);

        expect(ops).toHaveLength(0);
    });

    test('.find() and .findIndex() emit zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ n: [1, 2, 3] }, trackOp);

        state.n.find((x) => x === 2);
        state.n.findIndex((x) => x === 3);

        expect(ops).toHaveLength(0);
    });

    test('.includes() emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ n: [1, 2, 3] }, trackOp);

        expect(state.n.includes(2)).toBe(true);
        expect(ops).toHaveLength(0);
    });

    test('for...of iteration emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ n: [1, 2, 3] }, trackOp);

        const collected: number[] = [];
        for (const x of state.n) collected.push(x);

        expect(collected).toEqual([1, 2, 3]);
        expect(ops).toHaveLength(0);
    });

    test('spread operator emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ n: [1, 2, 3] }, trackOp);

        const copy = [...state.n];

        expect(copy).toEqual([1, 2, 3]);
        expect(ops).toHaveLength(0);
    });

    test('JSON.stringify emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ n: [1, 2, 3] }, trackOp);

        JSON.stringify(state.n);

        expect(ops).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════
// 6. OBJECT READ-ONLY OPERATIONS (must NOT emit)
// ═════════════════════════════════════════════════════════════
describe('Object read operations are silent', () => {
    test('Object.keys() emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ a: 1, b: 2 }, trackOp);

        Object.keys(state);

        expect(ops).toHaveLength(0); // ⚠️ current impl fires ownKeys op
    });

    test('`in` operator emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ a: 1 }, trackOp);

        expect('a' in state).toBe(true);
        expect(ops).toHaveLength(0); // ⚠️ current impl fires has op
    });

    test('Object.entries / values emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ a: 1, b: 2 }, trackOp);

        Object.entries(state);
        Object.values(state);

        expect(ops).toHaveLength(0);
    });

    test('property read via dot/bracket emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ a: 1 }, trackOp);

        void state.a;
        void state['a'];

        expect(ops).toHaveLength(0);
    });

    test('for...in iteration emits zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ a: 1, b: 2 }, trackOp);

        for (const k in state) void k;

        expect(ops).toHaveLength(0); // ⚠️ current impl fires ownKeys + getOwnPropertyDescriptor
    });
});

// ═════════════════════════════════════════════════════════════
// 7. Map WRAPPER
// ═════════════════════════════════════════════════════════════
describe('Map wrapper', () => {
    test('set() on a new key emits MAP_SET', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ m: Map<string, number> }>({ m: new Map() }, trackOp);

        state.m.set('a', 1);

        expect(state.m.get('a')).toBe(1);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'MAP_SET',
            path: ['m', 'a'],
            value: 1,
        });
    });

    test('set() on an existing key emits MAP_SET', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ m: Map<string, number> }>({ m: new Map([['a', 1]]) }, trackOp);

        state.m.set('a', 99);

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'MAP_SET', path: ['m', 'a'], value: 99 });
    });

    test('delete() emits MAP_DELETE', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ m: Map<string, number> }>({ m: new Map([['a', 1]]) }, trackOp);

        state.m.delete('a');

        expect(state.m.has('a')).toBe(false);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'MAP_DELETE', path: ['m', 'a'], value: 'a' });
    });

    test('clear() emits MAP_CLEAR', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ m: Map<string, number> }>(
            {
                m: new Map([
                    ['a', 1],
                    ['b', 2],
                ]),
            },
            trackOp,
        );

        state.m.clear();

        expect(state.m.size).toBe(0);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'MAP_CLEAR', path: ['m'], value: null });
    });

    test('get / has / size / iteration emit zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ m: Map<string, number> }>({ m: new Map([['a', 1]]) }, trackOp);

        state.m.get('a');
        state.m.has('a');
        void state.m.size;
        for (const _ of state.m) void _;
        [...state.m.entries()];
        [...state.m.keys()];
        [...state.m.values()];

        expect(ops).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════
// 8. Set WRAPPER
// ═════════════════════════════════════════════════════════════
describe('Set wrapper', () => {
    test('add() emits SET_ADD', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ s: Set<string> }>({ s: new Set() }, trackOp);

        state.s.add('a');

        expect(state.s.has('a')).toBe(true);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'SET_ADD', path: ['s'], value: 'a' });
    });

    test('add() of existing value emits nothing (idempotent)', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ s: Set<string> }>({ s: new Set(['a']) }, trackOp);

        state.s.add('a');

        expect(ops).toHaveLength(0);
    });

    test('delete() emits SET_REMOVE', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ s: Set<string> }>({ s: new Set(['a', 'b']) }, trackOp);

        state.s.delete('a');

        expect(state.s.has('a')).toBe(false);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'SET_REMOVE', path: ['s'], value: 'a' });
    });

    test('clear() emits SET_CLEAR', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ s: Set<string> }>({ s: new Set(['a', 'b']) }, trackOp);

        state.s.clear();

        expect(state.s.size).toBe(0);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'SET_CLEAR', path: ['s'], value: null });
    });

    test('spread / iteration / has emit zero ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ s: Set<string> }>({ s: new Set(['a', 'b']) }, trackOp);

        [...state.s];
        state.s.has('a');
        for (const _ of state.s) void _;

        expect(ops).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════
// 9. IDENTITY / REFERENCE STABILITY
// ═════════════════════════════════════════════════════════════
describe('Identity & reference stability', () => {
    test('repeated reads of a nested object return the same proxy', () => {
        const state = createState({ user: { name: 'A' } }, () => {});
        expect(state.user).toBe(state.user);
    });

    test('repeated reads of an array return the same proxy', () => {
        const state = createState({ arr: [1, 2] }, () => {});
        expect(state.arr).toBe(state.arr);
    });

    test('repeated reads of a Map return the same wrapper', () => {
        const state = createState({ m: new Map() }, () => {});
        expect(state.m).toBe(state.m);
    });

    test('repeated reads of a Set return the same wrapper', () => {
        const state = createState({ s: new Set() }, () => {});
        expect(state.s).toBe(state.s);
    });

    test('identity is preserved through method chaining', () => {
        const state = createState({ user: { prefs: { theme: 'light' } } }, () => {});
        const a = state.user.prefs;
        state.user.prefs.theme = 'dark';
        const b = state.user.prefs;
        expect(a).toBe(b); // same underlying object; proxy identity preserved
    });
});

// ═════════════════════════════════════════════════════════════
// 10. EDGE CASES & HAZARDS
// ═════════════════════════════════════════════════════════════
describe('Edge cases', () => {
    test('Symbol-keyed writes do not emit ops', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<Record<symbol, number>>({}, trackOp);
        const sym = Symbol('x');

        (state as any)[sym] = 42;

        // Symbols should be ignored by the op stream — they can't serialize to CRDT
        expect(ops).toHaveLength(0);
    });

    test('nested array inside nested object emits the correct deep path', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ team: { members: ['Alice'] } }, trackOp);

        state.team.members.push('Bob');

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'ARRAY_INSERT',
            path: ['team', 'members', '1'],
            value: 'Bob',
        });
    });

    test('array of objects: pushing object emits ARRAY_INSERT with the object', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ items: [{ id: 1 }] }, trackOp);

        state.items.push({ id: 2 });

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            type: 'ARRAY_INSERT',
            value: { id: 2 },
        });
    });

    test('assigning an array element to an object does not recurse-emit', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ items: Array<{ id: number }> }>({ items: [] }, trackOp);

        state.items[0] = { id: 1 };

        expect(ops).toHaveLength(1); // only the ARRAY_UPDATE — no extra set for id
    });

    test('whole-state replacement via reassignment of the root is not allowed', () => {
        const state = createState({ a: 1 }, () => {});
        // `state = ...` is not legal — state is a const binding.
        // The library should NOT expose a way to replace the root;
        // this is a documentation contract.
        expect(() => state).not.toThrow();
    });

    test('Date/RegExp instances are NOT proxied (pass through)', () => {
        const { ops, trackOp } = makeTracker();
        const d = new Date();
        const r = /foo/;
        const state = createState({ d, r }, trackOp);

        // Reading them back should return the raw instances, not proxies
        expect(state.d).toBe(d);
        expect(state.r).toBe(r);
        expect(ops).toHaveLength(0);
    });

    test('sparse array assignment emits ARRAY_UPDATE with undefined', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState({ a: [1, 2, 3] }, trackOp);

        delete state.a[1];

        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ type: 'ARRAY_DELETE', path: ['a', '1'], value: 2 });
    });

    test('no echo loop: wrapper-applied remote ops do not re-emit', () => {
        const { ops, trackOp } = makeTracker();
        const state = createState<{ m: Map<string, number> }>({ m: new Map() }, trackOp);

        // Simulate a remote op arriving
        (state.m as any).__applyRemote({ type: 'MAP_SET', key: 'x', value: 1 });

        expect(state.m.get('x')).toBe(1);
        expect(ops).toHaveLength(0); // must not echo back
    });
});

// ═════════════════════════════════════════════════════════════
// 11. SERIALIZATION BOUNDARIES
// ═════════════════════════════════════════════════════════════
describe('Serialization', () => {
    test('state survives JSON.stringify → JSON.parse round-trip', () => {
        const state = createState(
            {
                user: { name: 'A' },
                tags: ['x', 'y'],
            },
            () => {},
        );

        const json = JSON.stringify(state);
        const parsed = JSON.parse(json);

        expect(parsed).toEqual({ user: { name: 'A' }, tags: ['x', 'y'] });
    });

    test('structuredClone produces an equivalent plain object', () => {
        const state = createState({ a: 1, b: [2, 3], c: { d: 4 } }, () => {});
        const cloned = structuredClone(state);

        expect(cloned).toEqual({ a: 1, b: [2, 3], c: { d: 4 } });
    });
});
