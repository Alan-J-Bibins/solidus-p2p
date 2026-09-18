import { createNetworkingPlugin } from '../create-networking-plugin.ts';
import type { SignalingServerConfig } from '../types.ts';
import { createWebRTCTransport } from './transport.ts';
import type { WebRTCResources, WebRTCTransportConfig } from './types.ts';

export function webrtc() {
    return createNetworkingPlugin<WebRTCTransportConfig, WebRTCResources>(
        createWebRTCTransport,
        'networking-webrtc',
        {
            'signaling-server': async (resourceConfig: { config: SignalingServerConfig }) => {
                // Dynamic import - only loads in Node.js environment
                const { SignalingServer } = await import('../signaling-server.ts');
                return new SignalingServer(resourceConfig.config);
            },
        },
    );
}
