import { expect, test } from 'vite-plus/test';

import { P2PPeer } from '../src/index.ts';

test('two peers connect and exchange a message', async () => {
    let peerB!: P2PPeer;

    const peerA = new P2PPeer({
        onSignal: (message) => {
            void peerB.handleSignal(message);
        },
    });

    peerB = new P2PPeer({
        onSignal: (message) => {
            void peerA.handleSignal(message);
        },
    });

    await peerA.createOffer();

    await Promise.all([peerA.waitUntilOpen(), peerB.waitUntilOpen()]);

    const received = new Promise<string>((resolve) => {
        peerB.onMessage((data) => resolve(data));
    });

    peerA.send('hello from A');

    await expect(received).resolves.toBe('hello from A');

    peerA.close();
    peerB.close();
}, 10000); // WebRTC handshake can take longer than the default 5s timeout
