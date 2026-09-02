import type { Chunk } from './types.js';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export async function chunkFile({ file }: { file: File | Blob | ArrayBuffer }) {
    const chunkSize = 64 * 1024;
    const fileId = crypto.randomUUID();

    let buffer: ArrayBuffer;
    if (file instanceof ArrayBuffer) {
        buffer = file;
    } else {
        buffer = await file.arrayBuffer();
    }

    const totalSize = buffer.byteLength;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    const chunks: Chunk[] = [];

    const metadata =
        file instanceof File || file instanceof Blob
            ? { name: (file as File).name, type: file.type, size: file.size }
            : { size: totalSize };

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, totalSize);
        const chunkBuffer = buffer.slice(start, end);

        const base64Data = arrayBufferToBase64(chunkBuffer);

        chunks.push({
            fileId,
            index: i,
            totalChunks,
            data: base64Data,
            metadata,
        });
    }

    return chunks;
}
