import { solidus, webrtc, type NetworkHandle } from '@solidus-p2p/core';
import { yjs } from '@solidus-p2p/core/state-sync/integrations';

export interface DocState {
    content: string;
    version: number;
}

export interface P2PConfig {
    signalingServer: string;
    roomName: string;
    iceServers: RTCIceServer[];
}

export interface P2PHandle {
    getState(): DocState;
    updateContent(content: string): void;
    close(): void;
}

export async function createP2P(
    config: P2PConfig,
    initialContent: string,
    onRemoteChange: (content: string) => void,
): Promise<P2PHandle> {
    let solidusInstance: ReturnType<typeof solidus> | null = null;
    let docState: DocState | null = null;
    let rawDocState: DocState | null = null;
    let network: NetworkHandle | null = null;

    console.log('[P2P] Creating solidus instance...');
    solidusInstance = solidus({
        plugins: [webrtc(), yjs()],
        onStateOperation: (op) => {
            console.log('[P2P] onStateOperation fired (local), op:', op);
        },
        onRemoteOperation: (_op, peerId) => {
            console.log('[P2P] onRemoteOperation fired from peer:', peerId);
            if (docState) {
                console.log('[P2P] Remote change, content length:', docState.content.length);
                onRemoteChange(docState.content);
            }
        },
    });
    console.log('[P2P] Solidus instance created');

    rawDocState = {
        content: initialContent,
        version: 0,
    };
    console.log('[P2P] Raw state object created:', rawDocState);

    docState = solidusInstance.createState(rawDocState, (op) => {
        console.log('[P2P] State update:', op);
    });
    console.log('[P2P] Proxied state created');

    console.log('[P2P] Creating peer network...');
    network = solidusInstance.create({
        type: 'peer-network',
        config: {
            target: rawDocState,
            signalingServer: config.signalingServer,
            room: config.roomName,
            iceServers: config.iceServers,
        },
    });
    console.log('[P2P] Network created');

    await network!.waitUntilOpen();
    console.log('[P2P] Network is open! Local peer ID:', network!.localPeerId);

    network!.onPeerJoin((peerId) => {
        console.log('[P2P] Peer joined:', peerId, 'Total peers:', network!.peers.length);
    });

    network!.onPeerLeave((peerId) => {
        console.log('[P2P] Peer left:', peerId, 'Total peers:', network!.peers.length);
    });

    return {
        getState(): DocState {
            return docState ?? { content: '', version: 0 };
        },
        updateContent(content: string): void {
            if (docState) {
                docState.content = content;
                docState.version++;
            }
        },
        close(): void {
            if (network) {
                network.close();
                network = null;
            }
            solidusInstance = null;
            docState = null;
            rawDocState = null;
        },
    };
}
