import { Asset } from '../datatypes/asset.ts';
import { AssetStore } from './store.ts';

export class AssetReferenceTracker {
    private readonly references = new Map<string, number>();

    constructor(private readonly store?: AssetStore) {}

    add(value: unknown): void {
        if (!(value instanceof Asset)) return;

        const count = this.references.get(value.id) ?? 0;
        this.references.set(value.id, count + 1);
    }

    async remove(value: unknown): Promise<void> {
        if (!(value instanceof Asset)) return;

        const count = this.references.get(value.id) ?? 0;

        if (count <= 1) {
            this.references.delete(value.id);

            if (this.store) {
                await this.store.delete(value.id);
            }

            return;
        }

        this.references.set(value.id, count - 1);
    }
    addState(value: unknown): void {
        if (value instanceof Asset) {
            this.add(value);
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                this.addState(item);
            }
            return;
        }

        if (value instanceof Map) {
            for (const item of value.values()) {
                this.addState(item);
            }
            return;
        }

        if (value instanceof Set) {
            for (const item of value) {
                this.addState(item);
            }
            return;
        }

        if (value !== null && typeof value === 'object') {
            for (const item of Object.values(value)) {
                this.addState(item);
            }
        }
    }
    async removeState(value: unknown): Promise<void> {
        if (value instanceof Asset) {
            await this.remove(value);
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                await this.removeState(item);
            }
            return;
        }

        if (value instanceof Map) {
            for (const item of value.values()) {
                await this.removeState(item);
            }
            return;
        }

        if (value instanceof Set) {
            for (const item of value) {
                await this.removeState(item);
            }
            return;
        }

        if (value !== null && typeof value === 'object') {
            for (const item of Object.values(value)) {
                await this.removeState(item);
            }
        }
    }
    count(id: string): number {
        return this.references.get(id) ?? 0;
    }
}
