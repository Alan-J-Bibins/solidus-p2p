import { createState as _createState } from './state-sync/index.ts';
import type { StateOperation } from './state-sync/types.ts';
import type { SolidusConfig, SolidusEvents, SolidusInstance } from './types.ts';

export function solidus(config: SolidusConfig = {}): SolidusInstance {
    // Da event handlers go here
    const handlers: Record<string, Function[]> = {};
    // Kind of a global variable to hold all events and handlers
    const events: SolidusEvents = {
        on: (event: string, handler: Function) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
        },
        emit: (event: string, ...args: any[]) => {
            handlers[event]?.forEach((handler) => handler(...args));
        },
    };

    // put default config here (idk what it is yet)
    const defaultConfig: SolidusConfig = {};
    const mergedConfig = { ...defaultConfig, ...config };
    const plugins = mergedConfig.plugins ?? [];

    plugins?.forEach((plugin) => plugin.setup(events));

    return {
        config: mergedConfig,
        createState<T extends object>(obj: T, onUpdate?: (op: StateOperation) => void): T {
            const composed = (op: StateOperation) => {
                events.emit('state:operation', op);

                onUpdate?.(op);
                mergedConfig.onStateOperation?.(op);
            };
            return _createState(obj, composed) as T;
        },
    };
}
