import { afterAll, afterEach, beforeAll, expect, test } from 'vite-plus/test';

import { solidus } from './../../src/index.ts';
import { webrtc } from './../../src/networking/index.ts';
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

function joinRoom(room: string) {
    const raw = { count: 0 };
    const instance = solidus({ plugins: [webrtc()] });
    const state = instance.createState(raw);
    const network = instance.create({
        type: 'peer-network',
        config: { signalingServer: `ws://localhost:${server.port}`, room, target: raw },
    });
    cleanupFns.push(() => network.close());
    return { raw, state, network };
}

test('two peers sync a mutation', async () => {
    const room = `room-${Date.now()}-a`;
    const a = joinRoom(room);
    const b = joinRoom(room);

    await Promise.all([a.network.waitUntilOpen(), b.network.waitUntilOpen()]);
    await expect.poll(() => a.network.peers.length, { timeout: 3000, interval: 50 }).toBe(1);

    a.state.count = 42;

    await expect.poll(() => b.raw.count, { timeout: 3000, interval: 50 }).toBe(42);
}, 15000);

test('three peers all receive a mutation from one sender (full mesh)', async () => {
    const room = `room-${Date.now()}-b`;
    const a = joinRoom(room);
    const b = joinRoom(room);
    const c = joinRoom(room);

    await Promise.all([
        a.network.waitUntilOpen(),
        b.network.waitUntilOpen(),
        c.network.waitUntilOpen(),
    ]);
    await expect.poll(() => a.network.peers.length, { timeout: 5000, interval: 50 }).toBe(2);

    a.state.count = 7;

    await expect.poll(() => b.raw.count, { timeout: 3000, interval: 50 }).toBe(7);
    await expect.poll(() => c.raw.count, { timeout: 3000, interval: 50 }).toBe(7);
}, 20000);

test('a late-joining third peer connects to both existing peers', async () => {
    const room = `room-${Date.now()}-c`;
    const a = joinRoom(room);
    const b = joinRoom(room);
    await Promise.all([a.network.waitUntilOpen(), b.network.waitUntilOpen()]);

    const c = joinRoom(room);
    await c.network.waitUntilOpen();

    await expect.poll(() => c.network.peers.length, { timeout: 5000, interval: 50 }).toBe(2);
    await expect.poll(() => a.network.peers.length, { timeout: 5000, interval: 50 }).toBe(2);
}, 20000);
