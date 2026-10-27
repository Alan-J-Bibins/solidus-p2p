# Offline Resilience Demo Guide

## What We've Implemented

A simple offline resilience system that demonstrates the possibility of offline-first P2P collaboration:

### Features

1. **State Persistence**: When you disconnect or close the page, your whiteboard state is saved to localStorage
2. **State Restoration**: When you reconnect, your offline changes are restored
3. **State Merging**: When you reconnect with peers, your offline changes are merged with their changes (deduplication by stroke ID)

### How It Works

**Offline Flow:**

1. User draws strokes while connected
2. User disconnects (or loses connection, or closes the page)
3. State is automatically saved to localStorage
4. User can continue drawing while offline (state updates are local only)
5. User reconnects
6. Offline state is restored from localStorage
7. User requests state from peers
8. Peer states are merged (combining all unique strokes)
9. Canvas shows the merged result

**Merging Strategy:**

- All strokes are combined into a single set
- Strokes are deduplicated by their unique ID
- If the same stroke ID exists in multiple states, the latest version wins
- This is a simple "last write wins" strategy, not true CRDT merging

## Demo Scenario

### Setup

- Open the whiteboard on **two different machines** (or two different browsers)
- Both connect to the same room (e.g., "demo-room")

### Step 1: Real-time Collaboration (1 minute)

- Both users draw some strokes
- Show that strokes appear in real-time on both sides
- Point out: "This is real-time P2P sync using Merkle-EG-Walker"

### Step 2: Go Offline (1 minute)

- User A clicks "Disconnect"
- User B continues drawing
- User A draws some strokes while offline
- Point out: "User A is now offline, but can still draw"

### Step 3: Reconnect and Merge (1 minute)

- User A clicks "Connect" again
- Both users' canvases update to show all strokes
- Point out: "User A's offline changes are merged with User B's changes"
- Highlight: "No data was lost, even though they were offline"

### Step 4: Page Reload Test (30 seconds)

- User A closes the browser tab
- User A reopens the page and reconnects
- User A's state is restored from localStorage
- Point out: "Even a full page reload preserves your state"

## What to Say to the Panel

### The Problem with Traditional P2P

"Most P2P systems require constant connectivity. If you lose connection, you lose your work or have to start over."

### Our Solution

"With Solidus, we can persist state locally and merge it back when you reconnect. This means:

- You can work offline without losing progress
- When you come back online, your changes sync seamlessly
- No data is lost, even if the connection drops"

### The Technical Details (simplified)

"We use a combination of:

- **Merkle-EG-Walker** for real-time conflict-free sync
- **localStorage** for offline persistence
- **Smart merging** to combine offline and online changes"

### Why This Matters

"This is the foundation for:

- Mobile apps that work in areas with poor connectivity
- Collaborative tools that don't require constant internet
- Resilient systems that can handle network failures gracefully"

## Limitations to Acknowledge

Be transparent about what this demo shows:

1. **Simple Merging**: This uses a basic merge strategy (combine all strokes). Production systems would use the full Merkle-EG-Walker algorithm for true CRDT merging.

2. **Single Device**: This demo shows offline resilience on a single device. In production, the Merkle DAG would be persisted and synced across devices.

3. **No Conflict Resolution**: If two users edit the same stroke while offline, there's no intelligent conflict resolution. The Merkle-EG-Walker algorithm handles this in the full implementation.

## Key Takeaway for the Panel

"This demo shows that **offline-first P2P collaboration is possible**. With the right architecture, you can build apps that work seamlessly whether you're online or offline, and sync your changes when connectivity returns."

"The Merkle-EG-Walker algorithm we've built provides the foundation for this. The simple localStorage persistence we added for this demo is just one way to leverage that foundation."
