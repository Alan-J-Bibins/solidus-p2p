import type { RTCSignal } from './types.ts';

type WireMessage =
    | { kind: 'welcome'; peerId: string; peers: string[] }
    | { kind: 'peer-joined'; peerId: string }
    | { kind: 'peer-left'; peerId: string }
    | { kind: 'signal'; from: string; to: string; signal: RTCSignal };

export class SignalingClient {
    private ws: WebSocket;
    private welcomeHandlers: Array<(peerId: string, existingPeers: string[]) => void> = [];
    private joinHandlers: Array<(peerId: string) => void> = [];
    private leaveHandlers: Array<(peerId: string) => void> = [];
    private signalHandlers: Array<(from: string, signal: RTCSignal) => void> = [];

    constructor(serverUrl: string, room: string) {
        const host = serverUrl
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
            const message: WireMessage = JSON.parse(event.data);
            switch (message.kind) {
                case 'welcome':
                    this.welcomeHandlers.forEach((h) => h(message.peerId, message.peers));
                    break;
                case 'peer-joined':
                    this.joinHandlers.forEach((h) => h(message.peerId));
                    break;
                case 'peer-left':
                    this.leaveHandlers.forEach((h) => h(message.peerId));
                    break;
                case 'signal':
                    this.signalHandlers.forEach((h) => h(message.from, message.signal));
                    break;
            }
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

    onWelcome(handler: (peerId: string, existingPeers: string[]) => void): void {
        this.welcomeHandlers.push(handler);
    }
    onPeerJoined(handler: (peerId: string) => void): void {
        this.joinHandlers.push(handler);
    }
    onPeerLeft(handler: (peerId: string) => void): void {
        this.leaveHandlers.push(handler);
    }
    onSignal(handler: (from: string, signal: RTCSignal) => void): void {
        this.signalHandlers.push(handler);
    }

    sendSignal(to: string, signal: RTCSignal): void {
        this.ws.send(JSON.stringify({ kind: 'signal', to, signal }));
    }

    close(): void {
        this.ws.close();
    }
}
