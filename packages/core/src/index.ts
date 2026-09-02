import { createState as _createState } from './state-sync/index.ts';
import type { StateOperation } from './state-sync/types.ts';
import type {
    MergedResources,
    SolidusConfig,
    SolidusEvents,
    SolidusInstance,
    SolidusPlugin,
} from './types.ts';

export { createNetworkingPlugin, webrtc } from './networking/index.ts';
export type {
    NetworkTransport,
    NetworkTransportFactory,
    NetworkHandle,
    BaseNetworkingConfig,
    PeerId,
    WebRTCTransportConfig,
} from './networking/index.ts';

export function solidus<TPlugins extends SolidusPlugin<any>[]>(
    config: SolidusConfig<TPlugins> = {},
): SolidusInstance<MergedResources<TPlugins>> {
    const handlers: Record<string, Function[]> = {};
    const rawStateRegistry = new Map<string, any>();

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
    plugins.forEach((plugin) => plugin.setup?.(events, rawStateRegistry));

    // Listen for remote operations applied by networking plugin
    events.on('state:remote-applied', (data: { peerId: string; op: StateOperation }) => {
        mergedConfig.onRemoteOperation?.(data.op, data.peerId);
    });

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
            const proxy = _createState(obj, composed) as T;

            rawStateRegistry.set(`raw-state-${rawStateRegistry.size}`, obj);

            return proxy;
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
