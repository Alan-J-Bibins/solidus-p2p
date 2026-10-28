import './style.css';
// Imported from the '/networking' subpath, NOT the package root. The root
// entry (`@solidus-p2p/core`) re-exports `fastCDCPlugin`, which does
// `await import('fastcdc')` — a dynamic import of a native Node addon
// (`fastcdc/index.node`). Bundlers (Vite/Rolldown here) still try to analyze
// that dynamic import when it's anywhere in the bundled graph, which is
// exactly the "Could not load ../../node_modules/fastcdc/index.node" browser
// build failure. `@solidus-p2p/core/networking` never touches that plugin,
// so importing only from it keeps this app's browser build clean without
// touching packages/core.
import {
    createWebRTCTransport,
    type NetworkTransport,
    type PeerId,
} from '@solidus-p2p/core/networking';

import solidusSource from '../review-2-source/with-solidus/src/main.ts?raw';
import rawSource from '../review-2-source/without-solidus/src/main.ts?raw';
import locData from './loc-data.json';

// A "chunk" on the wire is a plain array of primitives: [fileId, index, totalChunks, base64Bytes].
// This matches the real `Chunk = ChunkPrimitive[]` type used by network.broadcastChunk/onChunk
// in packages/core/src/networking/types.ts. Bytes are base64-encoded (not one array element per
// byte) — a raw-number array for a 64 KiB chunk inflates to ~250 KiB of JSON, which risks hitting
// the data channel's max message size and getting silently dropped by the transport's send().
type WireChunk = (string | number | boolean | null)[];

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

type ChunkInfo = { index: number; start: number; end: number; bytes: Uint8Array };

type ChunkState = 'queued' | 'sent';

type OutgoingTransfer = {
    fileId: string;
    name: string;
    size: number;
    mimeType: string;
    sha256: string;
    chunks: ChunkInfo[];
    chunkState: ChunkState[];
    bytesSent: number;
    ackedByPeer: Map<PeerId, Set<number>>;
    completedByPeer: Map<PeerId, { success: boolean; sha256: string }>;
    timedOutPeers: Set<PeerId>;
    interrupted: boolean;
};

type IncomingTransfer = {
    fileId: string;
    name: string;
    size: number;
    mimeType: string;
    totalChunks: number;
    sha256Expected: string;
    fromPeer: PeerId;
    receivedChunks: Map<number, Uint8Array>;
    bytesReceived: number;
    duplicates: number;
    invalid: number;
    status: 'receiving' | 'verifying' | 'verified' | 'failed' | 'interrupted';
    reconstructed: Uint8Array | null;
    sha256Actual: string | null;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MiB — keeps the JSON-encoded chunk wire format workable in-browser
const MAX_CHUNKS = 20_000;

let network: NetworkTransport | null = null;
let connectedPeers: PeerId[] = [];

let outgoing: OutgoingTransfer | null = null;
let incoming: IncomingTransfer | null = null;
let sending = false;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header class="hero">
      <div class="eyebrow"><span class="pulse"></span> SOLIDUS P2P · REVIEW 3</div>
      <h1>Less plumbing.<br><span>More peer-to-peer.</span></h1>
      <p class="hero-copy">A real two-browser file transfer over Solidus' WebRTC transport: content-defined chunking, live chunk-by-chunk delivery, SHA-256 verified reassembly, and a measured comparison against the raw WebRTC implementation.</p>
      <div class="hero-stats">
        <div><strong>Real WebRTC</strong><small>data channel, not simulated</small></div>
        <div><strong>${locData.reductionPct !== null ? Math.round(locData.reductionPct) + '%' : '—'}</strong><small>measured LOC reduction</small></div>
        <div><strong>SHA-256</strong><small>end-to-end integrity check</small></div>
      </div>
    </header>

    <section class="section-card session-card">
      <div class="section-heading">
        <div><div class="eyebrow muted">01 / PEER SESSION</div><h2>Connect two computers</h2><p>Both browsers must point at the same signaling server and room. On a LAN, use the host machine's IP instead of localhost (e.g. <code>ws://192.168.1.20:8080</code>). Start the server from the repo root with <code>npm run dev --workspace=signaling-server</code>.</p></div>
        <span class="status-pill" id="sessionStatus">Disconnected</span>
      </div>
      <div class="config-grid">
        <label class="field"><span>Signaling server</span><input id="signalingServer" type="text" value="ws://localhost:8080" /></label>
        <label class="field"><span>Room name</span><input id="roomName" type="text" value="review3-demo-room" /></label>
      </div>
      <div class="file-actions">
        <button class="primary-btn" id="connectBtn">Connect</button>
        <button class="secondary-btn" id="disconnectBtn" disabled>Disconnect</button>
      </div>
      <div class="peer-row">
        <div><strong id="localPeerId">—</strong><span>Local peer ID</span></div>
        <div><strong id="peerCount">0</strong><span>Connected peers</span></div>
      </div>
      <div id="peerList" class="peer-list empty-state">No peers connected yet.</div>
      <div class="disclaimer"><strong>Note:</strong> connecting is required before any file bytes can be sent — the transfer below uses this exact connection and <code>network.broadcastChunk</code> / <code>network.onChunk</code>, nothing is simulated.</div>
    </section>

    <section class="section-card chunk-card">
      <div class="section-heading">
        <div><div class="eyebrow muted">02 / FILE TRANSFER</div><h2>Send a real file to connected peers</h2><p>Pick any file. It is split with a browser-compatible rolling-hash content-defined chunker and the actual chunk bytes are sent over the open WebRTC data channel(s) via the low-priority chunk lane.</p></div>
        <span class="status-pill" id="chunkStatus">Choose a file</span>
      </div>
      <div class="file-actions">
        <label class="file-drop" for="fileInput"><span class="file-icon">↥</span><strong>Choose a file</strong><small>Up to ${formatBytes(MAX_FILE_SIZE)} · processed locally in this browser</small><input id="fileInput" type="file" /></label>
        <button class="primary-btn" id="sendBtn" disabled>Send to connected peers</button>
      </div>
      <div class="file-meta" id="fileMeta"><span>No file selected</span><span>Chunking: rolling hash (variable sizes)</span></div>
      <div class="progress-wrap"><div class="progress-label"><span id="progressLabel">Bytes sent</span><strong id="progressValue">0%</strong></div><div class="progress-track"><div id="progressBar" class="progress-bar"></div></div></div>
      <div id="chunkSummary" class="chunk-summary empty-state">Select a file to see its chunk map.</div>
      <div class="chunk-list-wrap"><div class="list-title"><h3>Chunk map (sender)</h3><span id="chunkCount">0 chunks</span></div><div id="chunkList" class="chunk-list"><div class="empty-state">Chunk blocks will appear here.</div></div></div>
      <div id="senderAckSummary" class="ack-summary hidden"></div>
      <div class="disclaimer"><strong>Chunking algorithm:</strong> a deterministic gear/rolling-hash content-defined chunker (16 KiB min / 64 KiB target / 256 KiB max), implemented locally in this app — not the native <code>fastcdc</code> npm package, which embeds a Node-only <code>.node</code> binary and cannot load in a browser. See the FastCDC note below.</div>
    </section>

    <section class="section-card receive-card">
      <div class="section-heading">
        <div><div class="eyebrow muted">03 / RECEIVER</div><h2>Reconstruction &amp; verification</h2><p>What this browser has received from a peer, reassembled in order, and independently hashed.</p></div>
        <span class="status-pill" id="receiveStatus">Waiting for a transfer</span>
      </div>
      <div class="file-meta" id="incomingMeta"><span>No incoming transfer</span></div>
      <div class="progress-wrap"><div class="progress-label"><span>Bytes received</span><strong id="receiveProgressValue">0%</strong></div><div class="progress-track"><div id="receiveProgressBar" class="progress-bar"></div></div></div>
      <div class="chunk-list-wrap"><div class="list-title"><h3>Chunk map (receiver)</h3><span id="receiveChunkCount">0 / 0 chunks</span></div><div id="receiveChunkList" class="chunk-list"><div class="empty-state">Nothing received yet.</div></div></div>
      <div id="receiveVerification" class="verification hidden"></div>
    </section>

    <section class="section-card compare-card">
      <div class="section-heading">
        <div><div class="eyebrow muted">04 / SOLIDUS VS. RAW WEBRTC — MEASURED</div><h2>Line-count comparison</h2></div>
      </div>
      <div class="loc-grid">
        <div class="loc-box solidus-box"><strong>${locData.withSolidus.code}</strong><span>lines of code · with Solidus</span><small>${locData.withSolidus.total} total · ${locData.withSolidus.blank} blank · ${locData.withSolidus.comment} comment</small></div>
        <div class="loc-box raw-box"><strong>${locData.withoutSolidus.code}</strong><span>lines of code · without Solidus</span><small>${locData.withoutSolidus.total} total · ${locData.withoutSolidus.blank} blank · ${locData.withoutSolidus.comment} comment</small></div>
        <div class="loc-box result-box"><strong>${locData.locSaved}</strong><span>lines saved</span><small>${locData.reductionPct !== null ? locData.reductionPct.toFixed(1) + '% reduction' : 'not comparable'}</small></div>
      </div>
      <div class="comparison-grid">
        <article class="code-panel solidus-panel">
          <div class="code-panel-head"><div><span class="language-dot solidus-dot"></span><strong>With Solidus</strong></div><span class="line-badge">full file · ${locData.withSolidus.total} lines</span></div>
          <pre><code id="solidusCode"></code></pre>
        </article>
        <article class="code-panel raw-panel">
          <div class="code-panel-head"><div><span class="language-dot raw-dot"></span><strong>Without Solidus</strong></div><span class="line-badge">full file · ${locData.withoutSolidus.total} lines</span></div>
          <pre><code id="rawCode"></code></pre>
        </article>
      </div>
    </section>

    <footer>Solidus P2P · Review 3 demo <span>File bytes are sent peer-to-peer only · never uploaded to a server</span></footer>
  </main>
`;

// --- DOM refs -------------------------------------------------------------

const signalingServerInput = document.querySelector<HTMLInputElement>('#signalingServer')!;
const roomNameInput = document.querySelector<HTMLInputElement>('#roomName')!;
const connectBtn = document.querySelector<HTMLButtonElement>('#connectBtn')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnectBtn')!;
const sessionStatus = document.querySelector<HTMLSpanElement>('#sessionStatus')!;
const localPeerIdEl = document.querySelector<HTMLElement>('#localPeerId')!;
const peerCountEl = document.querySelector<HTMLElement>('#peerCount')!;
const peerListEl = document.querySelector<HTMLDivElement>('#peerList')!;

const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const sendBtn = document.querySelector<HTMLButtonElement>('#sendBtn')!;
const chunkStatus = document.querySelector<HTMLSpanElement>('#chunkStatus')!;
const fileMeta = document.querySelector<HTMLDivElement>('#fileMeta')!;
const progressLabel = document.querySelector<HTMLSpanElement>('#progressLabel')!;
const progressValue = document.querySelector<HTMLElement>('#progressValue')!;
const progressBar = document.querySelector<HTMLDivElement>('#progressBar')!;
const chunkSummary = document.querySelector<HTMLDivElement>('#chunkSummary')!;
const chunkList = document.querySelector<HTMLDivElement>('#chunkList')!;
const chunkCount = document.querySelector<HTMLSpanElement>('#chunkCount')!;
const senderAckSummary = document.querySelector<HTMLDivElement>('#senderAckSummary')!;

const receiveStatus = document.querySelector<HTMLSpanElement>('#receiveStatus')!;
const incomingMeta = document.querySelector<HTMLDivElement>('#incomingMeta')!;
const receiveProgressValue = document.querySelector<HTMLElement>('#receiveProgressValue')!;
const receiveProgressBar = document.querySelector<HTMLDivElement>('#receiveProgressBar')!;
const receiveChunkList = document.querySelector<HTMLDivElement>('#receiveChunkList')!;
const receiveChunkCount = document.querySelector<HTMLSpanElement>('#receiveChunkCount')!;
const receiveVerification = document.querySelector<HTMLDivElement>('#receiveVerification')!;

document.querySelector<HTMLElement>('#solidusCode')!.textContent = solidusSource;
document.querySelector<HTMLElement>('#rawCode')!.textContent = rawSource;

// --- Session / networking --------------------------------------------------

connectBtn.addEventListener('click', async () => {
    const signalingServer = signalingServerInput.value.trim();
    const room = roomNameInput.value.trim();
    if (!signalingServer || !room) return;

    sessionStatus.className = 'status-pill working';
    sessionStatus.textContent = 'Connecting…';
    connectBtn.disabled = true;

    try {
        network = createWebRTCTransport({
            target: {},
            signalingServer,
            room,
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        wireNetworkHandlers(network);
        await network.connect();

        sessionStatus.className = 'status-pill good';
        sessionStatus.textContent = 'Connected';
        localPeerIdEl.textContent = network.localPeerId;
        disconnectBtn.disabled = false;
        renderPeers();
        updateSendAvailability();
    } catch (err) {
        sessionStatus.className = 'status-pill';
        sessionStatus.textContent = `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
        connectBtn.disabled = false;
        network = null;
    }
});

disconnectBtn.addEventListener('click', () => {
    if (outgoing) outgoing.interrupted = true;
    network?.close();
    network = null;
    connectedPeers = [];
    outgoing = null;
    incoming = null;
    sessionStatus.className = 'status-pill';
    sessionStatus.textContent = 'Disconnected';
    localPeerIdEl.textContent = '—';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    renderPeers();
    updateSendAvailability();
    renderIncoming();
    senderAckSummary.className = 'ack-summary hidden';
});

function wireNetworkHandlers(net: NetworkTransport): void {
    net.onPeerJoin((peerId) => {
        if (!connectedPeers.includes(peerId)) connectedPeers.push(peerId);
        renderPeers();
        updateSendAvailability();
    });

    net.onPeerLeave((peerId) => {
        connectedPeers = connectedPeers.filter((id) => id !== peerId);
        if (outgoing) {
            outgoing.ackedByPeer.delete(peerId);
            outgoing.completedByPeer.delete(peerId);
            renderSenderAckSummary();
        }
        if (incoming && incoming.fromPeer === peerId && incoming.status === 'receiving') {
            incoming.status = 'interrupted';
            receiveStatus.className = 'status-pill';
            receiveStatus.textContent = 'Interrupted — sender disconnected';
            renderIncoming();
        }
        renderPeers();
        updateSendAvailability();
    });

    net.onMessage((peerId, raw) => {
        let msg: any;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }
        if (!msg || typeof msg !== 'object') return;

        switch (msg.kind) {
            case 'file-start':
                handleFileStart(peerId, msg);
                break;
            case 'file-end':
                handleFileEnd(msg);
                break;
            case 'chunk-ack':
                handleChunkAck(peerId, msg);
                break;
            case 'file-complete':
                handleFileComplete(peerId, msg);
                break;
        }
    });

    net.onChunk((peerId, chunk) => handleIncomingChunk(peerId, chunk as WireChunk));
}

function renderPeers(): void {
    peerCountEl.textContent = String(connectedPeers.length);
    if (connectedPeers.length === 0) {
        peerListEl.className = 'peer-list empty-state';
        peerListEl.textContent = 'No peers connected yet.';
        return;
    }
    peerListEl.className = 'peer-list';
    peerListEl.innerHTML = connectedPeers
        .map((id) => `<span class="peer-chip">${escapeHtml(id)}</span>`)
        .join('');
}

function updateSendAvailability(): void {
    sendBtn.disabled = !network || connectedPeers.length === 0 || !outgoing || outgoing.interrupted;
}

// --- Browser-compatible content-defined chunking ---------------------------
// Deterministic gear/rolling-hash chunker. NOT the native `fastcdc` npm
// package — that package dynamically requires a compiled `.node` binary
// (see packages/core/src/features/fastcdc/index.ts: `await import('fastcdc')`)
// which cannot load in a browser bundle. This is a from-scratch, browser-safe
// algorithm with similar variable-size-chunk behaviour.
function contentDefinedBoundaries(bytes: Uint8Array): number[] {
    // Kept small (vs. the common 64 KiB/256 KiB CDC defaults) because the raw bytes are
    // base64-encoded for the wire: a chunk this size keeps the JSON-framed message safely
    // under the RTCDataChannel max-message-size negotiated by this app's peers.
    const minSize = 2 * 1024;
    const averageSize = 8 * 1024;
    const maxSize = 16 * 1024;
    const mask = averageSize - 1;

    const gear = new Uint32Array(256);
    let seed = 0x9e3779b9;
    for (let i = 0; i < gear.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        gear[i] = seed >>> 0;
    }

    const boundaries: number[] = [];
    let start = 0;
    while (start < bytes.length) {
        const hardEnd = Math.min(start + maxSize, bytes.length);
        const minEnd = Math.min(start + minSize, bytes.length);
        const idealEnd = Math.min(start + maxSize, bytes.length);
        let hash = 0;
        let end = minEnd;

        for (let i = start; i < idealEnd; i++) {
            hash = ((hash << 1) + gear[bytes[i]]) >>> 0;
            if (i + 1 >= minEnd && ((hash & mask) === 0 || i + 1 === hardEnd)) {
                end = i + 1;
                break;
            }
            end = i + 1;
        }

        if (end <= start) end = Math.min(start + maxSize, bytes.length);
        boundaries.push(start, end - start);
        start = end;
    }
    return boundaries;
}

function chunkBytes(bytes: Uint8Array): ChunkInfo[] {
    const boundaries = contentDefinedBoundaries(bytes);
    const chunks: ChunkInfo[] = [];
    for (let i = 0, index = 0; i < boundaries.length; i += 2, index++) {
        const start = boundaries[i];
        const end = start + boundaries[i + 1];
        chunks.push({ index, start, end, bytes: bytes.slice(start, end) });
    }
    return chunks;
}

// --- Sender ------------------------------------------------------------

fileInput.addEventListener('change', async () => {
    if (sending) return; // input is disabled while sending; ignore any stray event defensively
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
        chunkStatus.className = 'status-pill';
        chunkStatus.textContent = `File too large (max ${formatBytes(MAX_FILE_SIZE)})`;
        return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await prepareOutgoing(bytes, file.name, file.type || 'application/octet-stream');
});

async function prepareOutgoing(bytes: Uint8Array, name: string, mimeType: string): Promise<void> {
    chunkStatus.className = 'status-pill working';
    chunkStatus.textContent = 'Chunking…';
    senderAckSummary.className = 'ack-summary hidden';

    const chunks = chunkBytes(bytes);
    if (chunks.length > MAX_CHUNKS) {
        chunkStatus.className = 'status-pill';
        chunkStatus.textContent = `Too many chunks (${chunks.length} > ${MAX_CHUNKS})`;
        return;
    }

    const sha256Hash = await sha256(bytes);

    outgoing = {
        fileId: crypto.randomUUID(),
        name,
        size: bytes.length,
        mimeType,
        sha256: sha256Hash,
        chunks,
        chunkState: chunks.map(() => 'queued'),
        bytesSent: 0,
        ackedByPeer: new Map(),
        completedByPeer: new Map(),
        timedOutPeers: new Set(),
        interrupted: false,
    };

    fileMeta.innerHTML = `<span><strong>${escapeHtml(name)}</strong> · ${formatBytes(bytes.length)}</span><span>Chunking: rolling hash (variable sizes)</span>`;
    renderSenderChunks();
    chunkStatus.className = 'status-pill good';
    chunkStatus.textContent = `${chunks.length} chunks ready`;
    progressLabel.textContent = 'Bytes sent';
    progressValue.textContent = '0%';
    progressBar.style.width = '0%';
    updateSendAvailability();
}

sendBtn.addEventListener('click', () => {
    void sendOutgoing();
});

const ACK_TIMEOUT_MS = 15_000;

async function sendOutgoing(): Promise<void> {
    // `outgoing` is captured into a local `transfer` and used exclusively from here on.
    // Selecting a new file reassigns the module-level `outgoing` binding; without this
    // capture, a change mid-send would make this loop broadcast chunks of the OLD file
    // tagged with the NEW file's fileId/totalChunks (a real data-corrupting race found
    // while testing). The file input is also disabled for the duration as the primary
    // guard — this capture is defense in depth.
    if (!network || !outgoing || connectedPeers.length === 0 || sending) return;
    const transfer = outgoing;
    sending = true;
    fileInput.disabled = true;
    transfer.interrupted = false;
    sendBtn.disabled = true;
    chunkStatus.className = 'status-pill working';
    chunkStatus.textContent = 'Sending…';

    try {
        network.broadcastState(
            JSON.stringify({
                kind: 'file-start',
                fileId: transfer.fileId,
                name: transfer.name,
                size: transfer.size,
                mimeType: transfer.mimeType,
                totalChunks: transfer.chunks.length,
                sha256: transfer.sha256,
            }),
        );

        for (const chunk of transfer.chunks) {
            if (!network || transfer.interrupted) break;
            const wire: WireChunk = [
                transfer.fileId,
                chunk.index,
                transfer.chunks.length,
                bytesToBase64(chunk.bytes),
            ];
            network.broadcastChunk(wire);
            transfer.chunkState[chunk.index] = 'sent';
            transfer.bytesSent += chunk.bytes.length;
            renderSenderProgress();
            renderSenderChunks();
            // Yield to the event loop so the UI stays responsive and the priority
            // queue/backpressure in the transport gets a chance to drain.
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }

        if (network && !transfer.interrupted) {
            network.broadcastState(JSON.stringify({ kind: 'file-end', fileId: transfer.fileId }));
            chunkStatus.className = 'status-pill good';
            chunkStatus.textContent = 'All chunks sent — waiting for peer confirmation';

            // broadcastChunk/broadcastState are fire-and-forget: the transport gives no
            // delivery guarantee back to the caller. The chunk-ack / file-complete protocol
            // above is how this app detects real delivery; if a peer never answers, say so
            // instead of leaving "waiting for peer confirmation" up forever.
            const peersAtSendTime = [...connectedPeers];
            setTimeout(() => {
                if (outgoing !== transfer) return;
                let anyTimedOut = false;
                for (const peerId of peersAtSendTime) {
                    if (connectedPeers.includes(peerId) && !transfer.completedByPeer.has(peerId)) {
                        transfer.timedOutPeers.add(peerId);
                        anyTimedOut = true;
                    }
                }
                if (anyTimedOut) renderSenderAckSummary();
            }, ACK_TIMEOUT_MS);
        }
        renderSenderAckSummary();
    } finally {
        sending = false;
        fileInput.disabled = false;
        updateSendAvailability();
    }
}

function renderSenderProgress(): void {
    if (!outgoing) return;
    const pct = outgoing.size === 0 ? 100 : Math.round((outgoing.bytesSent / outgoing.size) * 100);
    progressValue.textContent = `${pct}%`;
    progressBar.style.width = `${pct}%`;
}

function renderSenderChunks(): void {
    if (!outgoing) return;
    const { chunks, chunkState } = outgoing;
    chunkCount.textContent = `${chunks.length} ${chunks.length === 1 ? 'chunk' : 'chunks'}`;
    const visible = chunks.slice(0, 200);
    const largest = Math.max(1, ...visible.map((c) => c.bytes.length));
    chunkList.innerHTML =
        visible
            .map((chunk) => {
                const state = chunkState[chunk.index];
                return `<div class="chunk-block ${state}" title="Chunk ${chunk.index + 1}: bytes ${chunk.start.toLocaleString()}–${chunk.end.toLocaleString()} · ${chunk.bytes.length.toLocaleString()} bytes · ${state}" style="--chunk-width:${Math.round(44 + (chunk.bytes.length / largest) * 76)}px"><span>${String(chunk.index + 1).padStart(2, '0')}</span></div>`;
            })
            .join('') +
        (chunks.length > visible.length
            ? `<div class="more-chunks">+ ${chunks.length - visible.length} more chunks</div>`
            : '');
    chunkSummary.className = 'chunk-summary';
    chunkSummary.innerHTML = `<div><strong>${chunks.length}</strong><span>chunks</span></div><div><strong>${formatBytes(outgoing.size)}</strong><span>original size</span></div><div><strong>${formatBytes(chunks.reduce((m, c) => Math.max(m, c.bytes.length), 0))}</strong><span>largest chunk</span></div><div><strong>${formatBytes(outgoing.bytesSent)}</strong><span>bytes sent</span></div>`;
}

function renderSenderAckSummary(): void {
    if (!outgoing || connectedPeers.length === 0) {
        senderAckSummary.className = 'ack-summary hidden';
        return;
    }
    senderAckSummary.className = 'ack-summary';
    senderAckSummary.innerHTML = connectedPeers
        .map((peerId) => {
            const completion = outgoing!.completedByPeer.get(peerId);
            const ackedCount = outgoing!.ackedByPeer.get(peerId)?.size ?? 0;
            const timedOut = outgoing!.timedOutPeers.has(peerId);
            let label: string;
            if (completion) {
                label = completion.success ? 'Verified by peer ✓' : 'Peer verification FAILED';
            } else if (timedOut) {
                label = `No confirmation (timed out) — ${ackedCount} / ${outgoing!.chunks.length} chunks acked`;
            } else {
                label = `${ackedCount} / ${outgoing!.chunks.length} chunks acked`;
            }
            return `<div class="ack-row ${completion ? (completion.success ? 'good' : 'bad') : timedOut ? 'bad' : ''}"><span>${escapeHtml(peerId)}</span><span>${label}</span></div>`;
        })
        .join('');
}

function handleChunkAck(peerId: PeerId, msg: { fileId?: unknown; index?: unknown }): void {
    if (!outgoing || msg.fileId !== outgoing.fileId || typeof msg.index !== 'number') return;
    let set = outgoing.ackedByPeer.get(peerId);
    if (!set) outgoing.ackedByPeer.set(peerId, (set = new Set()));
    set.add(msg.index);
    renderSenderAckSummary();
}

function handleFileComplete(
    peerId: PeerId,
    msg: { fileId?: unknown; success?: unknown; sha256?: unknown },
): void {
    if (!outgoing || msg.fileId !== outgoing.fileId) return;
    outgoing.completedByPeer.set(peerId, {
        success: msg.success === true,
        sha256: typeof msg.sha256 === 'string' ? msg.sha256 : '',
    });
    renderSenderAckSummary();
}

// --- Receiver ------------------------------------------------------------

function handleFileStart(peerId: PeerId, msg: Record<string, unknown>): void {
    // Fail safely rather than silently clobbering an in-progress transfer: this app
    // tracks one incoming transfer at a time, so a second file-start (from this peer
    // or another) while one is still receiving/verifying is rejected, not merged.
    if (incoming && (incoming.status === 'receiving' || incoming.status === 'verifying')) {
        console.warn(
            `[review-3-demo] Ignoring file-start for "${String(msg.name)}" from ${peerId} — ` +
                `already receiving "${incoming.name}" from ${incoming.fromPeer}`,
        );
        return;
    }

    const { fileId, name, size, mimeType, totalChunks, sha256 } = msg;
    if (
        typeof fileId !== 'string' ||
        typeof name !== 'string' ||
        typeof size !== 'number' ||
        typeof totalChunks !== 'number' ||
        typeof sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(sha256) ||
        size < 0 ||
        size > MAX_FILE_SIZE ||
        !Number.isInteger(totalChunks) ||
        totalChunks < 0 ||
        totalChunks > MAX_CHUNKS
    ) {
        receiveStatus.className = 'status-pill';
        receiveStatus.textContent = 'Rejected malformed transfer metadata';
        return;
    }

    incoming = {
        fileId,
        name: name.slice(0, 255),
        size,
        mimeType: typeof mimeType === 'string' ? mimeType : 'application/octet-stream',
        totalChunks,
        sha256Expected: sha256,
        fromPeer: peerId,
        receivedChunks: new Map(),
        bytesReceived: 0,
        duplicates: 0,
        invalid: 0,
        status: 'receiving',
        reconstructed: null,
        sha256Actual: null,
    };
    receiveStatus.className = 'status-pill working';
    receiveStatus.textContent = 'Receiving…';
    renderIncoming();
}

function handleIncomingChunk(peerId: PeerId, chunk: WireChunk): void {
    if (!incoming || incoming.fromPeer !== peerId) return;
    const [fileId, index, totalChunks, base64Data] = chunk;
    if (fileId !== incoming.fileId || typeof index !== 'number' || typeof totalChunks !== 'number')
        return;
    if (!Number.isInteger(index) || index < 0 || index >= incoming.totalChunks) {
        incoming.invalid++;
        return;
    }
    if (incoming.receivedChunks.has(index)) {
        incoming.duplicates++;
        return;
    }
    if (typeof base64Data !== 'string') {
        incoming.invalid++;
        return;
    }

    let bytes: Uint8Array;
    try {
        bytes = base64ToBytes(base64Data);
    } catch {
        incoming.invalid++;
        return;
    }
    incoming.receivedChunks.set(index, bytes);
    incoming.bytesReceived += bytes.length;

    network?.sendTo(peerId, JSON.stringify({ kind: 'chunk-ack', fileId, index }));
    renderIncoming();

    if (incoming.receivedChunks.size === incoming.totalChunks) {
        void finalizeIncoming();
    }
}

function handleFileEnd(msg: { fileId?: unknown }): void {
    if (!incoming || msg.fileId !== incoming.fileId) return;
    if (incoming.receivedChunks.size === incoming.totalChunks) {
        void finalizeIncoming();
    } else if (incoming.status === 'receiving') {
        receiveStatus.className = 'status-pill';
        receiveStatus.textContent = `Sender finished but ${incoming.totalChunks - incoming.receivedChunks.size} chunk(s) are missing`;
    }
}

async function finalizeIncoming(): Promise<void> {
    if (!incoming || incoming.status !== 'receiving') return;
    incoming.status = 'verifying';
    receiveStatus.className = 'status-pill working';
    receiveStatus.textContent = 'Reassembling & verifying…';
    renderIncoming();

    const total = new Uint8Array(incoming.size);
    let offset = 0;
    for (let i = 0; i < incoming.totalChunks; i++) {
        const bytes = incoming.receivedChunks.get(i)!;
        total.set(bytes, offset);
        offset += bytes.length;
    }

    const digest = await sha256(total);
    const success = digest === incoming.sha256Expected && offset === incoming.size;

    incoming.reconstructed = total;
    incoming.sha256Actual = digest;
    incoming.status = success ? 'verified' : 'failed';

    network?.sendTo(
        incoming.fromPeer,
        JSON.stringify({ kind: 'file-complete', fileId: incoming.fileId, success, sha256: digest }),
    );

    receiveStatus.className = success ? 'status-pill good' : 'status-pill';
    receiveStatus.textContent = success ? 'Verified ✓' : 'Verification failed';
    renderIncoming();
}

function renderIncoming(): void {
    if (!incoming) {
        incomingMeta.innerHTML = '<span>No incoming transfer</span>';
        receiveChunkList.innerHTML = '<div class="empty-state">Nothing received yet.</div>';
        receiveChunkCount.textContent = '0 / 0 chunks';
        receiveProgressValue.textContent = '0%';
        receiveProgressBar.style.width = '0%';
        receiveVerification.className = 'verification hidden';
        return;
    }

    incomingMeta.innerHTML = `<span><strong>${escapeHtml(incoming.name)}</strong> · ${formatBytes(incoming.size)}</span><span>From peer ${escapeHtml(incoming.fromPeer)}</span><span>${incoming.duplicates} duplicate(s) · ${incoming.invalid} invalid chunk(s) rejected</span>`;

    const pct =
        incoming.size === 0 ? 100 : Math.round((incoming.bytesReceived / incoming.size) * 100);
    receiveProgressValue.textContent = `${pct}%`;
    receiveProgressBar.style.width = `${pct}%`;
    receiveChunkCount.textContent = `${incoming.receivedChunks.size} / ${incoming.totalChunks} chunks`;

    const visibleCount = Math.min(incoming.totalChunks, 200);
    let blocks = '';
    for (let i = 0; i < visibleCount; i++) {
        const got = incoming.receivedChunks.has(i);
        blocks += `<div class="chunk-block receive ${got ? 'received' : 'missing'}" title="Chunk ${i + 1}: ${got ? 'received' : 'missing'}"><span>${String(i + 1).padStart(2, '0')}</span></div>`;
    }
    if (incoming.totalChunks > visibleCount) {
        blocks += `<div class="more-chunks">+ ${incoming.totalChunks - visibleCount} more chunks</div>`;
    }
    receiveChunkList.innerHTML = blocks || '<div class="empty-state">Nothing received yet.</div>';

    if (incoming.status === 'verified' || incoming.status === 'failed') {
        const success = incoming.status === 'verified';
        receiveVerification.className = `verification ${success ? 'success' : 'fail'}`;
        receiveVerification.innerHTML = success
            ? `<span class="verify-icon">✓</span><div><strong>Reassembly verified</strong><p>SHA-256 matches · ${formatBytes(incoming.reconstructed!.length)} reconstructed from ${incoming.totalChunks} chunks.</p><code>${incoming.sha256Actual}</code></div><button id="downloadIncoming" class="secondary-btn">Download file</button>`
            : `<span class="verify-icon">!</span><div><strong>Verification failed</strong><p>Expected <code>${incoming.sha256Expected}</code>, got <code>${incoming.sha256Actual}</code>.</p></div>`;
        document
            .querySelector<HTMLButtonElement>('#downloadIncoming')
            ?.addEventListener('click', downloadIncoming);
    } else if (incoming.status === 'interrupted') {
        receiveVerification.className = 'verification fail';
        receiveVerification.innerHTML = `<span class="verify-icon">!</span><div><strong>Transfer interrupted</strong><p>The sending peer disconnected before the transfer finished.</p></div>`;
    } else {
        receiveVerification.className = 'verification hidden';
    }
}

function downloadIncoming(): void {
    if (!incoming?.reconstructed) return;
    const safeName =
        incoming.name.replace(/[\\/]/g, '_').replace(/\.\./g, '_') || 'downloaded-file';
    const blob = new Blob([incoming.reconstructed.slice().buffer], { type: incoming.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    anchor.click();
    URL.revokeObjectURL(url);
}

// --- Shared helpers ----------------------------------------------------

async function sha256(bytes: Uint8Array): Promise<string> {
    const stableBytes = new Uint8Array(bytes.byteLength);
    stableBytes.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', stableBytes.buffer);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>"']/g,
        (character) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
    );
}

renderPeers();
renderIncoming();
