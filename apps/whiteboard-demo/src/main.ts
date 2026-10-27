import { solidus, webrtc, type NetworkHandle } from '@solidus-p2p/core';
import { merkleEGWalker } from '@solidus-p2p/core/state-sync/integrations';

import locStats from './loc-stats.json';

import './style.css';

// --- Types ---

interface Point {
    x: number;
    y: number;
}

interface Stroke {
    id: string;
    points: Point[];
    color: string;
    width: number;
}

interface WhiteboardState {
    strokes: Stroke[];
    version: number;
}

// --- DOM Setup ---

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <h2>Collaborative Whiteboard</h2>

    <div class="config-panel">
      <h3>Connection Settings</h3>
      <div class="config-grid">
        <label>
          <span>Signaling Server</span>
          <input id="signalingServer" type="text" value="ws://localhost:8080" />
        </label>
        <label>
          <span>Room Name</span>
          <input id="roomName" type="text" value="whiteboard-room" />
        </label>
      </div>
      <div class="config-actions">
        <button id="connectBtn">Connect</button>
        <button id="disconnectBtn" disabled>Disconnect</button>
        <span id="connectionStatus" class="status">Disconnected</span>
      </div>
    </div>

    <div class="whiteboard-section">
      <div class="toolbar">
        <label>
          <span>Color</span>
          <input id="colorPicker" type="color" value="#000000" />
        </label>
        <label>
          <span>Size</span>
          <input id="sizePicker" type="range" min="1" max="20" value="3" />
        </label>
        <button id="clearBtn">Clear</button>
        <span class="stroke-count">Strokes: <span id="strokeCount">0</span></span>
      </div>
      <canvas id="canvas"></canvas>
    </div>

    <div class="loc-section">
      <h3>With vs. Without Solidus</h3>
      <div class="loc-cards">
        <div class="loc-card">
          <span class="loc-card-label">Without Solidus</span>
          <span class="loc-card-value" id="locWithout">0</span>
          <span class="loc-card-sub">lines</span>
        </div>
        <div class="loc-card loc-card-highlight">
          <span class="loc-card-label">With Solidus</span>
          <span class="loc-card-value" id="locWith">0</span>
          <span class="loc-card-sub">lines</span>
        </div>
      </div>
      <div class="loc-bars">
        <div class="loc-bar-row">
          <span class="loc-bar-label">Without Solidus</span>
          <div class="loc-bar-track">
            <div class="loc-bar-fill loc-bar-without" id="locBarWithout" style="width: 100%"></div>
          </div>
        </div>
        <div class="loc-bar-row">
          <span class="loc-bar-label">With Solidus</span>
          <div class="loc-bar-track">
            <div class="loc-bar-fill loc-bar-with" id="locBarWith" style="width: 0%"></div>
          </div>
        </div>
      </div>
      <div class="loc-summary">
        <span><strong id="locSaved">0</strong> fewer lines</span>
        <span><strong id="locPercent">0%</strong> reduction</span>
      </div>

      <div class="code-compare">
        <h4>See the Code</h4>
        <div class="code-tabs" role="tablist">
          <button type="button" class="code-tab-btn active" id="tabWith" data-target="codePanelWith">With Solidus</button>
          <button type="button" class="code-tab-btn" id="tabWithout" data-target="codePanelWithout">Without Solidus</button>
        </div>
        <div class="code-panels">
          <div class="code-panel active" id="codePanelWith"></div>
          <div class="code-panel" id="codePanelWithout"></div>
        </div>
      </div>
    </div>
  </div>
`;

// --- DOM References ---

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const ctx = canvas.getContext('2d')!;
const connectBtn = document.querySelector<HTMLButtonElement>('#connectBtn')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnectBtn')!;
const connectionStatus = document.querySelector<HTMLSpanElement>('#connectionStatus')!;
const colorPicker = document.querySelector<HTMLInputElement>('#colorPicker')!;
const sizePicker = document.querySelector<HTMLInputElement>('#sizePicker')!;
const clearBtn = document.querySelector<HTMLButtonElement>('#clearBtn')!;
const strokeCountEl = document.querySelector<HTMLSpanElement>('#strokeCount')!;

// --- Canvas Setup ---

function resizeCanvas() {
    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 500;
    redraw();
}

window.addEventListener('resize', resizeCanvas);

// --- State ---

let solidusInstance: ReturnType<typeof solidus> | null = null;
let docState: WhiteboardState | null = null;
let rawDocState: WhiteboardState | null = null;
let network: NetworkHandle | null = null;

// Current stroke being drawn (not yet committed to shared state)
let currentStroke: Stroke | null = null;
let isDrawing = false;
let isApplyingRemoteState = false;

// --- Drawing Functions ---

function drawStroke(stroke: Stroke) {
    if (stroke.points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
}

function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all committed strokes
    if (docState) {
        for (const stroke of docState.strokes) {
            drawStroke(stroke);
        }
        strokeCountEl.textContent = String(docState.strokes.length);
    }

    // Draw current in-progress stroke
    if (currentStroke) {
        drawStroke(currentStroke);
    }
}

function getCanvasPoint(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    };
}

// --- Mouse Events ---

canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const point = getCanvasPoint(e);
    currentStroke = {
        id: crypto.randomUUID(),
        points: [point],
        color: colorPicker.value,
        width: Number(sizePicker.value),
    };
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !currentStroke) return;
    const point = getCanvasPoint(e);
    currentStroke.points.push(point);
    redraw();
});

canvas.addEventListener('mouseup', () => {
    if (!isDrawing || !currentStroke || !docState || isApplyingRemoteState) {
        isDrawing = false;
        currentStroke = null;
        return;
    }

    // Commit the stroke to shared state
    if (currentStroke.points.length >= 2) {
        docState.strokes.push(currentStroke);
        docState.version++;
    }

    currentStroke = null;
    isDrawing = false;
    redraw();
});

canvas.addEventListener('mouseleave', () => {
    // Treat mouseleave like mouseup
    if (
        isDrawing &&
        currentStroke &&
        docState &&
        !isApplyingRemoteState &&
        currentStroke.points.length >= 2
    ) {
        docState.strokes.push(currentStroke);
        docState.version++;
    }
    currentStroke = null;
    isDrawing = false;
    redraw();
});

// --- Clear ---

clearBtn.addEventListener('click', () => {
    if (!docState || isApplyingRemoteState) return;

    console.log('[Clear] Clearing all strokes, current count:', docState.strokes.length);

    // Clear all strokes by setting length to 0 (triggers ARRAY_RESIZE)
    docState.strokes.length = 0;
    docState.version++;

    console.log('[Clear] Strokes cleared, broadcasting to peers');
    redraw();
});

// --- Connection ---

const STORAGE_KEY = 'whiteboard-offline-state';

// Save state to localStorage before unload
window.addEventListener('beforeunload', () => {
    if (docState) {
        const stateToSave = {
            strokes: docState.strokes,
            version: docState.version,
            timestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        console.log('[Storage] Saved state to localStorage, strokes:', docState.strokes.length);
    }
});

connectBtn.addEventListener('click', async () => {
    const signalingServer = document
        .querySelector<HTMLInputElement>('#signalingServer')!
        .value.trim();
    const roomName = document.querySelector<HTMLInputElement>('#roomName')!.value.trim();

    connectionStatus.textContent = `Connecting to "${roomName}"...`;
    connectionStatus.classList.add('connecting');

    try {
        solidusInstance = solidus({
            plugins: [webrtc(), merkleEGWalker({})],
            onStateOperation: (op) => {
                console.log('[Solidus] Local operation:', op.type, op.path);
            },
            onRemoteOperation: (_op, peerId) => {
                console.log('[Solidus] Remote operation from:', peerId);
                // Redraw canvas when remote state changes
                redraw();
            },
        });

        // Create state with offline data if available
        rawDocState = {
            strokes: [],
            version: 0,
        };

        // Check for offline state in localStorage
        const savedStateJson = localStorage.getItem(STORAGE_KEY);
        if (savedStateJson) {
            try {
                const savedState = JSON.parse(savedStateJson);
                if (savedState.strokes && Array.isArray(savedState.strokes)) {
                    rawDocState.strokes = savedState.strokes;
                    rawDocState.version = savedState.version || 0;
                    console.log(
                        '[Storage] Restored offline state, strokes:',
                        savedState.strokes.length,
                    );
                }
                // Clear the saved state after restoring
                localStorage.removeItem(STORAGE_KEY);
            } catch (err) {
                console.error('[Storage] Failed to parse saved state:', err);
            }
        }

        docState = solidusInstance.createState(rawDocState, (op) => {
            console.log('[State] Update:', op.type, op.path);
            // Redraw canvas whenever state changes (local or remote)
            redraw();
        });

        network = solidusInstance.create({
            type: 'peer-network',
            config: {
                target: rawDocState,
                signalingServer,
                room: roomName,
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun.cloudflare.com:3478' },
                ],
            },
        });

        await network!.waitUntilOpen();
        console.log('[Network] Open! Peer ID:', network!.localPeerId);
        console.log('[Network] Current peers:', network!.peers);

        network!.onPeerJoin((peerId) => {
            console.log('[Network] Peer joined:', peerId);
            connectionStatus.textContent = `Connected to "${roomName}" (${network!.peers.length} peers)`;

            // Request current state from the new peer
            const stateRequest = JSON.stringify({
                kind: 'state-request',
                from: network!.localPeerId,
            });
            network!.send(peerId, stateRequest);
            console.log('[Network] Requested state from peer:', peerId);
        });

        network!.onPeerLeave((peerId) => {
            console.log('[Network] Peer left:', peerId);
            connectionStatus.textContent = `Connected to "${roomName}" (${network!.peers.length} peers)`;
        });

        network!.onMessage((peerId, data) => {
            console.log('[Network] Message from peer:', peerId, data);

            try {
                const message = JSON.parse(data);

                // Handle state request from new peer
                if (message.kind === 'state-request' && docState) {
                    console.log('[Network] Sending current state to peer:', peerId);
                    const stateResponse = JSON.stringify({
                        kind: 'state-response',
                        state: {
                            strokes: docState.strokes,
                            version: docState.version,
                        },
                    });
                    network!.send(peerId, stateResponse);
                }

                // Handle state response from existing peer
                if (message.kind === 'state-response' && docState && message.state) {
                    console.log('[Network] Received state from peer:', peerId, message.state);

                    // Merge strokes by combining all unique strokes (dedup by stroke ID)
                    isApplyingRemoteState = true;

                    // Create a map of existing strokes by ID
                    const strokeMap = new Map<string, Stroke>();
                    for (const stroke of docState.strokes) {
                        strokeMap.set(stroke.id, stroke);
                    }

                    // Add remote strokes (will overwrite if same ID exists)
                    for (const stroke of message.state.strokes) {
                        strokeMap.set(stroke.id, stroke);
                    }

                    // Convert back to array and update state
                    const mergedStrokes = Array.from(strokeMap.values());
                    docState.strokes.length = 0;
                    for (const stroke of mergedStrokes) {
                        docState.strokes.push(stroke);
                    }

                    // Take the max version
                    docState.version = Math.max(docState.version, message.state.version);
                    isApplyingRemoteState = false;

                    redraw();
                    console.log('[Network] Merged state, total strokes:', docState.strokes.length);
                }
            } catch (err) {
                console.error('[Network] Failed to parse message:', err);
            }
        });

        connectionStatus.textContent = `Connected to "${roomName}" (waiting for peers...)`;
        connectionStatus.classList.remove('connecting');
        connectionStatus.classList.add('connected');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
    } catch (err) {
        console.error('[Connect] Failed:', err);
        connectionStatus.textContent = `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
        connectionStatus.classList.remove('connecting');
    }
});

disconnectBtn.addEventListener('click', () => {
    // Save state before disconnecting
    if (docState) {
        const stateToSave = {
            strokes: docState.strokes,
            version: docState.version,
            timestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        console.log(
            '[Storage] Saved state to localStorage before disconnect, strokes:',
            docState.strokes.length,
        );
    }

    if (network) {
        network.close();
        network = null;
    }
    solidusInstance = null;
    docState = null;
    rawDocState = null;

    connectionStatus.textContent = 'Disconnected';
    connectionStatus.classList.remove('connected', 'connecting');
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    redraw();
});

// --- LOC Comparison ---

function renderLocComparison() {
    const withoutTotal = locStats.withoutSolidus.total;
    const withTotal = locStats.withSolidus.total;

    document.querySelector('#locWithout')!.textContent = withoutTotal.toLocaleString();
    document.querySelector('#locWith')!.textContent = withTotal.toLocaleString();
    document.querySelector('#locSaved')!.textContent = locStats.linesSaved.toLocaleString();
    document.querySelector('#locPercent')!.textContent = `${locStats.percentReduction.toFixed(1)}%`;

    const withBarPercent = (withTotal / withoutTotal) * 100;
    (document.querySelector('#locBarWith') as HTMLElement).style.width = `${withBarPercent}%`;
}

// --- Code Comparison ---

interface CodeSnippet {
    title: string;
    source?: string; // file path + lines, when quoting real repository code
    code: string;
}

// Verbatim from src/main.ts in this repository (line numbers as of this writing).
const withSolidusSnippets: CodeSnippet[] = [
    {
        title: 'Configuring Solidus and registering plugins',
        source: 'apps/whiteboard-demo/src/main.ts:286-296',
        code: `solidusInstance = solidus({
    plugins: [webrtc(), merkleEGWalker({})],
    onStateOperation: (op) => {
        console.log('[Solidus] Local operation:', op.type, op.path);
    },
    onRemoteOperation: (_op, peerId) => {
        console.log('[Solidus] Remote operation from:', peerId);
        // Redraw canvas when remote state changes
        redraw();
    },
});`,
    },
    {
        title: 'Creating shared state and connecting to peers',
        source: 'apps/whiteboard-demo/src/main.ts:324-343',
        code: `docState = solidusInstance.createState(rawDocState, (op) => {
    console.log('[State] Update:', op.type, op.path);
    // Redraw canvas whenever state changes (local or remote)
    redraw();
});

network = solidusInstance.create({
    type: 'peer-network',
    config: {
        target: rawDocState,
        signalingServer,
        room: roomName,
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
        ],
    },
});`,
    },
    {
        title: 'Updating the shared drawing state',
        source: 'apps/whiteboard-demo/src/main.ts:216-220, 251-253',
        code: `// Commit the stroke to shared state
if (currentStroke.points.length >= 2) {
    docState.strokes.push(currentStroke);
    docState.version++;
}

// Clear all strokes by setting length to 0 (triggers ARRAY_RESIZE)
docState.strokes.length = 0;
docState.version++;`,
    },
    {
        title: 'Catching up a newly joined peer',
        source: 'apps/whiteboard-demo/src/main.ts:349-360',
        code: `network!.onPeerJoin((peerId) => {
    console.log('[Network] Peer joined:', peerId);
    connectionStatus.textContent = \`Connected to "\${roomName}" (\${network!.peers.length} peers)\`;

    // Request current state from the new peer
    const stateRequest = JSON.stringify({
        kind: 'state-request',
        from: network!.localPeerId,
    });
    network!.send(peerId, stateRequest);
    console.log('[Network] Requested state from peer:', peerId);
});`,
    },
];

// Illustrative only — this implementation does not exist anywhere in this
// repository. It sketches the equivalent responsibilities (exchanging
// updates, ordering/merging them, connection lifecycle) that the snippets
// above get from Solidus, at roughly the same scope as this demo actually
// needs (push a stroke, clear the board) — not a general-purpose CRDT.
const withoutSolidusSnippets: CodeSnippet[] = [
    {
        title: 'Broadcasting a local change',
        code: `let localSeq = 0;

function broadcastStrokeAdded(stroke: Stroke) {
    const message = JSON.stringify({
        kind: 'stroke-added',
        peerId: localPeerId,
        seq: ++localSeq,
        stroke,
    });
    for (const channel of openDataChannels.values()) {
        if (channel.readyState === 'open') channel.send(message);
    }
}

function broadcastCleared() {
    const message = JSON.stringify({
        kind: 'cleared',
        peerId: localPeerId,
        seq: ++localSeq,
    });
    for (const channel of openDataChannels.values()) {
        if (channel.readyState === 'open') channel.send(message);
    }
}`,
    },
    {
        title: 'Receiving and ordering remote changes',
        code: `const pendingByPeer = new Map<string, Map<number, any>>();
const nextExpectedSeq = new Map<string, number>();

function onDataChannelMessage(fromPeerId: string, raw: string) {
    const msg = JSON.parse(raw);
    const pending = pendingByPeer.get(fromPeerId) ?? new Map();
    pendingByPeer.set(fromPeerId, pending);
    pending.set(msg.seq, msg);

    let expected = nextExpectedSeq.get(fromPeerId) ?? 1;
    while (pending.has(expected)) {
        applyRemoteMessage(pending.get(expected));
        pending.delete(expected);
        expected++;
    }
    nextExpectedSeq.set(fromPeerId, expected);
}

function applyRemoteMessage(msg: any) {
    if (msg.kind === 'stroke-added') {
        docState.strokes.push(msg.stroke);
    } else if (msg.kind === 'cleared') {
        // Naive: drops any locally-queued-but-unsent stroke too. A real
        // CRDT (what merkleEGWalker provides) resolves this with a
        // Merkle DAG + Lamport clocks instead of last-writer-wins here.
        docState.strokes = [];
    }
    redraw();
}`,
    },
    {
        title: 'Connection lifecycle',
        code: `signalingSocket.onclose = () => {
    connectionStatus.textContent = 'Signaling disconnected, retrying…';
    setTimeout(connectToSignalingServer, retryDelayMs);
};

function setupPeerConnection(peerId: string) {
    const pc = new RTCPeerConnection({ iceServers });
    const channel = pc.createDataChannel('whiteboard');

    channel.onopen = () => openDataChannels.set(peerId, channel);
    channel.onclose = () => openDataChannels.delete(peerId);
    channel.onerror = (err) => console.error('[P2P] Data channel error:', err);
    channel.onmessage = (e) => onDataChannelMessage(peerId, e.data);

    pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(peerId, { type: 'ice-candidate', candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            openDataChannels.delete(peerId);
            peerConnections.delete(peerId);
        }
    };
    // ...create/send an SDP offer, handle the answer, apply ICE candidates
    // from the signaling server, matching the real offer/answer/ICE
    // exchange this demo's webrtc() plugin already does.
    return pc;
}`,
    },
];

function renderCodeSnippets(containerId: string, snippets: CodeSnippet[]) {
    const container = document.querySelector(`#${containerId}`)!;
    for (const snippet of snippets) {
        const block = document.createElement('div');
        block.className = 'code-snippet';

        const title = document.createElement('h5');
        title.textContent = snippet.title;

        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = snippet.code;
        pre.appendChild(codeEl);

        block.append(title);
        if (snippet.source) {
            const meta = document.createElement('div');
            meta.className = 'code-snippet-meta';
            meta.textContent = snippet.source;
            block.append(meta);
        }
        block.append(pre);
        container.appendChild(block);
    }
}

function renderCodeComparison() {
    renderCodeSnippets('codePanelWith', withSolidusSnippets);
    renderCodeSnippets('codePanelWithout', withoutSolidusSnippets);

    const tabWith = document.querySelector<HTMLButtonElement>('#tabWith')!;
    const tabWithout = document.querySelector<HTMLButtonElement>('#tabWithout')!;
    const panelWith = document.querySelector<HTMLDivElement>('#codePanelWith')!;
    const panelWithout = document.querySelector<HTMLDivElement>('#codePanelWithout')!;

    function activate(tab: HTMLButtonElement, panel: HTMLDivElement) {
        for (const t of [tabWith, tabWithout]) t.classList.remove('active');
        for (const p of [panelWith, panelWithout]) p.classList.remove('active');
        tab.classList.add('active');
        panel.classList.add('active');
    }

    tabWith.addEventListener('click', () => activate(tabWith, panelWith));
    tabWithout.addEventListener('click', () => activate(tabWithout, panelWithout));
}

// --- Init ---

resizeCanvas();
redraw();
renderLocComparison();
renderCodeComparison();
