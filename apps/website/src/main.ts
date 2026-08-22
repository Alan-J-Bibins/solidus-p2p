import { solidus, createNetworkingPlugin } from './../../../packages/core/src';

// ';
import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="font-family: sans-serif; max-width: 480px; margin: 40px auto;">
    <h2>Solidus P2P State Sync Test</h2>
    <label>Signaling server (host:port)</label>
    <input id="server" type="text" value="192.168.1.42:8080" style="width: 100%; margin-bottom: 8px;" />
    <label>Room ID (must match on both computers)</label>
    <input id="room" type="text" value="test-room" style="width: 100%; margin-bottom: 8px;" />
    <div style="margin-bottom: 8px;">
      <button id="offerBtn">Connect as Offerer</button>
      <button id="answerBtn">Connect as Answerer</button>
    </div>
    <div id="status" style="color: gray; margin-bottom: 8px;">Not connected</div>
    <div style="margin-bottom: 8px;">
      <button id="incrementBtn" disabled>count++</button>
      <span id="countDisplay">count: 0</span>
    </div>
    <pre id="log" style="background: #111; color: #0f0; padding: 8px; height: 200px; overflow-y: auto;"></pre>
  </div>
`;

const serverInput = document.querySelector<HTMLInputElement>('#server')!;
const roomInput = document.querySelector<HTMLInputElement>('#room')!;
const offerBtn = document.querySelector<HTMLButtonElement>('#offerBtn')!;
const answerBtn = document.querySelector<HTMLButtonElement>('#answerBtn')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const incrementBtn = document.querySelector<HTMLButtonElement>('#incrementBtn')!;
const countDisplay = document.querySelector<HTMLSpanElement>('#countDisplay')!;
const logEl = document.querySelector<HTMLPreElement>('#log')!;

function log(line: string): void {
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

const rawState = { count: 0 };
const instance = solidus({ plugins: [createNetworkingPlugin()] });

const state = instance.createState(rawState, (op) => {
    log(`local op: ${JSON.stringify(op)}`);
    countDisplay.textContent = `count: ${rawState.count}`;
});

instance.config; // just to show it's accessible; remove if unused

async function connect(role: 'offerer' | 'answerer'): Promise<void> {
    offerBtn.disabled = true;
    answerBtn.disabled = true;
    statusEl.textContent = 'Connecting...';

    const network = instance.create({
        type: 'peer-network',
        config: {
            signalingServer: serverInput.value.trim(),
            room: roomInput.value.trim(),
            role,
            target: rawState,
        },
    });

    network.onMessage(() => {
        // Networking plugin already applies remote ops internally; this is just
        // to refresh the UI whenever *any* message arrives from the peer.
        countDisplay.textContent = `count: ${rawState.count}`;
        log(`remote update received, count is now ${rawState.count}`);
    });

    await network.waitUntilOpen();
    statusEl.textContent = 'Connected! State will now sync automatically.';
    incrementBtn.disabled = false;
}

offerBtn.addEventListener('click', () => connect('offerer'));
answerBtn.addEventListener('click', () => connect('answerer'));

incrementBtn.addEventListener('click', () => {
    state.count++; // <-- this is the only line that matters: mutate the proxy,
    //     everything else (broadcast, remote apply) is automatic
});
