import { WebSocketServer, type WebSocket } from 'ws';

export interface TestSignalingServer {
    port: number;
    close(): Promise<void>;
}

export function startTestSignalingServer(): Promise<TestSignalingServer> {
    return new Promise((resolve) => {
        const rooms = new Map<string, Set<WebSocket>>();
        const wss = new WebSocketServer({ port: 0 }); // 0 = OS assigns a free port

        wss.on('connection', (socket, request) => {
            const url = new URL(request.url ?? '', 'http://localhost');
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
            room.add(socket);

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
            });
        });

        wss.on('listening', () => {
            const address = wss.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                port,
                close: () =>
                    new Promise<void>((res, rej) => {
                        wss.close((err) => (err ? rej(err) : res()));
                    }),
            });
        });
    });
}
