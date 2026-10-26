# Whiteboard Demo - State Sync Fix

## Problem

The whiteboard demo was not syncing strokes between browser tabs. Each tab had its own isolated state.

## Root Cause

The Merkle-EG-Walker plugin had two issues:

1. **State object replacement**: When merging remote operations, the EgWalker was replacing the entire state object instead of updating the properties of the existing state object that the Solidus proxy was wrapping.

2. **Missing registry access**: The plugin's `setup` function wasn't receiving the `rawStateRegistry` parameter, so it couldn't access the proxied state objects to update them.

3. **Incorrect event format**: The plugin was emitting `state:remote-applied` with just the state object, but the core expected `{ peerId, op }` format.

## Solution

### 1. Updated Plugin Setup Signature

Changed the `setup` function to accept `rawStateRegistry`:

```typescript
setup(events: SolidusEvents, rawStateRegistry: Map<string, any>)
```

### 2. Property-Level State Updates

When the EgWalker merges remote operations and produces a new state, the plugin now:

- Iterates through all properties in the new state
- Updates each property on the proxied state object (triggers proxy's `set` handler)
- Removes properties that no longer exist
- This ensures the Solidus proxy detects the changes and emits `state:operation` events

### 3. Correct Event Format

The plugin now emits `state:remote-applied` with the correct format:

```typescript
events.emit('state:remote-applied', {
    peerId: latestNode.peerId,
    op: latestNode.operation,
});
```

### 4. Whiteboard Demo Update

Added a redraw call in the state update callback:

```typescript
docState = solidusInstance.createState(rawDocState, (op) => {
    console.log('[State] Update:', op.type, op.path);
    redraw(); // Redraw canvas whenever state changes
});
```

## How It Works Now

1. **Local Drawing**:
    - User draws a stroke
    - Proxy detects the array push → emits `state:operation`
    - Merkle-EG-Walker processes it → creates DAG node
    - Networking plugin broadcasts the node to peers

2. **Remote Receiving**:
    - Networking plugin receives the node → emits `state:remote-operation`
    - Merkle-EG-Walker merges the node into the DAG
    - EgWalker computes the new state
    - Plugin copies properties from EgWalker's state to the proxied state
    - Proxy detects the changes → emits `state:operation`
    - Whiteboard's `onUpdate` callback fires → redraws canvas
    - Plugin emits `state:remote-applied` → triggers `onRemoteOperation` callback

## Testing

1. Start the signaling server:

    ```bash
    cd apps/signaling-server
    npm run dev
    ```

2. Start the whiteboard demo:

    ```bash
    cd apps/whiteboard-demo
    npm run dev
    ```

3. Open two browser tabs to `http://localhost:5173`

4. In both tabs:
    - Click "Connect"
    - Wait for "Connected" status

5. Draw in one tab → should appear in the other tab immediately

## Files Changed

- `packages/core/src/state-sync/integrations/merkle-eg-walker/index.ts`
    - Updated `setup` signature to accept `rawStateRegistry`
    - Modified `onRemoteApplied` callback to copy properties to proxied state
    - Fixed `state:remote-applied` event format

- `apps/whiteboard-demo/src/main.ts`
    - Added `redraw()` call in state update callback
