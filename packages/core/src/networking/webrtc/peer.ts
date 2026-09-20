import type { RTCSignal } from '../types.ts';
import { PrioritySendQueue } from './send-queue.ts';

export interface WebRtcPeerOptions {
    iceServers?: RTCIceServer[];
    onSignal: (signal: RTCSignal) => void;
    /** Max consecutive state messages sent while chunks are waiting. Default 4. */
    stateBurstLimit?: number;
    /** Stop feeding the channel above this many buffered bytes. Default 64 KiB. */
    highWaterMark?: number;
}

export class WebRtcPeer {
    readonly connection: RTCPeerConnection;
    private dataChannel: RTCDataChannel | null = null;
    private onSignal: (signal: RTCSignal) => void;
    private messageHandlers: Array<(data: string) => void> = [];
    private openResolvers: Array<() => void> = [];
    private isOpen = false;

    private readonly queue: PrioritySendQueue<string>;
    private readonly highWaterMark: number;
    private readonly lowWaterMark: number;

    constructor(options: WebRtcPeerOptions) {
        this.onSignal = options.onSignal;
        this.highWaterMark = options.highWaterMark ?? 64 * 1024;
        this.lowWaterMark = Math.floor(this.highWaterMark / 4);
        this.queue = new PrioritySendQueue<string>(options.stateBurstLimit ?? 4);

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

        // Backpressure: resume draining the queue when the browser's buffer empties
        channel.bufferedAmountLowThreshold = this.lowWaterMark;
        channel.onbufferedamountlow = () => this.pump();

        channel.onopen = () => {
            this.isOpen = true;
            this.openResolvers.forEach((resolve) => resolve());
            this.openResolvers = [];
            this.pump();
        };

        channel.onmessage = async (event) => {
            let data = event.data;
            if (data instanceof Blob) {
                data = await data.text();
            } else if (data instanceof ArrayBuffer) {
                data = new TextDecoder().decode(data);
            }
            this.messageHandlers.forEach((handler) => handler(data));
        };
    }

    /** Move messages from the priority queue into the channel while there's room. */
    private pump(): void {
        const channel = this.dataChannel;
        if (!channel || channel.readyState !== 'open') return;

        while (channel.bufferedAmount < this.highWaterMark) {
            const next = this.queue.shift();
            if (next === undefined) return;
            try {
                channel.send(next);
            } catch (err) {
                // e.g. message larger than the channel's max message size
                console.error(
                    '[solidus-p2p webrtc] Failed to send queued message, dropping it',
                    err,
                );
            }
        }
    }

    get isChannelOpen(): boolean {
        return this.dataChannel?.readyState === 'open';
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

    /** Direct send, bypasses the priority queue. */
    send(data: string): void {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('[solidus-p2p webrtc] Data channel is not open');
        }
        this.dataChannel.send(data);
    }

    /** High-priority lane. */
    enqueueState(frame: string): void {
        this.assertOpen();
        this.queue.pushState(frame);
        this.pump();
    }

    /** Low-priority lane (still guaranteed a share of bandwidth). */
    enqueueChunk(frame: string): void {
        this.assertOpen();
        this.queue.pushChunk(frame);
        this.pump();
    }

    private assertOpen(): void {
        if (!this.isChannelOpen) {
            throw new Error('[solidus-p2p webrtc] Data channel is not open');
        }
    }

    waitUntilOpen(): Promise<void> {
        if (this.isOpen) return Promise.resolve();
        return new Promise((resolve) => this.openResolvers.push(resolve));
    }

    close(): void {
        this.queue.clear();
        this.dataChannel?.close();
        this.connection.close();
    }
}
