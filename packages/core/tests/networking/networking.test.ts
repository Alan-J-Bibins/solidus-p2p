import { afterAll, afterEach, beforeAll, expect, test } from 'vite-plus/test';

import { createNetworkingPlugin } from '../../../core/src/networking/index.ts';
import { solidus } from './../../../core/src/index.ts';
import {
    startTestSignalingServer,
    type TestSignalingServer,
} from './../helpers/test-signaling-server.ts';

let server: TestSignalingServer;
const cleanupFns: Array<() => void> = [];

beforeAll(async () => {
    server = await startTestSignalingServer();
});

afterAll(async () => {
    await server.close();
});

afterEach(() => {
    cleanupFns.splice(0).forEach((fn) => fn());
});

function connectPeerPair(room: string) {
    const signalingServer = `ws://localhost:${server.port}`;

    const rawA = { count: 0, messages: [] as string[] };
    const instanceA = solidus({ plugins: [createNetworkingPlugin()] });
    const stateA = instanceA.createState(rawA);
    const networkA = instanceA.create({
        type: 'peer-network',
        config: { signalingServer, room, role: 'offerer', target: rawA },
    });

    const rawB = { count: 0, messages: [] as string[] };
    const instanceB = solidus({ plugins: [createNetworkingPlugin()] });
    const stateB = instanceB.createState(rawB);
    const networkB = instanceB.create({
        type: 'peer-network',
        config: { signalingServer, room, role: 'answerer', target: rawB },
    });

    cleanupFns.push(() => {
        networkA.close();
        networkB.close();
    });

    return { rawA, rawB, stateA, stateB, networkA, networkB };
}

test('a local mutation on peer A syncs to peer B raw object', async () => {
    const { rawB, stateA, networkA, networkB } = connectPeerPair(`room-${Date.now()}-a`);

    await Promise.all([networkA.waitUntilOpen(), networkB.waitUntilOpen()]);

    stateA.count = 42;

    await expect.poll(() => rawB.count, { timeout: 3000, interval: 50 }).toBe(42);
}, 15000);

test('mutations sync in both directions', async () => {
    const { rawA, rawB, stateA, stateB, networkA, networkB } = connectPeerPair(
        `room-${Date.now()}-b`,
    );

    await Promise.all([networkA.waitUntilOpen(), networkB.waitUntilOpen()]);

    stateA.count = 1;
    await expect.poll(() => rawB.count, { timeout: 3000, interval: 50 }).toBe(1);

    stateB.count = 2;
    await expect.poll(() => rawA.count, { timeout: 3000, interval: 50 }).toBe(2);
}, 15000);

test('array mutation (push) syncs correctly', async () => {
    const { rawB, stateA, networkA, networkB } = connectPeerPair(`room-${Date.now()}-c`);

    await Promise.all([networkA.waitUntilOpen(), networkB.waitUntilOpen()]);

    stateA.messages.push('hello from A');

    await expect.poll(() => rawB.messages.length, { timeout: 3000, interval: 50 }).toBe(1);
    expect(rawB.messages[0]).toBe('hello from A');
}, 15000);

test('receiving a remote operation does not bounce it back to the sender', async () => {
    const { stateA, networkA, networkB } = connectPeerPair(`room-${Date.now()}-d`);

    await Promise.all([networkA.waitUntilOpen(), networkB.waitUntilOpen()]);

    const sentByA: string[] = [];
    const originalSend = networkA.send.bind(networkA);
    networkA.send = (data: string) => {
        sentByA.push(data);
        originalSend(data);
    };

    stateA.count = 10;
    await new Promise((resolve) => setTimeout(resolve, 500)); // let the round trip settle

    // A should have sent exactly one op (its own local mutation) — if B's
    // applyOperation incorrectly went through a proxy and re-emitted, A would
    // receive and re-broadcast it, inflating this count.
    expect(sentByA).toHaveLength(1);
}, 15000);

test('proxy reads on the receiving side reflect remotely-applied state', async () => {
    const { stateA, stateB, networkA, networkB } = connectPeerPair(`room-${Date.now()}-e`);

    await Promise.all([networkA.waitUntilOpen(), networkB.waitUntilOpen()]);

    stateA.count = 77;

    await expect.poll(() => stateB.count, { timeout: 3000, interval: 50 }).toBe(77);
}, 15000);
