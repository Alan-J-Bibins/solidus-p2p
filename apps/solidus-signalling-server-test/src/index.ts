import { solidus, webrtc } from '@solidus-p2p/core';
const instance = solidus({ plugins: [webrtc()] });
const signalingServer = await instance.create({
    type: 'signaling-server',
    config: {
        port: 8000,
        hooks: {
            onConnection: (peerId, roomId) => {
                console.log(
                    `[solidus signaling-server] Peer ${peerId} connected to room ${roomId}`,
                );
            },
            onDisconnection(peerId, roomId) {
                console.log(
                    `[solidus signaling-server] Peer ${peerId} disconnected from room ${roomId}`,
                );
            },
            onReady(port, host) {
                console.log(
                    `[solidus signaling-server] Signaling Server Running on ${host}:${port}`,
                );
            },
        },
    },
});

signalingServer.listen();
