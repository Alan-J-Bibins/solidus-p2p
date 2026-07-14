import { describe, test, expect } from 'vite-plus/test';

import { createState } from '../../src/state-sync/index.ts';

describe('CRDT Proxy Handler Test Suite', () => {
    test('should intercept deep property mutations and generate a SET operation payload', () => {
        const generatedOps: any[] = [];
        const trackOp = (op: any) => generatedOps.push(op);

        const initialState = {
            user: {
                preferences: { theme: 'light' },
            },
        };

        // Act: Wrap the state in your custom proxy handler
        const state = createState(initialState, trackOp);

        // Mutate a deeply nested key just like normal JS
        state.user.preferences.theme = 'dark';

        // Assert: Verify local changes apply while emitting the explicit operation
        expect(state.user.preferences.theme).toBe('dark');
        expect(generatedOps).toHaveLength(1);
        expect(generatedOps[0]).toEqual({
            type: 'SET',
            path: ['user', 'preferences', 'theme'],
            value: 'dark',
            timestamp: expect.any(Number),
        });
    });

    test('should intercept array methods and capture them as cohesive list mutations', () => {
        const generatedOps: any[] = [];
        const trackOp = (op: any) => generatedOps.push(op);

        const state = createState({ tasks: ['Task 1'] }, trackOp);

        // Act: Push a new item into the nested array
        state.tasks.push('Task 2');

        // Assert: Confirm array indices match and did not generate raw index assignment noise
        expect(state.tasks).toEqual(['Task 1', 'Task 2']);
        expect(generatedOps).toHaveLength(1);
        expect(generatedOps[0]).toEqual({
            type: 'ARRAY_INSERT',
            path: ['tasks'],
            index: 1,
            value: 'Task 2',
            timestamp: expect.any(Number),
        });
    });

    test('should maintain object identity references across multiple reads to prevent memory/render leaks', () => {
        const state = createState({ profile: { name: 'Alan' } }, () => {});

        // Act: Read the same nested object branch twice
        const readOne = state.profile;
        const readTwo = state.profile;

        // Assert: Check strict structural identity reference
        expect(readOne).toBe(readTwo);
    });
});
