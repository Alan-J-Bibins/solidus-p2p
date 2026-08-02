import { createState as _createState } from './state-sync/index.ts';
import type { StateOperation } from './state-sync/types.ts';
import type { SolidusConfig, SolidusInstance } from './types.ts';

export function solidus(config: SolidusConfig = {}): SolidusInstance {
    // put default config here (idk what it is yet)
    const defaultConfig: SolidusConfig = {};
    const mergedConfig = { ...defaultConfig, ...config };

    return {
        config: mergedConfig,
        createState<T extends object>(obj: T, onUpdate?: (op: StateOperation) => void): T {
            const composed = (op: StateOperation) => {
                onUpdate?.(op);
                mergedConfig.onStateOperation?.(op);
            };
            return _createState(obj, composed) as T;
        },
    };
}
