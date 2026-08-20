import { createState as _createState } from './state-sync/index.ts';
import type { StateOperation } from './state-sync/types.ts';
import type { SolidusConfig, SolidusEvents, SolidusInstance } from './types.ts';

export function solidus(config: SolidusConfig = {}): SolidusInstance {
    const handlers: Record<string, Function[]> = {};
    const events: SolidusEvents = {
        on: (event: string, handler: Function) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
        },
        emit: (event: string, ...args: any[]) => {
            handlers[event]?.forEach((handler) => handler(...args));
        },
    };

    const defaultConfig: SolidusConfig = {};
    const mergedConfig = { ...defaultConfig, ...config };
    const plugins = mergedConfig.plugins ?? [];

    // Service plugins — run at initialization
    plugins.forEach((plugin) => plugin.setup?.(events));

    // Factory plugins — registry for on-demand resource creation
    const pluginMap = new Map<string, (typeof plugins)[number]>();
    plugins.forEach((plugin) => {
        plugin.provides?.forEach((type) => pluginMap.set(type, plugin));
    });

    return {
        config: mergedConfig,

        createState<T extends object>(obj: T, onUpdate?: (op: StateOperation) => void): T {
            const composed = (op: StateOperation) => {
                events.emit('state:operation', op);
                onUpdate?.(op);
                mergedConfig.onStateOperation?.(op);
            };

            events.emit('state:init', obj);
            return _createState(obj, composed) as T;
        },

        create(resourceConfig: { type: string; label?: string; config?: any }) {
            const plugin = pluginMap.get(resourceConfig.type);
            if (!plugin) {
                throw new Error(`[solidus-p2p] No plugin provides type: "${resourceConfig.type}"`);
            }
            if (!plugin.create) {
                throw new Error(
                    `[solidus-p2p] Plugin "${plugin.name}" does not implement create()`,
                );
            }
            return plugin.create(resourceConfig.type, resourceConfig, events);
        },
    };
}
