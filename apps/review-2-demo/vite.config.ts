import { defineConfig } from 'vite-plus';

export default defineConfig({
    optimizeDeps: {
        exclude: ['fastcdc'],
    },
    server: {
        allowedHosts: ['f587-2401-4900-ca83-2c7d-c5db-97d8-b27b-90b9.ngrok-free.app'],
    },
});
