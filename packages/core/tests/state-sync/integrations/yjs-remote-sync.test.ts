import { describe, test, expect } from 'vite-plus/test';

import { yjs } from '../../../src/state-sync/integrations/yjs.ts';

function createEventBus() {
    const handlers: Record<string, Function[]> = {};
    return {
        on: (event: string, handler: Function) => {
            (handlers[event] ??= []).push(handler);
        },
        emit: (event: string, ...args: any[]) => {
            handlers[event]?.forEach((h) => h(...args));
        },
        hasListeners: (event: string) => (handlers[event]?.length ?? 0) > 0,
    };
}

/** Wires two peers' event buses together like the real WebRTC transport does:
 * each side's 'state:broadcast' output is delivered to the other's
 * 'state:remote-operation' input. */
function connectPeers(
    events: ReturnType<typeof createEventBus>,
    peerId: string,
    other: ReturnType<typeof createEventBus>,
    otherPeerId: string,
) {
    events.on('state:broadcast', (update: Uint8Array) => {
        other.emit('state:remote-operation', peerId, update);
    });
    other.on('state:broadcast', (update: Uint8Array) => {
        events.emit('state:remote-operation', otherPeerId, update);
    });
    events.emit('network:peer-joined', { peerId: otherPeerId });
    other.emit('network:peer-joined', { peerId });
}

describe('yjs integration - remote update notifies consumers', () => {
    test('two independently-initialized peers converge and notify onRemoteOperation after connecting', () => {
        const eventsA = createEventBus();
        const proxyA = { content: '', version: 0 };
        yjs().setup!(
            eventsA as any,
            new Map([['a', proxyA]]) as any,
            undefined as any,
            undefined as any,
        );
        eventsA.emit('state:init', proxyA);

        const eventsB = createEventBus();
        const proxyB = { content: '', version: 0 };
        yjs().setup!(
            eventsB as any,
            new Map([['b', proxyB]]) as any,
            undefined as any,
            undefined as any,
        );
        eventsB.emit('state:init', proxyB);

        let bNotifiedCount = 0;
        let bNotifiedPeerId: string | null = null;
        eventsB.on('state:remote-applied', (data: { peerId: string }) => {
            bNotifiedCount++;
            bNotifiedPeerId = data.peerId;
        });

        // Simulate the two peers connecting over the network (fires the full-state
        // exchange added to fix divergent-doc convergence).
        connectPeers(eventsA, 'peerA', eventsB, 'peerB');

        // A makes a local edit (mirrors the real Proxy's set-trap writing to the
        // target before emitting 'state:operation').
        proxyA.content = 'hello from peer A';
        eventsA.emit('state:operation', {
            type: 'SET',
            path: ['content'],
            value: 'hello from peer A',
            timestamp: Date.now(),
        });

        expect(proxyB.content).toBe('hello from peer A');
        expect(bNotifiedCount).toBeGreaterThan(0);
        expect(bNotifiedPeerId).toBe('peerA');
    });
});
