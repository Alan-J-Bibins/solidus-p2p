import { randomUUID } from 'node:crypto';

import { WebSocketServer, type WebSocket } from 'ws';

export interface TestSignalingServer {
    port: number;
    close(): Promise<void>;
}

export function startTestSignalingServer(): Promise<TestSignalingServer> {
    return new Promise((resolve) => {
        const rooms = new Map<string, Map<string, WebSocket>>();
        const wss = new WebSocketServer({ port: 0 });

        wss.on('connection', (socket, request) => {
            const url = new URL(request.url ?? '', 'http://localhost');
            const roomId = url.searchParams.get('room');
            if (!roomId) return socket.close(1008, 'Missing ?room=');

            const peerId = randomUUID();
            let room = rooms.get(roomId);
            if (!room) rooms.set(roomId, (room = new Map()));

            const existingPeers = Array.from(room.keys());
            room.set(peerId, socket);

            socket.send(JSON.stringify({ kind: 'welcome', peerId, peers: existingPeers }));

            for (const [otherId, otherSocket] of room) {
                if (otherId !== peerId && otherSocket.readyState === otherSocket.OPEN) {
                    otherSocket.send(JSON.stringify({ kind: 'peer-joined', peerId }));
                }
            }

            socket.on('message', (data) => {
                let message: any;
                try {
                    message = JSON.parse(data.toString());
                } catch {
                    return;
                }
                if (message.kind === 'signal' && message.to) {
                    const target = room!.get(message.to);
                    if (!target) return;
                    if (target.readyState === target.OPEN) {
                        target.send(
                            JSON.stringify({
                                kind: 'signal',
                                from: peerId,
                                to: message.to,
                                signal: message.signal,
                            }),
                        );
                    }
                }
            });

            socket.on('close', () => {
                room!.delete(peerId);
                if (room!.size === 0) {
                    rooms.delete(roomId);
                } else {
                    for (const [, otherSocket] of room!) {
                        if (otherSocket.readyState === otherSocket.OPEN) {
                            otherSocket.send(JSON.stringify({ kind: 'peer-left', peerId }));
                        }
                    }
                }
            });
        });

        wss.on('listening', () => {
            const address = wss.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                port,
                close: () =>
                    new Promise<void>((res, rej) => wss.close((err) => (err ? rej(err) : res()))),
            });
        });
    });
}
