import { describe, expect, test } from 'vite-plus/test';

import { Asset, AssetStore, fastCDCPlugin, solidus } from '../src/index.ts';
import { createNetworkingPlugin } from '../src/networking/create-networking-plugin.ts';
import type { Chunk, NetworkTransport } from '../src/networking/types.ts';

function createMemoryStore() {
    const files = new Map<string, Blob>();
    const directory = {
        async getFileHandle(name: string, options?: { create?: boolean }) {
            if (!files.has(name) && !options?.create) throw new Error('File not found');
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
    return new AssetStore(directory);
}

function createTransport(chunks: Chunk[]): NetworkTransport {
    return {
        localPeerId: 'local',
        async connect() {},
        sendTo() {},
        broadcast() {},
        broadcastState() {},
        broadcastChunk(chunk) {
            chunks.push(chunk);
        },
        getPeers() {
            return [];
        },
        onMessage() {},
        onChunk() {},
        onPeerJoin() {},
        onPeerLeave() {},
        close() {},
    };
}

describe('FastCDC plugin', () => {
    test('reads an Asset by id and broadcasts every FastCDC chunk', async () => {
        const store = createMemoryStore();
        const asset = new Asset('fastcdc-test', 16 * 1024, 'application/octet-stream');
        const input = new Uint8Array(16 * 1024);
        for (let i = 0; i < input.length; i++) input[i] = (i * 31) & 0xff;
        await store.put(asset.id, new Blob([input]));

        const chunks: Chunk[] = [];
        const networkPlugin = createNetworkingPlugin(() => createTransport(chunks), 'test-network');
        const instance = solidus({
            assetStore: store,
            plugins: [fastCDCPlugin(), networkPlugin],
        });
        instance.create({ type: 'peer-network', config: { target: {} } });

        const chunker = instance.create({ type: 'asset-chunker' });
        await chunker.chunk(asset);

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.every((chunk) => chunk.every((byte) => typeof byte === 'number'))).toBe(true);

        const rebuilt = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
            for (const byte of chunk) rebuilt[offset++] = byte as number;
        }
        expect(rebuilt).toEqual(input);
    });
});
