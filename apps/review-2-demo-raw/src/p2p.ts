export class SignalingClient {
    private ws: WebSocket | null = null;
    private _localPeerId: string | null = null;
    private onWelcome: ((peerId: string, peers: string[]) => void) | null = null;
    private onPeerJoined: ((peerId: string) => void) | null = null;
    private onPeerLeft: ((peerId: string) => void) | null = null;
    private onSignal:
        | ((
              from: string,
              signal:
                  | RTCSessionDescriptionInit
                  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit },
          ) => void)
        | null = null;
    private connectResolve: (() => void) | null = null;

    get localPeerId(): string | null {
        return this._localPeerId;
    }

    connect(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connectResolve = resolve;
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('[Signaling] WebSocket connected');
            };

            this.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                console.log('[Signaling] Received:', msg.kind);

                switch (msg.kind) {
                    case 'welcome':
                        this._localPeerId = msg.peerId;
                        this.onWelcome?.(msg.peerId, msg.peers);
                        this.connectResolve?.();
                        this.connectResolve = null;
                        break;
                    case 'peer-joined':
                        this.onPeerJoined?.(msg.peerId);
                        break;
                    case 'peer-left':
                        this.onPeerLeft?.(msg.peerId);
                        break;
                    case 'signal':
                        this.onSignal?.(msg.from, msg.signal);
                        break;
                }
            };

            this.ws.onerror = (err) => {
                console.error('[Signaling] WebSocket error:', err);
                reject(new Error('Signaling connection failed'));
            };

            this.ws.onclose = () => {
                console.log('[Signaling] WebSocket closed');
            };
        });
    }

    sendSignal(
        to: string,
        signal:
            | RTCSessionDescriptionInit
            | { type: 'ice-candidate'; candidate: RTCIceCandidateInit },
    ): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ kind: 'signal', to, signal }));
        }
    }

    setHandlers(handlers: {
        onWelcome: (peerId: string, peers: string[]) => void;
        onPeerJoined: (peerId: string) => void;
        onPeerLeft: (peerId: string) => void;
        onSignal: (
            from: string,
            signal:
                | RTCSessionDescriptionInit
                | { type: 'ice-candidate'; candidate: RTCIceCandidateInit },
        ) => void;
    }): void {
        this.onWelcome = handlers.onWelcome;
        this.onPeerJoined = handlers.onPeerJoined;
        this.onPeerLeft = handlers.onPeerLeft;
        this.onSignal = handlers.onSignal;
    }

    close(): void {
        this.ws?.close();
        this.ws = null;
    }
}

export class WebRtcPeer {
    private pc: RTCPeerConnection;
    private dc: RTCDataChannel | null = null;
    private _isOpen = false;
    private openResolve: (() => void) | null = null;
    private openPromise: Promise<void>;
    private onMessage: ((data: string) => void) | null = null;
    private onClose: (() => void) | null = null;
    private onSignal:
        | ((
              signal:
                  | RTCSessionDescriptionInit
                  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit },
          ) => void)
        | null = null;

    readonly peerId: string;

    constructor(peerId: string, iceServers: RTCIceServer[]) {
        this.peerId = peerId;
        this.pc = new RTCPeerConnection({ iceServers });
        this.openPromise = new Promise((resolve) => {
            this.openResolve = resolve;
        });

        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.onSignal?.({
                    type: 'ice-candidate',
                    candidate: event.candidate.toJSON(),
                });
            }
        };

        this.pc.onconnectionstatechange = () => {
            console.log(`[Peer ${peerId}] Connection state:`, this.pc.connectionState);
            if (
                this.pc.connectionState === 'disconnected' ||
                this.pc.connectionState === 'failed'
            ) {
                this.onClose?.();
            }
        };
    }

    get isOpen(): boolean {
        return this._isOpen;
    }

    async createOffer(): Promise<RTCSessionDescriptionInit> {
        this.dc = this.pc.createDataChannel('data');
        this.setupDataChannel(this.dc);

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        const localDesc = this.pc.localDescription!;
        return { type: localDesc.type as RTCSdpType, sdp: localDesc.sdp };
    }

    async handleSignal(
        signal:
            | RTCSessionDescriptionInit
            | { type: 'ice-candidate'; candidate: RTCIceCandidateInit },
    ): Promise<RTCSessionDescriptionInit | null> {
        if ('type' in signal && signal.type === 'offer') {
            await this.pc.setRemoteDescription(signal);
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            const localDesc = this.pc.localDescription!;
            return { type: localDesc.type as RTCSdpType, sdp: localDesc.sdp };
        }

        if ('type' in signal && signal.type === 'answer') {
            await this.pc.setRemoteDescription(signal);
            return null;
        }

        if ('type' in signal && signal.type === 'ice-candidate') {
            const iceCandidate = signal as {
                type: 'ice-candidate';
                candidate: RTCIceCandidateInit;
            };
            await this.pc.addIceCandidate(iceCandidate.candidate);
            return null;
        }

        return null;
    }

    private setupDataChannel(dc: RTCDataChannel): void {
        this.dc = dc;

        dc.onopen = () => {
            console.log(`[Peer ${this.peerId}] Data channel opened`);
            this._isOpen = true;
            this.openResolve?.();
        };

        dc.onmessage = (event) => {
            if (typeof event.data === 'string') {
                this.onMessage?.(event.data);
            }
        };

        dc.onclose = () => {
            console.log(`[Peer ${this.peerId}] Data channel closed`);
            this._isOpen = false;
            this.onClose?.();
        };
    }

    async waitForOpen(): Promise<void> {
        if (this._isOpen) return;

        this.pc.ondatachannel = (event) => {
            this.setupDataChannel(event.channel);
        };

        return this.openPromise;
    }

    send(data: string): void {
        if (this.dc?.readyState === 'open') {
            this.dc.send(data);
        }
    }

    setHandlers(handlers: {
        onMessage: (data: string) => void;
        onClose: () => void;
        onSignal: (
            signal:
                | RTCSessionDescriptionInit
                | { type: 'ice-candidate'; candidate: RTCIceCandidateInit },
        ) => void;
    }): void {
        this.onMessage = handlers.onMessage;
        this.onClose = handlers.onClose;
        this.onSignal = handlers.onSignal;
    }

    close(): void {
        this.dc?.close();
        this.pc.close();
    }
}

export class NetworkManager {
    private signaling: SignalingClient;
    private peers: Map<string, WebRtcPeer> = new Map();
    private iceServers: RTCIceServer[];
    private onPeerJoinHandlers: ((peerId: string) => void)[] = [];
    private onPeerLeaveHandlers: ((peerId: string) => void)[] = [];
    private onMessageHandlers: ((peerId: string, data: string) => void)[] = [];

    constructor(iceServers: RTCIceServer[]) {
        this.signaling = new SignalingClient();
        this.iceServers = iceServers;
    }

    get localPeerId(): string | null {
        return this.signaling.localPeerId;
    }

    get peerIds(): string[] {
        return Array.from(this.peers.keys());
    }

    async connect(signalingUrl: string, room: string): Promise<void> {
        const url = `${signalingUrl}?room=${encodeURIComponent(room)}`;

        this.signaling.setHandlers({
            onWelcome: (peerId, existingPeers) => {
                console.log('[Network] Welcome! My ID:', peerId, 'Existing peers:', existingPeers);
                for (const existingPeerId of existingPeers) {
                    this.setupPeer(existingPeerId, true);
                }
            },
            onPeerJoined: (peerId) => {
                console.log('[Network] Peer joined:', peerId);
                this.setupPeer(peerId, false);
            },
            onPeerLeft: (peerId) => {
                console.log('[Network] Peer left:', peerId);
                this.removePeer(peerId);
            },
            onSignal: async (from, signal) => {
                console.log(
                    '[Network] Signal from:',
                    from,
                    'type:',
                    'type' in signal ? signal.type : 'unknown',
                );
                let peer = this.peers.get(from);

                if (!peer) {
                    peer = this.setupPeer(from, false);
                }

                const response = await peer.handleSignal(signal);
                if (response) {
                    this.signaling.sendSignal(from, response);
                }
            },
        });

        await this.signaling.connect(url);
    }

    private setupPeer(peerId: string, isInitiator: boolean): WebRtcPeer {
        const peer = new WebRtcPeer(peerId, this.iceServers);

        peer.setHandlers({
            onMessage: (data) => {
                this.onMessageHandlers.forEach((h) => h(peerId, data));
            },
            onClose: () => {
                this.removePeer(peerId);
            },
            onSignal: (signal) => {
                this.signaling.sendSignal(peerId, signal);
            },
        });

        this.peers.set(peerId, peer);

        if (isInitiator) {
            peer.createOffer().then((offer) => {
                this.signaling.sendSignal(peerId, offer);
            });
        }

        peer.waitForOpen().then(() => {
            this.onPeerJoinHandlers.forEach((h) => h(peerId));
        });

        return peer;
    }

    private removePeer(peerId: string): void {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.close();
            this.peers.delete(peerId);
            this.onPeerLeaveHandlers.forEach((h) => h(peerId));
        }
    }

    broadcast(data: string): void {
        for (const peer of this.peers.values()) {
            peer.send(data);
        }
    }

    onPeerJoin(handler: (peerId: string) => void): void {
        this.onPeerJoinHandlers.push(handler);
    }

    onPeerLeave(handler: (peerId: string) => void): void {
        this.onPeerLeaveHandlers.push(handler);
    }

    onMessage(handler: (peerId: string, data: string) => void): void {
        this.onMessageHandlers.push(handler);
    }

    close(): void {
        for (const peer of this.peers.values()) {
            peer.close();
        }
        this.peers.clear();
        this.signaling.close();
    }
}
