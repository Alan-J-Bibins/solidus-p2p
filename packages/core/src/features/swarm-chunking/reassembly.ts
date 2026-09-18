import type { Chunk } from './types.js';

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

export function reassembleChunks(chunks: Chunk[], mimeType?: string): Blob {
    const sorted = [...chunks].sort((a, b) => a.index - b.index);
    const buffers = sorted.map((chunk) => base64ToArrayBuffer(chunk.data));
    const type = mimeType ?? sorted[0]?.metadata?.type ?? 'application/octet-stream';
    return new Blob(buffers, { type });
}
