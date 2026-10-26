import { defineConfig } from 'vite-plus';

export default defineConfig({
    optimizeDeps: {
        exclude: ['fastcdc'],
    },
});
