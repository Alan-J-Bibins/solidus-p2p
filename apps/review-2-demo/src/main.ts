import { solidus, webrtc, type NetworkHandle } from '@solidus-p2p/core';

import 'quill/dist/quill.snow.css';
import './style.css';
import { yjs } from '@solidus-p2p/core/state-sync/integrations';
import Quill from 'quill';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <h2>Collaborative Editor Demo</h2>

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

// Module-level references for cleanup
let solidusInstance: ReturnType<typeof solidus> | null = null;
let docState: DocState | null = null;
let network: NetworkHandle | null = null;
let isApplyingRemoteChange = false;

function updateStateDisplay(): void {
    if (docState) {
        stateDisplay.textContent = JSON.stringify(docState, null, 2);
    }
}

// Local user edits -> broadcast to peers
quill.on('text-change', (_delta, _oldDelta, source) => {
    console.log(
        '[Quill] text-change event, source:',
        source,
        'isApplyingRemote:',
        isApplyingRemoteChange,
    );
    if (source === 'user' && docState && !isApplyingRemoteChange) {
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

connectBtn.addEventListener('click', async () => {
    const config = getConnectionConfig();
    console.log('[Connect] Starting connection with config:', config);
    connectionStatus.textContent = `Connecting to "${config.roomName}" via ${config.signalingServer}...`;
    connectionStatus.classList.add('connecting');

    try {
        // Create solidus instance with WebRTC plugin
        console.log('[Connect] Creating solidus instance...');
        solidusInstance = solidus({
            plugins: [webrtc(), yjs()],
            onStateOperation: (op) => {
                console.log('[Solidus] onStateOperation fired, op:', op);
                // This fires for all operations, but we only want to update Quill
                // when the change came from a remote peer (not our own edits)
                if (docState && !isApplyingRemoteChange) {
                    console.log(
                        '[Solidus] Applying remote change to Quill, content length:',
                        docState.content.length,
                    );
                    isApplyingRemoteChange = true;
                    quill.root.innerHTML = docState.content;
                    isApplyingRemoteChange = false;
                    updateStateDisplay();
                }
            },
        });
        console.log('[Connect] Solidus instance created');

        // Create the raw state object first
        const rawDocState = {
            content: quill.root.innerHTML,
            version: 0,
        };
        console.log('[Connect] Raw state object created:', rawDocState);

        // Create the proxied state for local use
        docState = solidusInstance.createState(rawDocState, (op) => {
            console.log(op);
        });
        console.log('[Connect] Proxied state created, docState:', docState);

        // Create peer network - pass the RAW object, not the proxy
        console.log('[Connect] Creating peer network...');
        network = solidusInstance.create({
            type: 'peer-network',
            config: {
                target: rawDocState,
                signalingServer: config.signalingServer,
                room: config.roomName,
                iceServers: config.iceServers as RTCIceServer[],
            },
        });
        console.log('[Connect] Network created:', network);

        if (network) {
            // Wait for signaling connection
            console.log('[Connect] Waiting for network to open...');
            await network.waitUntilOpen();
            console.log('[Connect] Network is open! Local peer ID:', network.localPeerId);

            // Listen for peer events
            network.onPeerJoin((peerId) => {
                console.log(
                    '[Network] Peer joined:',
                    peerId,
                    'Total peers:',
                    network!.peers.length,
                );
                connectionStatus.textContent = `Connected to "${config.roomName}" (${network!.peers.length} peers)`;
            });

            network.onPeerLeave((peerId) => {
                console.log('[Network] Peer left:', peerId, 'Total peers:', network!.peers.length);
                connectionStatus.textContent = `Connected to "${config.roomName}" (${network!.peers.length} peers)`;
            });

            network.onMessage((peerId, data) => {
                console.log('[Network] Received message from peer:', peerId, 'data:', data);
            });
        }

        connectionStatus.textContent = `Connected to "${config.roomName}" (waiting for peers...)`;
        connectionStatus.classList.remove('connecting');
        connectionStatus.classList.add('connected');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;

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
    solidusInstance = null;
    docState = null;

    connectionStatus.textContent = 'Disconnected';
    connectionStatus.classList.remove('connected', 'connecting');
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    console.log('[Disconnect] Complete');
});

updateStateDisplay();
