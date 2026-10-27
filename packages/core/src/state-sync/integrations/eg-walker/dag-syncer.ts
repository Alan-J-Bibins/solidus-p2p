import type { EventNode } from './types.ts';
/** Compatibility interface used by the EG-Walker merge algorithm to retrieve missing events. */
export interface DagSyncer {
    getNode(cid: string): Promise<EventNode>;
}
