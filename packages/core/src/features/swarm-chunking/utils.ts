import { base64ToArrayBuffer } from './reassembly.js';
import type { Chunk } from './types.js';

export function reassembleChunks(chunks: Chunk[], mimeType?: string): Blob {
    const sorted = [...chunks].sort((a, b) => a.index - b.index);
    const buffers = sorted.map((chunk) => base64ToArrayBuffer(chunk.data));
    const type = mimeType ?? sorted[0]?.metadata?.type ?? 'application/octet-stream';
    return new Blob(buffers, { type });
}
