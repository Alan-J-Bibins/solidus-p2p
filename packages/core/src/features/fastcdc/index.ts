import fastCDCModule from 'fastcdc';

import type { Chunk } from '../../networking/types.ts';
import type { AssetStore } from '../../state-sync/asset/store.ts';
import type { SolidusPlugin } from '../../types.ts';

const fastCDC = fastCDCModule as unknown as (
    bytes: ArrayBuffer | Uint8Array,
    options?: number | { min?: number; avg?: number; max?: number },
) => number[];

export function fastCDCPlugin(): SolidusPlugin {
    return {
        name: 'fastcdc',

        setup(events, _rawStateRegistry, assetStore?: AssetStore) {
            if (!assetStore) {
                return;
            }

            events.on('asset:chunk', async (assetId: string) => {
                const data = await assetStore.get(assetId);

                if (!data) {
                    return;
                }

                const buffer = new Uint8Array(await data.arrayBuffer());
                const boundaries = fastCDC(buffer);

                for (let i = 0; i < boundaries.length; i += 2) {
                    const offset = boundaries[i];
                    const length = boundaries[i + 1];

                    const bytes = buffer.slice(offset, offset + length);

                    const chunk: Chunk = Array.from(bytes);

                    events.emit('network:chunk', chunk);
                }
            });
        },
    };
}
