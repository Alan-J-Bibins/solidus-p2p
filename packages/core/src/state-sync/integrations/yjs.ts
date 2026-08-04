import * as Y from 'yjs';

import type { SolidusPlugin } from '../../types.ts';
import type { StateOperation } from '../types.ts';

export interface YjsPluginOptions {
    doc?: Y.Doc;
}

export function yjs(options: YjsPluginOptions = {}): SolidusPlugin {
    let doc: Y.Doc;

    return {
        name: 'yjs',
        setup(events) {
            try {
                const Y = require('yjs') as typeof import('yjs');
                doc = options.doc ?? new Y.Doc();
            } catch {
                throw new Error(
                    '[solidus-p2p] yjs is required for the yjs() plugin but was not found.\nInstall it with: npm install yjs',
                );
            }

            events.on('state:operation', (op: StateOperation) => {
                console.log(op);
            });

            events.on('destroy', () => {
                doc.destroy();
            });
        },
    };
}
