import { afterAll, afterEach, beforeAll, expect, test } from 'vite-plus/test';

import { Asset, AssetStore, solidus } from './../../src/index.ts';
import { createNetworkingPlugin } from './../../src/networking/create-networking-plugin.ts';
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

test('Asset state mutations preserve Asset references across the network', async () => {
    const asset = new Asset('network-asset', 3, 'application/octet-stream');

    const transports: Array<{
        messageHandlers: Array<(peerId: string, data: string) => void>;
        broadcastState: (data: string) => void;
    }> = [];

    const createMemoryTransport = () => {
        const transport = {
            localPeerId: `peer-${transports.length}`,
            messageHandlers: [] as Array<(peerId: string, data: string) => void>,
            connect: async () => {},
            sendTo: () => {},
            broadcast: () => {},
            broadcastState(data: string) {
                for (const other of transports) {
                    if (other !== transport) {
                        other.messageHandlers.forEach((handler) =>
                            handler(transport.localPeerId, data),
                        );
                    }
                }
            },
            broadcastChunk: () => {},
            getPeers: () => [],
            onMessage(handler: (peerId: string, data: string) => void) {
                transport.messageHandlers.push(handler);
            },
            onChunk: () => {},
            onPeerJoin: () => {},
            onPeerLeave: () => {},
            close: () => {},
        };
        transports.push(transport);
        return transport;
    };

    const a = solidus({
        plugins: [createNetworkingPlugin(createMemoryTransport, 'test-network-a')],
    });
    const deleted: string[] = [];
    const bStore = {
        async delete(id: string) {
            deleted.push(id);
        },
    } as unknown as AssetStore;
    const b = solidus({
        assetStore: bStore,
        plugins: [createNetworkingPlugin(createMemoryTransport, 'test-network-b')],
    });
    const rawA = { asset: null as Asset | null };
    const rawB = { asset: null as Asset | null };
    const stateA = a.createState(rawA);
    b.createState(rawB);
    a.create({ type: 'peer-network', config: { target: rawA } });
    b.create({ type: 'peer-network', config: { target: rawB } });

    stateA.asset = asset;

    expect(rawB.asset).toBeInstanceOf(Asset);
    expect(rawB.asset?.id).toBe(asset.id);

    stateA.asset = null;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleted).toContain(asset.id);
    expect(rawB.asset).toBeNull();
});
