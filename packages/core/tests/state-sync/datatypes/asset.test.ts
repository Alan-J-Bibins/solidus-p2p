import { describe, expect, test } from 'vite-plus/test';

import { Asset } from '../../../src/state-sync/datatypes/asset.ts';

describe('Asset', () => {
    test('creates an asset reference with metadata', () => {
        const asset = new Asset('asset-123', 1024, 'image/png', 'photo.png');

        expect(asset.id).toBe('asset-123');
        expect(asset.size).toBe(1024);
        expect(asset.type).toBe('image/png');
        expect(asset.name).toBe('photo.png');
    });

    test('does not contain binary data', () => {
        const asset = new Asset('asset-123', 1024, 'image/png');

        expect(asset).toEqual({
            id: 'asset-123',
            size: 1024,
            type: 'image/png',
        });
    });
});
