export class AssetStore {
    private readonly directory?: FileSystemDirectoryHandle;

    constructor(directory?: FileSystemDirectoryHandle) {
        this.directory = directory;
    }

    async getDirectory(): Promise<FileSystemDirectoryHandle> {
        if (this.directory) {
            return this.directory;
        }

        return navigator.storage.getDirectory();
    }

    async put(id: string, data: Blob): Promise<void> {
        const directory = await this.getDirectory();
        const file = await directory.getFileHandle(id, { create: true });
        const writable = await file.createWritable();

        try {
            await writable.write(data);
        } finally {
            await writable.close();
        }
    }
    async get(id: string): Promise<Blob | undefined> {
        const directory = await this.getDirectory();

        try {
            const file = await directory.getFileHandle(id);
            return await file.getFile();
        } catch {
            return undefined;
        }
    }
    async has(id: string): Promise<boolean> {
        const directory = await this.getDirectory();

        try {
            await directory.getFileHandle(id);
            return true;
        } catch {
            return false;
        }
    }
    async delete(id: string): Promise<void> {
        const directory = await this.getDirectory();

        try {
            await directory.removeEntry(id);
        } catch {
            // Asset is already missing.
        }
    }
}
