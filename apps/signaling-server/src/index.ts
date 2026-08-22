import { WebSocketServer, type WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const rooms = new Map<string, Set<WebSocket>>();

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const roomId = url.searchParams.get('room');

    if (!roomId) {
        socket.close(1008, 'Missing ?room= query param');
        return;
    }

    let room = rooms.get(roomId);
    if (!room) {
        room = new Set();
        rooms.set(roomId, room);
    }

    if (room.size >= 2) {
        socket.close(1013, 'Room is full');
        return;
    }

    room.add(socket);
    console.log(`Peer joined room "${roomId}" (${room.size}/2)`);

    socket.on('message', (data) => {
        for (const peer of room!) {
            if (peer !== socket && peer.readyState === peer.OPEN) {
                peer.send(data.toString());
            }
        }
    });

    socket.on('close', () => {
        room!.delete(socket);
        if (room!.size === 0) rooms.delete(roomId);
        console.log(`Peer left room "${roomId}"`);
    });

    socket.on('error', (err) => {
        console.error(`Socket error in room "${roomId}":`, err);
    });
});

console.log(`Signaling server listening on ws://localhost:${PORT}`);
