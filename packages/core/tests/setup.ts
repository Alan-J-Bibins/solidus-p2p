import wrtc from '@roamhq/wrtc';

Object.assign(globalThis, {
    RTCPeerConnection: wrtc.RTCPeerConnection,
    RTCSessionDescription: wrtc.RTCSessionDescription,
    RTCIceCandidate: wrtc.RTCIceCandidate,
});
