import { randomUUID } from 'node:crypto';

import { WebSocketServer, type WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const rooms = new Map<string, Map<string, WebSocket>>(); // roomId -> peerId -> socket

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const roomId = url.searchParams.get('room');
    if (!roomId) return socket.close(1008, 'Missing ?room=');

    const peerId = randomUUID();
    let room = rooms.get(roomId);
    if (!room) rooms.set(roomId, (room = new Map()));

    const existingPeers = Array.from(room.keys());
    room.set(peerId, socket);
    console.log(`Peer ${peerId} joined room "${roomId}" (${room.size} total)`);

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
            if (target && target.readyState === target.OPEN) {
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
        console.log(`Peer ${peerId} left room "${roomId}"`);
    });
});

console.log(`Signaling server listening on ws://localhost:${PORT}`);
