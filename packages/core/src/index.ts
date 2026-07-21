export type SignalingMessage =
    | { type: 'offer'; sdp: RTCSessionDescriptionInit }
    | { type: 'answer'; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

export interface PeerOptions {
    iceServers?: RTCIceServer[];
    onSignal: (message: SignalingMessage) => void;
}

export class P2PPeer {
    readonly connection: RTCPeerConnection;
    private dataChannel: RTCDataChannel | null = null;
    private onSignal: (message: SignalingMessage) => void;
    private messageHandlers: Array<(data: string) => void> = [];
    private openResolvers: Array<() => void> = [];
    private isOpen = false;

    constructor(options: PeerOptions) {
        this.onSignal = options.onSignal;
        this.connection = new RTCPeerConnection({
            iceServers: options.iceServers ?? [],
        });

        // Whenever the browser/Node discovers a network path, forward it out.
        this.connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.onSignal({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
            }
        };

        // The answering peer receives its data channel this way (it didn't create one).
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

    /** Call this on the peer that initiates the connection. */
    async createOffer(): Promise<void> {
        this.attachDataChannel(this.connection.createDataChannel('data'));
        const offer = await this.connection.createOffer();
        await this.connection.setLocalDescription(offer);
        this.onSignal({ type: 'offer', sdp: offer });
    }

    /** Feed every incoming signaling message (from whatever transport) here. */
    async handleSignal(message: SignalingMessage): Promise<void> {
        switch (message.type) {
            case 'offer': {
                await this.connection.setRemoteDescription(message.sdp);
                const answer = await this.connection.createAnswer();
                await this.connection.setLocalDescription(answer);
                this.onSignal({ type: 'answer', sdp: answer });
                break;
            }
            case 'answer': {
                await this.connection.setRemoteDescription(message.sdp);
                break;
            }
            case 'ice-candidate': {
                await this.connection.addIceCandidate(message.candidate);
                break;
            }
        }
    }

    onMessage(handler: (data: string) => void): void {
        this.messageHandlers.push(handler);
    }

    send(data: string): void {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('Data channel is not open');
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
