export type Chunk = {
    fileId: string;
    index: number;
    totalChunks: number;
    data: string;
    metadata?: {
        name?: string;
        type?: string;
        size: number;
    };
};
