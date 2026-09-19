/** Array-backed FIFO with O(1) amortized shift (Array#shift is O(n)). */
class Fifo<T> {
    private items: T[] = [];
    private head = 0;

    get length(): number {
        return this.items.length - this.head;
    }

    push(item: T): void {
        this.items.push(item);
    }

    shift(): T | undefined {
        if (this.head >= this.items.length) return undefined;
        const item = this.items[this.head];
        this.items[this.head] = undefined as T; // release reference for GC
        this.head++;
        // Compact occasionally so the backing array doesn't grow forever
        if (this.head > 1024 && this.head * 2 >= this.items.length) {
            this.items = this.items.slice(this.head);
            this.head = 0;
        }
        return item;
    }

    clear(): void {
        this.items = [];
        this.head = 0;
    }
}

/**
 * Two-lane queue: state updates have priority over chunks, but when both
 * lanes have data waiting, at most `stateBurstLimit` states are sent in a row
 * before one chunk is let through.
 */
export class PrioritySendQueue<T> {
    private readonly states = new Fifo<T>();
    private readonly chunks = new Fifo<T>();
    private stateStreak = 0;
    private readonly stateBurstLimit: number;

    constructor(stateBurstLimit = 4) {
        this.stateBurstLimit = Math.max(1, Math.floor(stateBurstLimit));
    }

    get size(): number {
        return this.states.length + this.chunks.length;
    }

    pushState(item: T): void {
        this.states.push(item);
    }

    pushChunk(item: T): void {
        this.chunks.push(item);
    }

    shift(): T | undefined {
        const hasStates = this.states.length > 0;
        const hasChunks = this.chunks.length > 0;

        if (!hasStates && !hasChunks) return undefined;

        if (hasStates && !hasChunks) {
            this.stateStreak = 0; // nobody is being starved, so don't count
            return this.states.shift();
        }

        if (!hasStates) {
            this.stateStreak = 0;
            return this.chunks.shift();
        }

        // Both lanes have data: states first, but yield to a chunk after N in a row
        if (this.stateStreak < this.stateBurstLimit) {
            this.stateStreak++;
            return this.states.shift();
        }
        this.stateStreak = 0;
        return this.chunks.shift();
    }

    clear(): void {
        this.states.clear();
        this.chunks.clear();
        this.stateStreak = 0;
    }
}
