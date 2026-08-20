import * as Y from 'yjs';

import type { SolidusPlugin } from '../../types.ts';
import type { StateOperation } from '../types.ts';

export interface YjsPluginOptions {
    doc?: Y.Doc;
}

export function yjs(options: YjsPluginOptions = {}): SolidusPlugin {
    function serializeValue(value: any, doc: Y.Doc): any {
        if (value === null || value === undefined) return value;
        if (typeof value !== 'object') return value;
        if (value instanceof Date) return value.toISOString();
        if (value instanceof RegExp) return value.toString();

        if (Array.isArray(value)) {
            const yArray = new Y.Array();
            yArray.insert(
                0,
                value.map((v) => serializeValue(v, doc)),
            );
            return yArray;
        }

        if (value instanceof Map) {
            const yMap = new Y.Map();
            for (const [k, v] of value) {
                yMap.set(String(k), serializeValue(v, doc));
            }
            return yMap;
        }

        if (value instanceof Set) {
            const yArray = new Y.Array();
            yArray.insert(
                0,
                [...value].map((v) => serializeValue(v, doc)),
            );
            return yArray;
        }

        const yMap = new Y.Map();
        for (const [k, v] of Object.entries(value)) {
            yMap.set(k, serializeValue(v, doc));
        }
        return yMap;
    }

    function resolveYjsContainer(
        doc: Y.Doc,
        path: string[],
    ): { parent: Y.Map<any> | Y.Array<any>; key: string | number } {
        let current: any = doc.getMap('root');

        for (let i = 0; i < path.length - 1; i++) {
            const segment = path[i];
            current =
                current instanceof Y.Array ? current.get(Number(segment)) : current.get(segment);
        }

        const lastSegment = path[path.length - 1];
        const key = current instanceof Y.Array ? Number(lastSegment) : lastSegment;

        return { parent: current, key };
    }

    function resolveYjsTarget(doc: Y.Doc, path: string[]): Y.Map<any> | Y.Array<any> {
        let current: any = doc.getMap('root');

        for (const segment of path) {
            current =
                current instanceof Y.Array ? current.get(Number(segment)) : current.get(segment);
        }

        return current;
    }

    function initializeYjsFromState(doc: Y.Doc, state: any) {
        const rootMap = doc.getMap('root');
        for (const [key, value] of Object.entries(state)) {
            rootMap.set(key, serializeValue(value, doc));
        }
    }

    function applyOperation(doc: Y.Doc, op: StateOperation) {
        if (
            [
                'GET',
                'HAS',
                'OWN_KEYS',
                'GET_OWN_PROPERTY_DESCRIPTOR',
                'IS_EXTENSIBLE',
                'GET_PROTOTYPE_OF',
            ].includes(op.type)
        )
            return;

        const { parent, key } = resolveYjsContainer(doc, op.path);

        switch (op.type) {
            case 'SET':
            case 'DEFINE_PROPERTY':
                (parent as Y.Map<any>).set(key as string, serializeValue(op.value, doc));
                break;

            case 'DELETE_PROPERTY':
                (parent as Y.Map<any>).delete(key as string);
                break;

            case 'ARRAY_INSERT':
                (parent as Y.Array<any>).insert(key as number, [serializeValue(op.value, doc)]);
                break;

            case 'ARRAY_DELETE':
                (parent as Y.Array<any>).delete(key as number, 1);
                break;

            case 'ARRAY_UPDATE':
                (parent as Y.Array<any>).delete(key as number, 1);
                (parent as Y.Array<any>).insert(key as number, [serializeValue(op.value, doc)]);
                break;

            case 'ARRAY_REPLACE': {
                const arr = resolveYjsTarget(doc, op.path) as Y.Array<any>;
                arr.delete(0, arr.length);
                arr.insert(
                    0,
                    (op.value as any[]).map((v) => serializeValue(v, doc)),
                );
                break;
            }

            case 'ARRAY_RESIZE': {
                const arr = resolveYjsTarget(doc, op.path) as Y.Array<any>;
                const newLen = op.value as number;
                if (newLen < arr.length) {
                    arr.delete(newLen, arr.length - newLen);
                } else if (newLen > arr.length) {
                    arr.insert(arr.length, new Array(newLen - arr.length).fill(null));
                }
                break;
            }

            case 'MAP_SET':
                (parent as Y.Map<any>).set(key as string, serializeValue(op.value, doc));
                break;

            case 'MAP_DELETE':
                (parent as Y.Map<any>).delete(key as string);
                break;

            case 'MAP_CLEAR': {
                const map = resolveYjsTarget(doc, op.path) as Y.Map<any>;
                for (const k of [...map.keys()]) map.delete(k);
                break;
            }

            case 'SET_ADD': {
                const arr = resolveYjsTarget(doc, op.path) as Y.Array<any>;
                if (!arr.toArray().includes(op.value)) {
                    arr.insert(arr.length, [op.value]);
                }
                break;
            }

            case 'SET_REMOVE': {
                const arr = resolveYjsTarget(doc, op.path) as Y.Array<any>;
                const idx = arr.toArray().indexOf(op.value);
                if (idx !== -1) arr.delete(idx, 1);
                break;
            }

            case 'SET_CLEAR': {
                const arr = resolveYjsTarget(doc, op.path) as Y.Array<any>;
                arr.delete(0, arr.length);
                break;
            }
        }
    }

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

            events.on('state:init', (initialState: any) => {
                doc.transact(() => {
                    initializeYjsFromState(doc, initialState);
                });
            });

            events.on('state:operation', (op: StateOperation) => {
                doc.transact(() => {
                    applyOperation(doc, op);
                });
            });

            events.on('destroy', () => {
                doc.destroy();
            });
        },
    };
}
