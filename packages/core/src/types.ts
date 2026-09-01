//NOTE: Put necessary documentation / instructions in /**/ as I've done here so that these instructions / details are picked up by LSPs which later show it to end developers.
import type { StateOperation } from './state-sync/types.ts';

export type SolidusEvents = {
    /**
     * For setting up event listeners
     */
    on: (event: string, handler: Function) => void;

    /**
     * For emitting events with any payload
     */
    emit: (event: string, ...args: any[]) => void;
};

export type SolidusPlugin<TResources extends Record<string, any> = Record<string, any>> = {
    name: string;
    setup?: (events: SolidusEvents) => void;

    provides?: (keyof TResources & string)[];
    create?: <K extends keyof TResources & string>(
        type: K,
        options: { type: K; label?: string; config?: TResources[K] },
        events: SolidusEvents,
    ) => any;
};

/**
 * Configuration for Solidus' Operational Engine
 */
export type SolidusConfig<TPlugins extends SolidusPlugin<any>[] = SolidusPlugin<any>[]> = {
    /**
     * Global hook called on every state mutation across all createState()
     * instances produced by this solidus() call.
     */
    onStateOperation?: (op: StateOperation) => void;

    /**
     * Reserved for future plugins / middleware.
     */
    plugins?: TPlugins;
};

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

export type MergedResources<TPlugins extends SolidusPlugin<any>[]> = TPlugins extends []
    ? Record<string, any>
    : UnionToIntersection<TPlugins[number] extends SolidusPlugin<infer R> ? R : never>;

export type SolidusInstance<TResources extends Record<string, any> = Record<string, any>> = {
    /** The resolved config this instance was created with. */
    readonly config: Readonly<SolidusConfig>;

    /**
     * Create a deeply-proxied state object whose mutations are reported
     * through `onUpdate` (or the global `onStateOperation` from config).
     */
    createState<T extends object>(obj: T, onUpdate?: (op: StateOperation) => void): T;

    /** Type-safe create method - config is inferred from the resource type */
    create: <K extends keyof TResources & string>(resourceConfig: {
        type: K;
        label?: string;
        config?: TResources[K];
    }) => any;
};
