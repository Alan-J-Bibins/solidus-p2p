import Quill from 'quill';
import * as Y from 'yjs';

import 'quill/dist/quill.snow.css';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <h2>Collaborative Editor Demo <span style="font-size:14px;color:#888;">(Raw WebRTC + Yjs)</span></h2>

    <div class="config-panel">
      <h3>Connection Settings</h3>
      <div class="config-grid">
        <label>
          <span>Signaling Server</span>
          <input id="signalingServer" type="text" placeholder="ws://localhost:8080" value="ws://localhost:8080" />
        </label>
        <label>
          <span>Room Name</span>
          <input id="roomName" type="text" placeholder="my-room" value="demo-room" />
        </label>
        <label>
          <span>Peer ID (optional)</span>
          <input id="peerId" type="text" placeholder="auto-generated" />
        </label>
        <label>
          <span>ICE Servers (JSON)</span>
          <input id="iceServers" type="text" placeholder='[{"urls":"stun:stun.l.google.com:19302"}]' value='[{"urls":"stun:stun.l.google.com:19302"}]' />
        </label>
      </div>
      <div class="config-actions">
        <button id="connectBtn">Connect</button>
        <button id="disconnectBtn" disabled>Disconnect</button>
        <span id="connectionStatus" class="status">Disconnected</span>
      </div>
    </div>

    <div class="editor-section">
      <h3>Document</h3>
      <div id="editor"></div>
    </div>

    <div class="state-panel">
      <h3>State Object</h3>
      <pre id="stateDisplay">{ "content": "", "version": 0 }</pre>
    </div>
  </div>
`;

const editorContainer = document.querySelector<HTMLDivElement>('#editor')!;
const stateDisplay = document.querySelector<HTMLPreElement>('#stateDisplay')!;
const connectBtn = document.querySelector<HTMLButtonElement>('#connectBtn')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnectBtn')!;
const connectionStatus = document.querySelector<HTMLSpanElement>('#connectionStatus')!;

const quill = new Quill(editorContainer, {
    theme: 'snow',
    placeholder: 'Start typing...',
    modules: {
        toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'code-block'],
            ['clean'],
        ],
    },
});

interface DocState {
    content: string;
    version: number;
}

let docState: DocState = { content: '', version: 0 };
let isApplyingRemoteChange = false;

function updateStateDisplay(): void {
    stateDisplay.textContent = JSON.stringify(docState, null, 2);
}

// ─── Signaling Client ────────────────────────────────────────────────────────

class SignalingClient {
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

// ─── WebRTC Peer ─────────────────────────────────────────────────────────────

class WebRtcPeer {
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

    handleIncomingOffer = async (
        sdp: RTCSessionDescriptionInit,
    ): Promise<RTCSessionDescriptionInit> => {
        await this.pc.setRemoteDescription(sdp);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        const localDesc = this.pc.localDescription!;
        return { type: localDesc.type as RTCSdpType, sdp: localDesc.sdp };
    };

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

// ─── Network Manager ─────────────────────────────────────────────────────────

class NetworkManager {
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

// ─── Local user edits -> broadcast to peers ──────────────────────────────────

quill.on('text-change', (_delta, _oldDelta, source) => {
    console.log(
        '[Quill] text-change event, source:',
        source,
        'isApplyingRemote:',
        isApplyingRemoteChange,
    );
    if (source === 'user' && !isApplyingRemoteChange) {
        console.log('[Quill] Updating docState.content, length:', quill.root.innerHTML.length);
        docState.content = quill.root.innerHTML;
        docState.version++;
        console.log('[Quill] docState updated, version:', docState.version);
        updateStateDisplay();
    }
});

interface ConnectionConfig {
    signalingServer: string;
    roomName: string;
    peerId: string;
    iceServers: unknown[];
}

function getConnectionConfig(): ConnectionConfig {
    const signalingServer = document
        .querySelector<HTMLInputElement>('#signalingServer')!
        .value.trim();
    const roomName = document.querySelector<HTMLInputElement>('#roomName')!.value.trim();
    const peerId = document.querySelector<HTMLInputElement>('#peerId')!.value.trim();
    const iceServersRaw = document.querySelector<HTMLInputElement>('#iceServers')!.value.trim();

    let iceServers: unknown[] = [];
    try {
        iceServers = JSON.parse(iceServersRaw);
    } catch {
        iceServers = [];
    }

    return { signalingServer, roomName, peerId, iceServers };
}

// ─── Yjs + Network Integration ───────────────────────────────────────────────

let yDoc: Y.Doc | null = null;
let yMap: Y.Map<unknown> | null = null;
let network: NetworkManager | null = null;

connectBtn.addEventListener('click', async () => {
    const config = getConnectionConfig();
    console.log('[Connect] Starting connection with config:', config);
    connectionStatus.textContent = `Connecting to "${config.roomName}" via ${config.signalingServer}...`;
    connectionStatus.classList.add('connecting');

    try {
        yDoc = new Y.Doc();
        yMap = yDoc.getMap('state');

        yMap.set('content', quill.root.innerHTML);
        yMap.set('version', 0);

        yDoc.on('update', (_update: Uint8Array, origin: unknown) => {
            if (origin === 'local') return;

            const content = yMap!.get('content') as string;
            const version = yMap!.get('version') as number;

            if (content !== docState.content) {
                console.log('[Yjs] Remote update received, content length:', content.length);
                isApplyingRemoteChange = true;
                quill.root.innerHTML = content;
                isApplyingRemoteChange = false;

                docState.content = content;
                docState.version = version;
                updateStateDisplay();
            }
        });

        yMap.observe((_event) => {
            const isRemote = _event.transaction.origin !== 'local';
            if (!isRemote) return;

            const content = yMap!.get('content') as string;
            const version = yMap!.get('version') as number;

            console.log('[Yjs] yMap observed remote change, content length:', content.length);
            isApplyingRemoteChange = true;
            quill.root.innerHTML = content;
            isApplyingRemoteChange = false;

            docState.content = content;
            docState.version = version;
            updateStateDisplay();
        });

        network = new NetworkManager(config.iceServers as RTCIceServer[]);

        network.onMessage((_peerId, data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.kind === 'yjs-update') {
                    const update = new Uint8Array(msg.update);
                    console.log('[Network] Received Yjs update, size:', update.length);
                    Y.applyUpdate(yDoc!, update, 'remote');
                }
            } catch (err) {
                console.error('[Network] Failed to parse message:', err);
            }
        });

        await network.connect(config.signalingServer, config.roomName);
        console.log('[Connect] Network connected! Local peer ID:', network.localPeerId);

        network.onPeerJoin((peerId) => {
            console.log('[Network] Peer joined:', peerId, 'Total peers:', network!.peerIds.length);
            connectionStatus.textContent = `Connected to "${config.roomName}" (${network!.peerIds.length} peers)`;

            const stateUpdate = Y.encodeStateAsUpdate(yDoc!);
            network!.broadcast(
                JSON.stringify({ kind: 'yjs-update', update: Array.from(stateUpdate) }),
            );
        });

        network.onPeerLeave((peerId) => {
            console.log('[Network] Peer left:', peerId, 'Total peers:', network!.peerIds.length);
            connectionStatus.textContent = `Connected to "${config.roomName}" (${network!.peerIds.length} peers)`;
        });

        quill.on('text-change', (_delta, _oldDelta, source) => {
            if (source === 'user' && !isApplyingRemoteChange) {
                yDoc!.transact(() => {
                    yMap!.set('content', quill.root.innerHTML);
                    yMap!.set('version', (yMap!.get('version') as number) + 1);
                }, 'local');

                const update = Y.encodeStateAsUpdate(yDoc!);
                network!.broadcast(
                    JSON.stringify({ kind: 'yjs-update', update: Array.from(update) }),
                );
            }
        });

        connectionStatus.textContent = `Connected to "${config.roomName}" (waiting for peers...)`;
        connectionStatus.classList.remove('connecting');
        connectionStatus.classList.add('connected');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;

        docState.content = quill.root.innerHTML;
        docState.version = 0;
        updateStateDisplay();
        console.log('[Connect] Connection complete!');
    } catch (err) {
        console.error('[Connect] Connection failed:', err);
        connectionStatus.textContent = `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
        connectionStatus.classList.remove('connecting');
    }
});

disconnectBtn.addEventListener('click', () => {
    console.log('[Disconnect] Closing network...');
    if (network) {
        network.close();
        network = null;
    }
    if (yDoc) {
        yDoc.destroy();
        yDoc = null;
        yMap = null;
    }

    docState = { content: '', version: 0 };
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.classList.remove('connected', 'connecting');
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    updateStateDisplay();
    console.log('[Disconnect] Complete');
});

updateStateDisplay();
