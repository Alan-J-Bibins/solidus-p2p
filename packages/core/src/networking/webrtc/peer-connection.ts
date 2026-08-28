import type { RTCSignal } from './types.ts';

export interface WebRtcPeerOptions {
    iceServers?: RTCIceServer[];
    onSignal: (signal: RTCSignal) => void;
}

export class WebRtcPeer {
    readonly connection: RTCPeerConnection;
    private dataChannel: RTCDataChannel | null = null;
    private onSignal: (signal: RTCSignal) => void;
    private messageHandlers: Array<(data: string) => void> = [];
    private openResolvers: Array<() => void> = [];
    private isOpen = false;

    constructor(options: WebRtcPeerOptions) {
        this.onSignal = options.onSignal;
        this.connection = new RTCPeerConnection({ iceServers: options.iceServers ?? [] });

        this.connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.onSignal({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
            }
        };

        this.connection.ondatachannel = (event) => {
            this.attachDataChannel(event.channel);
        };
    }

    private attachDataChannel(channel: RTCDataChannel): void {
        this.dataChannel = channel;
        channel.onopen = () => {
            this.isOpen = true;
            this.openResolvers.forEach((resolve) => resolve());
            this.openResolvers = [];
        };
        channel.onmessage = (event) => {
            this.messageHandlers.forEach((handler) => handler(event.data));
        };
    }

    async createOffer(): Promise<void> {
        this.attachDataChannel(this.connection.createDataChannel('data'));
        const offer = await this.connection.createOffer();
        await this.connection.setLocalDescription(offer);
        this.onSignal({ type: 'offer', sdp: offer });
    }

    async handleSignal(signal: RTCSignal): Promise<void> {
        switch (signal.type) {
            case 'offer': {
                await this.connection.setRemoteDescription(signal.sdp);
                const answer = await this.connection.createAnswer();
                await this.connection.setLocalDescription(answer);
                this.onSignal({ type: 'answer', sdp: answer });
                break;
            }
            case 'answer': {
                await this.connection.setRemoteDescription(signal.sdp);
                break;
            }
            case 'ice-candidate': {
                await this.connection.addIceCandidate(signal.candidate);
                break;
            }
        }
    }

    onMessage(handler: (data: string) => void): void {
        this.messageHandlers.push(handler);
    }

    send(data: string): void {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('[solidus-p2p webrtc] Data channel is not open');
        }
        this.dataChannel.send(data);
    }

    waitUntilOpen(): Promise<void> {
        if (this.isOpen) return Promise.resolve();
        return new Promise((resolve) => this.openResolvers.push(resolve));
    }

    close(): void {
        this.dataChannel?.close();
        this.connection.close();
    }
}
