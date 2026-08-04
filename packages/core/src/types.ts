//NOTE: Put necessary documentation / instructions in /**/ as I've done here so that these instructions / details are picked up by LSPs which later show it to end developers.
import type { StateOperation } from './state-sync/types.ts';

export type SolidusEvents = {
    on: (event: string, handler: Function) => void;
    emit: (event: string, ...args: any[]) => void;
};

export type SolidusPlugin = {
    name: string;
    setup: (events: SolidusEvents) => void;
};

/**
 * Configuration for Solidus' Operational Engine
 */
export type SolidusConfig = {
    /**
     * Global hook called on every state mutation across all createState()
     * instances produced by this solidus() call.
     */
    onStateOperation?: (op: StateOperation) => void;

    /**
     * Reserved for future plugins / middleware.
     */
    plugins?: SolidusPlugin[];
};

export type SolidusInstance = {
    /** The resolved config this instance was created with. */
    readonly config: Readonly<SolidusConfig>;

    /**
     * Create a deeply-proxied state object whose mutations are reported
     * through `onUpdate` (or the global `onStateOperation` from config).
     */
    createState<T extends object>(obj: T, onUpdate?: (op: StateOperation) => void): T;
};
