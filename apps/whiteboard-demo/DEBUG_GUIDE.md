# Debugging Guide: Peer Discovery Issue

## Problem

Peers are not discovering each other through the signaling server. The status shows "waiting for peers..." even when multiple tabs are connected.

## Step-by-Step Debugging

### 1. Verify Signaling Server is Running

```bash
lsof -i :8080
```

You should see the signaling server process listening on port 8080.

### 2. Test Signaling Server Directly

Open the test page in two browser tabs:

```
http://localhost:5173/test-signaling.html
```

In both tabs:

- Click "Connect"
- Check the browser console for logs

**Expected behavior:**

- Tab 1 connects, receives `welcome` message with its peerId
- Tab 2 connects, receives `welcome` message with its peerId
- Tab 1 receives `peer-joined` message for Tab 2
- Tab 2 receives `peer-joined` message for Tab 1

**If this doesn't work:** The signaling server has an issue.

### 3. Check Whiteboard Demo Logs

Open the whiteboard demo in two tabs:

```
http://localhost:5173
```

Open browser DevTools (F12) and go to the Console tab.

**In Tab 1, click "Connect" and look for:**

```
[SignalingClient] Received message: welcome {...}
[SignalingClient] Welcome! My peerId: <uuid> Existing peers: []
[WebRTCTransport] Open! Peer ID: <uuid>
[Network] Open! Peer ID: <uuid>
[Network] Current peers: []
```

**In Tab 2, click "Connect" and look for:**

```
[SignalingClient] Received message: welcome {...}
[SignalingClient] Welcome! My peerId: <uuid> Existing peers: [<tab1-uuid>]
[WebRTCTransport] Setting up peer: <tab1-uuid> isInitiator: true
[WebRTCTransport] Sending signal to: <tab1-uuid> type: offer
```

**Back in Tab 1, you should see:**

```
[SignalingClient] Received message: peer-joined {...}
[SignalingClient] Peer joined: <tab2-uuid>
[WebRTCTransport] Signaling says peer joined: <tab2-uuid>
[WebRTCTransport] Setting up peer: <tab2-uuid> isInitiator: false
[WebRTCTransport] Signal from: <tab2-uuid> type: answer
[WebRTCTransport] Sending signal to: <tab2-uuid> type: ice-candidate
```

**In Tab 2, you should see:**

```
[SignalingClient] Received message: signal {...}
[WebRTCTransport] Signal from: <tab1-uuid> type: ice-candidate
[WebRTCTransport] Peer connection open: <tab1-uuid>
[Network] Peer joined: <tab2-uuid>
```

### 4. Common Issues

#### Issue: No `peer-joined` message received

**Cause:** Signaling server not forwarding messages
**Check:**

- Signaling server console logs (should show "Peer joined room")
- Browser console for WebSocket errors

#### Issue: `peer-joined` received but no WebRTC connection

**Cause:** WebRTC handshake failing
**Check:**

- ICE candidate exchange logs
- Browser console for WebRTC errors
- Network tab for failed requests

#### Issue: WebRTC connection fails

**Cause:** NAT/firewall issues, ICE servers not working
**Check:**

- Try different ICE servers
- Check browser's `chrome://webrtc-internals/` for connection details

### 5. Quick Test

If the test-signaling.html page works but the whiteboard doesn't, the issue is in the WebRTC connection setup, not the signaling server.

## Next Steps

Share the console logs from both tabs so we can identify exactly where the connection is failing.
