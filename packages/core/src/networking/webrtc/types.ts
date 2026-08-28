export type RTCSignal =
    | { type: 'offer'; sdp: RTCSessionDescriptionInit }
    | { type: 'answer'; sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };
