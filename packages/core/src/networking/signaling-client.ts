import type { SignalingMessage } from './types.ts';

export class SignalingClient {
    private ws: WebSocket;
    private messageHandlers: Array<(message: SignalingMessage) => void> = [];

    constructor(serverUrl: string, room: string) {
        let host = serverUrl
            .trim()
            .replace(/^wss?:\/\//, '')
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');
        const isSecure =
            host.includes('ngrok') ||
            (typeof location !== 'undefined' && location.protocol === 'https:');
        const scheme = isSecure ? 'wss://' : 'ws://';

        this.ws = new WebSocket(`${scheme}${host}?room=${encodeURIComponent(room)}`);

        this.ws.addEventListener('message', (event) => {
            const message: SignalingMessage = JSON.parse(event.data);
            this.messageHandlers.forEach((handler) => handler(message));
        });
    }

    waitUntilOpen(): Promise<void> {
        if (this.ws.readyState === this.ws.OPEN) return Promise.resolve();
        return new Promise((resolve, reject) => {
            this.ws.addEventListener('open', () => resolve(), { once: true });
            this.ws.addEventListener(
                'error',
                () => reject(new Error('[solidus-p2p] Signaling connection failed')),
                { once: true },
            );
        });
    }

    send(message: SignalingMessage): void {
        this.ws.send(JSON.stringify(message));
    }

    onMessage(handler: (message: SignalingMessage) => void): void {
        this.messageHandlers.push(handler);
    }

    close(): void {
        this.ws.close();
    }
}
