import type { Chunk } from '../../networking/types.ts';
import type { AssetStore } from '../../state-sync/asset/store.ts';
import type { Asset } from '../../state-sync/datatypes/asset.ts';
import type { SolidusPlugin } from '../../types.ts';

export type FastCDCResources = {
    'asset-chunker': undefined;
};

export type AssetChunker = {
    chunk: (asset: Asset) => Promise<void>;
};

type FastCDC = (
    bytes: ArrayBuffer | Uint8Array,
    options?: number | { min?: number; avg?: number; max?: number },
) => number[];

async function loadFastCDC(): Promise<FastCDC> {
    const module = await import('fastcdc');
    return module.default as unknown as FastCDC;
}

export function fastCDCPlugin(): SolidusPlugin<FastCDCResources> {
    return {
        name: 'fastcdc',
        provides: ['asset-chunker'],

        setup(events, _rawStateRegistry, assetStore?: AssetStore) {
            events.on(
                'asset:chunk',
                async (asset: Asset, resolve: () => void, reject: (error: unknown) => void) => {
                    try {
                        if (!assetStore) {
                            throw new Error(
                                '[solidus-p2p] FastCDC requires an AssetStore. Configure assetStore or use a browser with OPFS support.',
                            );
                        }

                        const data = await assetStore.get(asset.id);
                        if (!data) {
                            throw new Error(
                                `[solidus-p2p] No binary data found for Asset "${asset.id}"`,
                            );
                        }

                        const buffer = new Uint8Array(await data.arrayBuffer());
                        const fastCDC = await loadFastCDC();
                        const boundaries = fastCDC(buffer);

                        if (boundaries.length % 2 !== 0) {
                            throw new Error(
                                '[solidus-p2p] FastCDC returned invalid chunk boundaries',
                            );
                        }

                        for (let i = 0; i < boundaries.length; i += 2) {
                            const offset = boundaries[i];
                            const length = boundaries[i + 1];
                            const bytes = buffer.slice(offset, offset + length);
                            const chunk: Chunk = Array.from(bytes);
                            events.emit('network:chunk', chunk);
                        }

                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                },
            );
        },

        create(type, _resourceConfig, events): AssetChunker | undefined {
            if (type !== 'asset-chunker') return undefined;

            return {
                chunk: (asset: Asset) =>
                    new Promise<void>((resolve, reject) => {
                        events.emit('asset:chunk', asset, resolve, reject);
                    }),
            };
        },
    };
}
