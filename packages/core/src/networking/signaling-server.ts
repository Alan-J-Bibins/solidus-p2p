import { randomUUID } from 'crypto';

import { WebSocketServer, type WebSocket } from 'ws';

import type { SignalingServerConfig } from './types.ts';

export class SignalingServer {
    private wss: WebSocketServer | null = null;
    private rooms = new Map<string, Map<string, WebSocket>>();
    private config: SignalingServerConfig;

    constructor(config: SignalingServerConfig) {
        this.config = config;
    }

    listen(): Promise<void> {
        return new Promise((resolve) => {
            this.wss = new WebSocketServer({
                port: this.config.port,
                host: this.config.host ?? '0.0.0.0',
            });

            this.wss.on('connection', (socket, request) => {
                const url = new URL(request.url ?? '', `http://${request.headers.host}`);
                const roomId = url.searchParams.get('room');
                if (!roomId) return socket.close(1008, 'Missing ?room=');

                const peerId = randomUUID();
                let room = this.rooms.get(roomId);
                if (!room) {
                    this.rooms.set(roomId, (room = new Map()));
                    this.config.hooks?.onRoomCreated?.(roomId);
                }

                const existingPeers = Array.from(room.keys());
                room.set(peerId, socket);
                this.config.hooks?.onConnection?.(peerId, roomId);

                socket.send(JSON.stringify({ kind: 'welcome', peerId, peers: existingPeers }));

                for (const [otherId, otherSocket] of room) {
                    if (otherId !== peerId && otherSocket.readyState === otherSocket.OPEN) {
                        otherSocket.send(JSON.stringify({ kind: 'peer-joined', peerId }));
                    }
                }

                socket.on('message', (data) => {
                    let message: any;
                    try {
                        message = JSON.parse(String(data));
                    } catch (err) {
                        this.config.hooks?.onError?.(err as Error, 'Failed to parse message');
                        return;
                    }

                    this.config.hooks?.onMessage?.(peerId, message);

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
                            this.config.hooks?.onSignalForward?.(
                                peerId,
                                message.to,
                                message.signal,
                            );
                        }
                    }
                });

                socket.on('close', () => {
                    room!.delete(peerId);
                    this.config.hooks?.onDisconnection?.(peerId, roomId);

                    if (room!.size === 0) {
                        this.rooms.delete(roomId);
                        this.config.hooks?.onRoomDestroyed?.(roomId);
                    } else {
                        for (const [, otherSocket] of room!) {
                            if (otherSocket.readyState === otherSocket.OPEN) {
                                otherSocket.send(JSON.stringify({ kind: 'peer-left', peerId }));
                            }
                        }
                    }
                });
            });

            this.wss.on('listening', () => {
                this.config.hooks?.onReady?.(this.config.port, this.config.host ?? '0.0.0.0');
                resolve();
            });
        });
    }

    close(): void {
        this.wss?.close();
        this.rooms.clear();
        this.wss = null;
    }
}
