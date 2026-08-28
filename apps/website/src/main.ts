import { solidus, createWebRTCNetworkingPlugin } from './../../../packages/core/src';

import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="font-family: sans-serif; max-width: 480px; margin: 40px auto;">
    <h2>Solidus P2P State Sync Test</h2>
    <label>Signaling server (host:port)</label>
    <input id="server" type="text" value="192.168.1.42:8080" style="width: 100%; margin-bottom: 8px;" />
    <label>Room ID (any peer using this ID joins the same mesh)</label>
    <input id="room" type="text" value="test-room" style="width: 100%; margin-bottom: 8px;" />
    <button id="joinBtn">Join Room</button>
    <div id="status" style="color: gray; margin: 8px 0;">Not connected</div>
    <div id="peerList" style="color: gray; margin-bottom: 8px;"></div>
    <div style="margin-bottom: 8px;">
      <button id="incrementBtn" disabled>count++</button>
      <span id="countDisplay">count: 0</span>
    </div>
    <pre id="log" style="background: #111; color: #0f0; padding: 8px; height: 200px; overflow-y: auto;"></pre>
  </div>
`;

const serverInput = document.querySelector<HTMLInputElement>('#server')!;
const roomInput = document.querySelector<HTMLInputElement>('#room')!;
const joinBtn = document.querySelector<HTMLButtonElement>('#joinBtn')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const peerListEl = document.querySelector<HTMLDivElement>('#peerList')!;
const incrementBtn = document.querySelector<HTMLButtonElement>('#incrementBtn')!;
const countDisplay = document.querySelector<HTMLSpanElement>('#countDisplay')!;
const logEl = document.querySelector<HTMLPreElement>('#log')!;

function log(line: string): void {
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

const rawState = { count: 0 };
const instance = solidus({ plugins: [createWebRTCNetworkingPlugin()] });

const state = instance.createState(rawState, (op) => {
    countDisplay.textContent = `count: ${rawState.count}`;
    log(`local op: ${JSON.stringify(op)}`);
});

joinBtn.addEventListener('click', async () => {
    joinBtn.disabled = true;
    statusEl.textContent = 'Connecting to signaling server...';

    const network = instance.create({
        type: 'peer-network',
        config: {
            signalingServer: serverInput.value.trim(),
            room: roomInput.value.trim(),
            target: rawState,
        },
    });

    network.onPeerJoin((peerId: string) => {
        log(`peer connected: ${peerId}`);
        peerListEl.textContent = `Connected peers: ${network.peers.length}`;
    });

    network.onPeerLeave((peerId: string) => {
        log(`peer disconnected: ${peerId}`);
        peerListEl.textContent = `Connected peers: ${network.peers.length}`;
    });

    network.onMessage(() => {
        countDisplay.textContent = `count: ${rawState.count}`;
    });

    await network.waitUntilOpen();
    statusEl.textContent = `Joined room. Your peer id: ${network.localPeerId}`;
    incrementBtn.disabled = false;
});

incrementBtn.addEventListener('click', () => {
    state.count++;
});
