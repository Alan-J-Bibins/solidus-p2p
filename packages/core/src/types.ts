import type { StateOperation } from './state-sync/types.ts';

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
    plugins?: unknown[];
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
