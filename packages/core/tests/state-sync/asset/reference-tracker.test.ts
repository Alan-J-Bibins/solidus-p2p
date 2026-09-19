import { describe, expect, test } from 'vite-plus/test';

import { AssetReferenceTracker } from '../../../src/state-sync/asset/reference-tracker.ts';
import { AssetStore } from '../../../src/state-sync/asset/store.ts';
import { createArrayWrapper } from '../../../src/state-sync/datatypes/array.ts';
import { Asset } from '../../../src/state-sync/datatypes/asset.ts';

describe('AssetReferenceTracker', () => {
    test('tracks asset references', async () => {
        const tracker = new AssetReferenceTracker();
        const asset = new Asset('asset-123', 1024, 'image/png');

        tracker.add(asset);
        expect(tracker.count('asset-123')).toBe(1);

        tracker.add(asset);
        expect(tracker.count('asset-123')).toBe(2);

        await tracker.remove(asset);
        expect(tracker.count('asset-123')).toBe(1);

        await tracker.remove(asset);
        expect(tracker.count('asset-123')).toBe(0);
    });

    test('deletes the asset from the store when the last reference is removed', async () => {
        let deletedId: string | undefined;

        const store = {
            async delete(id: string) {
                deletedId = id;
            },
        } as unknown as AssetStore;

        const tracker = new AssetReferenceTracker(store);
        const asset = new Asset('asset-123', 1024, 'image/png');

        tracker.add(asset);

        await tracker.remove(asset);

        expect(deletedId).toBe('asset-123');
        expect(tracker.count('asset-123')).toBe(0);
    });

    test('does not delete while references remain', async () => {
        let deleteCount = 0;

        const store = {
            async delete() {
                deleteCount++;
            },
        } as unknown as AssetStore;

        const tracker = new AssetReferenceTracker(store);
        const asset = new Asset('asset-123', 1024, 'image/png');

        tracker.add(asset);
        tracker.add(asset);

        await tracker.remove(asset);

        expect(deleteCount).toBe(0);
        expect(tracker.count('asset-123')).toBe(1);

        await tracker.remove(asset);

        expect(deleteCount).toBe(1);
        expect(tracker.count('asset-123')).toBe(0);
    });

    test('tracks assets inside nested state', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-123', 1024, 'image/png');

        const state = {
            image: asset,
            nested: {
                thumbnail: asset,
            },
            images: [asset],
            map: new Map([['cover', asset]]),
            set: new Set([asset]),
        };

        tracker.addState(state);

        expect(tracker.count('asset-123')).toBe(5);
    });

    test('ignores non-Asset values', async () => {
        const tracker = new AssetReferenceTracker();

        tracker.add('not-an-asset');
        await tracker.remove('not-an-asset');

        expect(tracker.count('anything')).toBe(0);
    });

    test('tracks Assets added with array push', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-push', 100, 'image/png');

        const array = createArrayWrapper<Asset>([], () => {}, [], tracker);

        array.push(asset);

        expect(tracker.count('asset-push')).toBe(1);
    });

    test('removes Asset reference with array pop', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-pop', 100, 'image/png');

        const array = createArrayWrapper<Asset>([], () => {}, [], tracker);

        array.push(asset);
        expect(tracker.count('asset-pop')).toBe(1);

        array.pop();

        expect(tracker.count('asset-pop')).toBe(0);
    });

    test('tracks Assets added with array unshift', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-unshift', 100, 'image/png');

        const array = createArrayWrapper<Asset>([], () => {}, [], tracker);

        array.unshift(asset);

        expect(tracker.count('asset-unshift')).toBe(1);
    });

    test('tracks and removes Assets with array splice', async () => {
        const tracker = new AssetReferenceTracker();

        const asset1 = new Asset('asset-splice-1', 100, 'image/png');
        const asset2 = new Asset('asset-splice-2', 200, 'image/jpeg');

        const array = createArrayWrapper<Asset>([asset1], () => {}, [], tracker);

        tracker.addState(array);

        expect(tracker.count('asset-splice-1')).toBe(1);

        array.splice(0, 1, asset2);

        expect(tracker.count('asset-splice-1')).toBe(0);
        expect(tracker.count('asset-splice-2')).toBe(1);
    });

    test('tracks Assets added with array index assignment', () => {
        const tracker = new AssetReferenceTracker();

        const asset = new Asset('asset-index', 100, 'image/png');

        const array = createArrayWrapper<Asset>([], () => {}, [], tracker);

        array[0] = asset;

        expect(tracker.count('asset-index')).toBe(1);
    });

    test('removes Asset reference when an array index is replaced', () => {
        const tracker = new AssetReferenceTracker();

        const asset1 = new Asset('asset-old', 100, 'image/png');
        const asset2 = new Asset('asset-new', 200, 'image/jpeg');

        const array = createArrayWrapper<Asset>([asset1], () => {}, [], tracker);

        tracker.addState(array);

        expect(tracker.count('asset-old')).toBe(1);

        array[0] = asset2;

        expect(tracker.count('asset-old')).toBe(0);
        expect(tracker.count('asset-new')).toBe(1);
    });

    test('removes Asset references when an array is truncated', () => {
        const tracker = new AssetReferenceTracker();

        const asset1 = new Asset('asset-length-1', 100, 'image/png');
        const asset2 = new Asset('asset-length-2', 200, 'image/jpeg');

        const array = createArrayWrapper<Asset>([asset1, asset2], () => {}, [], tracker);

        tracker.addState(array);

        expect(tracker.count('asset-length-1')).toBe(1);
        expect(tracker.count('asset-length-2')).toBe(1);

        array.length = 1;

        expect(tracker.count('asset-length-1')).toBe(1);
        expect(tracker.count('asset-length-2')).toBe(0);
    });
});
