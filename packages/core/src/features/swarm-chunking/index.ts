import type { SolidusPlugin, SolidusEvents } from '../../types.js';

export function swarmChunk(): SolidusPlugin {
    return {
        name: 'swarm-chunk',
        setup: (events: SolidusEvents) => {
            events.on('', () => {});
        },
    };
}
