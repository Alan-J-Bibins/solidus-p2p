import { describe, expect, test } from 'vite-plus/test';

import { AssetStore } from '../../../src/state-sync/asset/store.ts';

describe('AssetStore', () => {
    test('stores and retrieves binary data', async () => {
        const files = new Map<string, Blob>();

        const fakeDirectory = {
            async getFileHandle(name: string, options?: { create?: boolean }) {
                if (!files.has(name) && !options?.create) {
                    throw new Error('File not found');
                }

                return {
                    async createWritable() {
                        return {
                            async write(data: Blob) {
                                files.set(name, data);
                            },
                            async close() {},
                        };
                    },
                    async getFile() {
                        return files.get(name);
                    },
                };
            },
        } as unknown as FileSystemDirectoryHandle;

        const store = new AssetStore(fakeDirectory);
        const data = new Blob(['hello']);

        await store.put('asset-123', data);

        const result = await store.get('asset-123');

        expect(result).toBe(data);
    });

    test('returns undefined for a missing asset', async () => {
        const fakeDirectory = {
            async getFileHandle() {
                throw new Error('File not found');
            },
        } as unknown as FileSystemDirectoryHandle;

        const store = new AssetStore(fakeDirectory);

        expect(await store.get('missing')).toBeUndefined();
    });
    test('deletes an asset', async () => {
        const files = new Map<string, Blob>();

        const fakeDirectory = {
            async getFileHandle(name: string, options?: { create?: boolean }) {
                if (!files.has(name) && !options?.create) {
                    throw new Error('File not found');
                }

                return {
                    async createWritable() {
                        return {
                            async write(data: Blob) {
                                files.set(name, data);
                            },
                            async close() {},
                        };
                    },
                    async getFile() {
                        return files.get(name);
                    },
                };
            },

            async removeEntry(name: string) {
                files.delete(name);
            },
        } as unknown as FileSystemDirectoryHandle;

        const store = new AssetStore(fakeDirectory);
        const data = new Blob(['hello']);

        await store.put('asset-123', data);
        expect(await store.has('asset-123')).toBe(true);

        await store.delete('asset-123');

        expect(await store.has('asset-123')).toBe(false);
    });
});
