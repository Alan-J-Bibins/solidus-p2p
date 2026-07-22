import { P2PPeer, type SignalingMessage } from '@solidus-p2p/core';

import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="font-family: sans-serif; max-width: 480px; margin: 40px auto;">
    <h2>P2P Test</h2>
    <label>Signaling server (host:port)</label>
    <input id="server" type="text" value="192.168.1.42:8080" style="width: 100%; margin-bottom: 8px;" />
    <label>Room ID (must match on both computers)</label>
    <input id="room" type="text" value="test-room" style="width: 100%; margin-bottom: 8px;" />
    <div style="margin-bottom: 8px;">
      <button id="offerBtn">Connect as Offerer</button>
      <button id="answerBtn">Connect as Answerer</button>
    </div>
    <div id="status" style="color: gray; margin-bottom: 8px;">Not connected</div>
    <input id="messageInput" type="text" placeholder="Type a message..." style="width: 70%;" disabled />
    <button id="sendBtn" disabled>Send</button>
    <pre id="log" style="background: #111; color: #0f0; padding: 8px; height: 200px; overflow-y: auto; margin-top: 12px;"></pre>
  </div>
`;

const serverInput = document.querySelector<HTMLInputElement>('#server')!;
const roomInput = document.querySelector<HTMLInputElement>('#room')!;
const offerBtn = document.querySelector<HTMLButtonElement>('#offerBtn')!;
const answerBtn = document.querySelector<HTMLButtonElement>('#answerBtn')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const messageInput = document.querySelector<HTMLInputElement>('#messageInput')!;
const sendBtn = document.querySelector<HTMLButtonElement>('#sendBtn')!;
const logEl = document.querySelector<HTMLPreElement>('#log')!;

function log(line: string): void {
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text: string): void {
    statusEl.textContent = text;
}

let peer: P2PPeer | null = null;

async function connect(isOfferer: boolean): Promise<void> {
    offerBtn.disabled = true;
    answerBtn.disabled = true;

    const server = serverInput.value.trim();
    const room = roomInput.value.trim();
    const ws = new WebSocket(`ws://${server}?room=${encodeURIComponent(room)}`);

    peer = new P2PPeer({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        onSignal: (message: SignalingMessage) => {
            ws.send(JSON.stringify(message));
        },
    });

    ws.addEventListener('open', async () => {
        setStatus('Connected to signaling server, negotiating...');
        log('Signaling connection open.');
        if (isOfferer) {
            await peer!.createOffer();
            log('Offer sent.');
        }
    });

    ws.addEventListener('message', (event) => {
        const message: SignalingMessage = JSON.parse(event.data);
        void peer!.handleSignal(message);
    });

    ws.addEventListener('error', () => {
        setStatus('WebSocket error — check server address');
        log('WebSocket error.');
    });

    peer.onMessage((data) => {
        log(`Peer: ${data}`);
    });

    await peer.waitUntilOpen();
    setStatus('P2P connection open! You can send messages directly now.');
    log('Data channel OPEN — connected directly to peer.');
    messageInput.disabled = false;
    sendBtn.disabled = false;
}

offerBtn.addEventListener('click', () => connect(true));
answerBtn.addEventListener('click', () => connect(false));

sendBtn.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (!text || !peer) return;
    peer.send(text);
    log(`You: ${text}`);
    messageInput.value = '';
});

messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendBtn.click();
});
