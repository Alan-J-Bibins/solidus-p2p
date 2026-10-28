import { solidus, webrtc, type NetworkHandle } from '@solidus-p2p/core';
import { merkleEGWalker } from '@solidus-p2p/core/state-sync/integrations';

import coreIndex from '../../../packages/core/src/index.ts?raw';
import coreCreateNetworkingPlugin from '../../../packages/core/src/networking/create-networking-plugin.ts?raw';
import coreSignalingClient from '../../../packages/core/src/networking/signaling-client.ts?raw';
import coreNetworkingTypes from '../../../packages/core/src/networking/types.ts?raw';
import coreWebrtcIndex from '../../../packages/core/src/networking/webrtc/index.ts?raw';
import coreWebrtcPeer from '../../../packages/core/src/networking/webrtc/peer.ts?raw';
import coreWebrtcSendQueue from '../../../packages/core/src/networking/webrtc/send-queue.ts?raw';
import coreWebrtcTransport from '../../../packages/core/src/networking/webrtc/transport.ts?raw';
import coreWebrtcTypes from '../../../packages/core/src/networking/webrtc/types.ts?raw';
import coreApplyOperation from '../../../packages/core/src/state-sync/apply-operation.ts?raw';
import coreArray from '../../../packages/core/src/state-sync/datatypes/array.ts?raw';
import coreStateSyncIndex from '../../../packages/core/src/state-sync/index.ts?raw';
import coreDagSyncer from '../../../packages/core/src/state-sync/integrations/merkle-eg-walker/dag-syncer.ts?raw';
import coreEgWalker from '../../../packages/core/src/state-sync/integrations/merkle-eg-walker/eg-walker.ts?raw';
import coreEventGraph from '../../../packages/core/src/state-sync/integrations/merkle-eg-walker/event-graph.ts?raw';
import coreHandlers from '../../../packages/core/src/state-sync/integrations/merkle-eg-walker/handlers.ts?raw';
import coreMerkleIndex from '../../../packages/core/src/state-sync/integrations/merkle-eg-walker/index.ts?raw';
import coreMerkleTypes from '../../../packages/core/src/state-sync/integrations/merkle-eg-walker/types.ts?raw';
import coreMerkleUtils from '../../../packages/core/src/state-sync/integrations/merkle-eg-walker/utils.ts?raw';
import coreStateSyncTypes from '../../../packages/core/src/state-sync/types.ts?raw';
import coreTypes from '../../../packages/core/src/types.ts?raw';
import ownHtml from '../index.html?raw';
import locStats from './loc-stats.json';
import ownSource from './main.ts?raw';

import ownStyle from './style.css?raw';
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

                    // Whichever side has the newer version wins outright. A
                    // union-by-stroke-id merge can never represent a Clear
                    // (it only ever adds strokes, so a peer catching up after
                    // someone cleared would resurrect the old strokes and
                    // push them back out to everyone). version always
                    // increases on both push and clear, so comparing it
                    // picks the side whose stroke set (including an emptied
                    // one) is actually current.
                    if (message.state.version > docState.version) {
                        isApplyingRemoteState = true;
                        docState.strokes.length = 0;
                        for (const stroke of message.state.strokes) {
                            docState.strokes.push(stroke);
                        }
                        docState.version = message.state.version;
                        isApplyingRemoteState = false;
                        redraw();
                    }

                    console.log('[Network] Synced state, total strokes:', docState.strokes.length);
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
    source?: string; // file path, when quoting real repository code
    code: string;
}

// The app's own files — identical either way, since Solidus only replaces
// the networking + CRDT/state-sync layer, not the UI/canvas/connection code.
const appFileSnippets: CodeSnippet[] = [
    { title: 'src/main.ts', source: 'apps/whiteboard-demo/src/main.ts', code: ownSource.trimEnd() },
    {
        title: 'src/style.css',
        source: 'apps/whiteboard-demo/src/style.css',
        code: ownStyle.trimEnd(),
    },
    { title: 'index.html', source: 'apps/whiteboard-demo/index.html', code: ownHtml.trimEnd() },
];

// "With Solidus" is just this app's own files — the networking/CRDT layer
// comes from the solidus package, not from code in this app.
const withSolidusSnippets: CodeSnippet[] = appFileSnippets;

// "Without Solidus" is the same app files, PLUS every real packages/core
// file that implements the networking + CRDT/state-sync behavior this app
// gets from Solidus instead (the exact files loc-stats.json traces to
// produce the 3341 total) — the full, real source, not an illustrative
// sketch, so every line counted in the headline number is shown here.
const coreFileSnippets: CodeSnippet[] = [
    { title: 'index.ts', source: 'packages/core/src/index.ts', code: coreIndex.trimEnd() },
    { title: 'types.ts', source: 'packages/core/src/types.ts', code: coreTypes.trimEnd() },
    {
        title: 'networking/create-networking-plugin.ts',
        source: 'packages/core/src/networking/create-networking-plugin.ts',
        code: coreCreateNetworkingPlugin.trimEnd(),
    },
    {
        title: 'networking/signaling-client.ts',
        source: 'packages/core/src/networking/signaling-client.ts',
        code: coreSignalingClient.trimEnd(),
    },
    {
        title: 'networking/types.ts',
        source: 'packages/core/src/networking/types.ts',
        code: coreNetworkingTypes.trimEnd(),
    },
    {
        title: 'networking/webrtc/index.ts',
        source: 'packages/core/src/networking/webrtc/index.ts',
        code: coreWebrtcIndex.trimEnd(),
    },
    {
        title: 'networking/webrtc/peer.ts',
        source: 'packages/core/src/networking/webrtc/peer.ts',
        code: coreWebrtcPeer.trimEnd(),
    },
    {
        title: 'networking/webrtc/send-queue.ts',
        source: 'packages/core/src/networking/webrtc/send-queue.ts',
        code: coreWebrtcSendQueue.trimEnd(),
    },
    {
        title: 'networking/webrtc/transport.ts',
        source: 'packages/core/src/networking/webrtc/transport.ts',
        code: coreWebrtcTransport.trimEnd(),
    },
    {
        title: 'networking/webrtc/types.ts',
        source: 'packages/core/src/networking/webrtc/types.ts',
        code: coreWebrtcTypes.trimEnd(),
    },
    {
        title: 'state-sync/index.ts',
        source: 'packages/core/src/state-sync/index.ts',
        code: coreStateSyncIndex.trimEnd(),
    },
    {
        title: 'state-sync/apply-operation.ts',
        source: 'packages/core/src/state-sync/apply-operation.ts',
        code: coreApplyOperation.trimEnd(),
    },
    {
        title: 'state-sync/datatypes/array.ts',
        source: 'packages/core/src/state-sync/datatypes/array.ts',
        code: coreArray.trimEnd(),
    },
    {
        title: 'state-sync/types.ts',
        source: 'packages/core/src/state-sync/types.ts',
        code: coreStateSyncTypes.trimEnd(),
    },
    {
        title: 'state-sync/integrations/merkle-eg-walker/dag-syncer.ts',
        source: 'packages/core/src/state-sync/integrations/merkle-eg-walker/dag-syncer.ts',
        code: coreDagSyncer.trimEnd(),
    },
    {
        title: 'state-sync/integrations/merkle-eg-walker/eg-walker.ts',
        source: 'packages/core/src/state-sync/integrations/merkle-eg-walker/eg-walker.ts',
        code: coreEgWalker.trimEnd(),
    },
    {
        title: 'state-sync/integrations/merkle-eg-walker/event-graph.ts',
        source: 'packages/core/src/state-sync/integrations/merkle-eg-walker/event-graph.ts',
        code: coreEventGraph.trimEnd(),
    },
    {
        title: 'state-sync/integrations/merkle-eg-walker/handlers.ts',
        source: 'packages/core/src/state-sync/integrations/merkle-eg-walker/handlers.ts',
        code: coreHandlers.trimEnd(),
    },
    {
        title: 'state-sync/integrations/merkle-eg-walker/index.ts',
        source: 'packages/core/src/state-sync/integrations/merkle-eg-walker/index.ts',
        code: coreMerkleIndex.trimEnd(),
    },
    {
        title: 'state-sync/integrations/merkle-eg-walker/types.ts',
        source: 'packages/core/src/state-sync/integrations/merkle-eg-walker/types.ts',
        code: coreMerkleTypes.trimEnd(),
    },
    {
        title: 'state-sync/integrations/merkle-eg-walker/utils.ts',
        source: 'packages/core/src/state-sync/integrations/merkle-eg-walker/utils.ts',
        code: coreMerkleUtils.trimEnd(),
    },
];

const appFilesTotalLines = appFileSnippets.reduce((sum, s) => sum + s.code.split('\n').length, 0);

// Don't re-render the identical app files a second time — same bytes as the
// "With Solidus" column, so showing them again just duplicates code on
// screen. One line explains where they went instead.
const withoutSolidusSnippets: CodeSnippet[] = [
    {
        title: 'App files (identical, shown in the "With Solidus" column)',
        source: 'src/main.ts, src/style.css, index.html',
        code: `// Same ${appFilesTotalLines} lines as the "With Solidus" column — the UI/canvas/\n// connection-control code doesn't change either way. Scroll left to see them.\n// Everything below is the extra code this app would need to hand-write\n// to replace what Solidus (webrtc() + merkleEGWalker()) provides.`,
    },
    ...coreFileSnippets,
];

function renderCodeSnippets(containerId: string, snippets: CodeSnippet[]) {
    const container = document.querySelector(`#${containerId}`)!;
    for (const snippet of snippets) {
        const block = document.createElement('div');
        block.className = 'code-snippet';

        const head = document.createElement('div');
        head.className = 'code-snippet-head';

        const title = document.createElement('h5');
        title.textContent = snippet.title;

        const badge = document.createElement('span');
        badge.className = 'code-snippet-badge';
        badge.textContent = `${snippet.code.split('\n').length} lines`;

        head.append(title, badge);

        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = snippet.code;
        pre.appendChild(codeEl);

        block.append(head);
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
