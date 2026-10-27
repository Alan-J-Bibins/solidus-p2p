import { solidus, webrtc, type NetworkHandle } from '@solidus-p2p/core';
import { merkleEGWalker } from '@solidus-p2p/core/state-sync/integrations';

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

// --- Init ---

resizeCanvas();
redraw();
