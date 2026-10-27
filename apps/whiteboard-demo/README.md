# Collaborative Whiteboard Demo

A simple collaborative whiteboard showcasing Solidus P2P's state synchronization capabilities.

## What It Demonstrates

This demo showcases how Solidus handles **real-time collaborative drawing** with automatic conflict resolution using the **Merkle-EG-Walker** algorithm:

- **Multiple users draw simultaneously** - Each stroke is synchronized across all peers
- **Automatic state sync** - No manual WebSocket message handling needed
- **Conflict-free merging** - The Merkle-EG-Walker algorithm ensures all strokes are preserved even when users draw concurrently
- **Minimal code** - The entire P2P logic fits in ~50 lines (see `src/main.ts`)
- **DAG-based synchronization** - Operations are tracked in a Merkle DAG with cryptographic verification

## How It Works

The whiteboard maintains a shared state object:

```typescript
interface WhiteboardState {
    strokes: Stroke[];
    version: number;
}
```

When you draw:

1. Each completed stroke is pushed to the `strokes` array
2. Solidus captures this as an `ARRAY_INSERT` operation
3. The **Merkle-EG-Walker** plugin processes the operation:
    - Creates a new node in the Merkle DAG with the operation
    - Computes a cryptographic hash (CID) of the node
    - Broadcasts the node to all peers via `state:broadcast`
4. The networking plugin sends the node data to peers
5. Remote peers receive the node and merge it into their DAG
6. The EgWalker algorithm reconciles concurrent operations
7. The canvas redraws to show the new stroke

### State Sync Architecture

The demo uses the **Merkle-EG-Walker** plugin for state synchronization:

```typescript
solidusInstance = solidus({
    plugins: [webrtc(), merkleEGWalker({})],
    onRemoteOperation: (_op, peerId) => {
        redraw();
    },
});
```

The flow:

1. **Local operation** → `state:operation` event
2. **Merkle-EG-Walker** processes it → emits `state:broadcast` with DAG node
3. **Networking plugin** sends it → `state-sync` message to peers
4. **Remote peer receives** → emits `state:remote-operation`
5. **Merkle-EG-Walker merges** → applies to local state
6. **`onRemoteOperation` callback** fires → redraw canvas

This ensures all operations are tracked in a cryptographically-verified DAG, enabling proper conflict resolution for concurrent edits.

## Running the Demo

**Note**: There's currently a known issue with the `fastcdc` native module that affects dependency optimization. This is a repo-wide issue being actively resolved. Once fixed, the demo will work as described below.

1. **Start the signaling server** (in a separate terminal):

    ```bash
    cd apps/signaling-server
    npm run dev
    ```

2. **Start this demo** (in another terminal):

    ```bash
    cd apps/whiteboard-demo
    npm run dev
    ```

3. **Open in multiple browsers**:
    - Open `http://localhost:5173` in two or more browser windows
    - Click "Connect" in each window
    - Start drawing - strokes appear in real-time across all windows!

## Key Features to Show

### 1. Real-Time Collaboration

Draw in one window and watch it appear instantly in others.

### 2. Simultaneous Drawing

Have multiple users draw at the same time - all strokes are preserved without conflicts.

### 3. Clear Synchronization

Click "Clear" in one window - the canvas clears for everyone.

### 4. Peer Discovery

Watch the peer count update as users join/leave the room.

## Code Highlights

The P2P setup is remarkably simple:

```typescript
// Create Solidus instance with WebRTC plugin
solidusInstance = solidus({
    plugins: [webrtc()],
    onRemoteOperation: (_op, peerId) => {
        // Redraw when remote state changes
        redraw();
    },
});

// Create shared state
rawDocState = { strokes: [], version: 0 };
docState = solidusInstance.createState(rawDocState);

// Connect to peers
network = solidusInstance.create({
    type: 'peer-network',
    config: {
        target: rawDocState,
        signalingServer,
        room: roomName,
    },
});
```

That's it! No manual message serialization, no conflict resolution logic, no connection management.

## Comparison: Solidus vs Raw WebRTC

**With Solidus**:

- Define state shape
- Mutate state normally
- Solidus handles the rest

**Without Solidus**, you'd need to hand-roll:

- Manual WebRTC connection setup
- Signaling server protocol
- Message serialization/deserialization
- Operation conflict resolution
- State reconciliation logic
- Peer discovery and management

For actual measured LOC figures (not a rough estimate) and the methodology behind them, see
[LOC Comparison Methodology](#loc-comparison-methodology) below, and the live comparison at the
bottom of the running demo page.

## Technical Details

- **State Sync**: Merkle-EG-Walker algorithm for CRDT-based synchronization with DAG tracking
- **Transport**: WebRTC data channels with priority scheduling (state vs chunk lanes)
- **Operations**: Array insert/delete operations for stroke management
- **Rendering**: HTML5 Canvas with immediate mode drawing
- **Conflict Resolution**: EgWalker's prepare/effect version tracking handles concurrent edits

## LOC Comparison Methodology

The "Implementation Comparison" panel at the bottom of the running demo shows measured lines of
code, not guesses. The source of truth is `scripts/count-loc.mjs`; it writes `src/loc-stats.json`,
which `src/main.ts` imports to render the panel. **Recalculate after any code change** with:

```bash
npm run loc
```

**Unit**: non-blank, non-comment source lines (block and line comments stripped for `.ts`/`.css`;
`index.html` has none to strip).

**With Solidus** — this demo's own application source, counted directly:

- `src/main.ts`, `src/style.css`, `index.html`

**Without Solidus** — the same application files (assumed unchanged: canvas drawing, toolbar,
connection controls, and DOM wiring don't depend on Solidus) **plus** a measured count of the
`packages/core` source files that implement the networking and CRDT/state-sync behavior this app
currently gets from Solidus, traced directly from `main.ts`'s imports:

| Responsibility                        | Solidus API used               | Files counted                                                                                                                          |
| ------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Event bus, plugin wiring, state proxy | `solidus()`, `createState()`   | `index.ts`, `types.ts`, `state-sync/index.ts`, `state-sync/apply-operation.ts`, `state-sync/datatypes/array.ts`, `state-sync/types.ts` |
| Signaling + WebRTC mesh transport     | `webrtc()`, `network.create()` | `networking/create-networking-plugin.ts`, `networking/signaling-client.ts`, `networking/types.ts`, `networking/webrtc/*.ts`            |
| CRDT merge (Merkle DAG, LCA, OT)      | `merkleEGWalker()`             | `state-sync/integrations/merkle-eg-walker/*.ts`                                                                                        |

**Deliberately excluded** from that closure, because this demo doesn't exercise them: the asset
store / reference tracker (no images), `features/fastcdc` and `features/swarm-chunking` (no asset
chunking), `state-sync/integrations/yjs.ts` (an alternate CRDT this demo doesn't use), and
`networking/server.ts` (this demo's signaling server, `apps/signaling-server`, is a plain `ws`
relay with no Solidus dependency — common infrastructure, counted on neither side).

**What's measured vs. estimated**: both sides of the comparison are measured by counting real
source files — nothing here is a guess. The caveat is scope, not precision: the
`packages/core` closure is library-grade code that handles more generality than this one demo
strictly needs (e.g. `datatypes/array.ts` implements every `Array.prototype` mutator; this demo
only exercises `push` and `length = 0`). A hand-minimized, single-purpose rewrite could come in
smaller than this measured figure — or larger, if written less carefully (the whole point of
Solidus's CRDT layer is to avoid exactly the kind of correctness bugs a quick hand-rolled merge
tends to hit). We don't fabricate a "trimmed" estimate for that hypothetical rewrite; the
comparison reports the measured size of the equivalent functionality as it actually exists in this
codebase today, and discloses this caveat instead of hiding it.

**Formulas**: `lines saved = LOC without Solidus − LOC with Solidus`;
`% reduction = (lines saved / LOC without Solidus) × 100`. Full line-by-line figures and the
methodology text are in `src/loc-stats.json`.
