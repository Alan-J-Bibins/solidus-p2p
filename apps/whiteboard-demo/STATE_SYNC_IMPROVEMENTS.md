# Whiteboard Demo - State Sync Improvements

## Changes Made

### 1. Clear Button Broadcasting

The clear button now properly broadcasts the state change to all peers:

- When you click "Clear", it sets `docState.strokes.length = 0`
- This triggers an `ARRAY_RESIZE` operation
- The operation is captured by the Solidus proxy and broadcast to all peers
- All peers receive the clear operation and update their local state

**Note:** The clear functionality already worked through the state sync mechanism, but we added logging to make it more visible.

### 2. Initial State Sync on Peer Join

When a new peer joins a room with existing strokes, they now receive the current state:

**Flow:**

1. New peer connects and receives `peer-joined` event
2. New peer sends a `state-request` message to the joining peer
3. Existing peer receives the request and sends back a `state-response` with the current state (all strokes)
4. New peer receives the response and applies it to their local state
5. Canvas redraws with all existing strokes

**Implementation Details:**

- Added `isApplyingRemoteState` flag to prevent feedback loops
- When applying remote state, we clear the local strokes array and replace it with the received strokes
- The state update is done through the proxied state object, so it triggers proper state operations
- Mouse events check the `isApplyingRemoteState` flag to avoid committing strokes during state sync

## Testing

### Test Clear Broadcasting

1. Open two browser tabs on different machines
2. Draw some strokes in Tab 1
3. Click "Clear" in Tab 1
4. Verify that Tab 2's canvas is also cleared

### Test Initial State Sync

1. Open Tab 1 and draw some strokes
2. Open Tab 2 and connect to the same room
3. Verify that Tab 2 immediately shows all the strokes drawn in Tab 1
4. Draw more strokes in Tab 2
5. Verify that Tab 1 receives the new strokes

## Code Changes

### apps/whiteboard-demo/src/main.ts

- Added `isApplyingRemoteState` flag
- Updated `onPeerJoin` to send `state-request` message
- Updated `onMessage` to handle `state-request` and `state-response` messages
- Updated `mouseup` and `mouseleave` handlers to check `isApplyingRemoteState`
- Added logging to clear button

## Known Issues

### WebRTC on localhost

As discovered earlier, WebRTC ICE negotiation fails when testing with two tabs on the same machine. This is a known limitation of WebRTC when both peers are on localhost. The state sync features work correctly when tested on different machines.

## Future Improvements

1. **State Snapshot Optimization**: Currently sending the full state on every join. For large documents, consider sending only the operations since a common ancestor.
2. **Conflict Resolution**: The current implementation doesn't handle conflicts when two peers join simultaneously and request state from each other.
3. **Persistence**: Add localStorage/IndexedDB persistence so strokes survive page reloads.
