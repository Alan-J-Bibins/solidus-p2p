import { defineConfig } from 'vite-plus';

export default defineConfig({
    pack: {
        dts: {
            tsgo: true,
        },
        exports: true,
        entry: [
            'src/index.ts',
            'src/state-sync/index.ts',
            'src/state-sync/integrations/index.ts',
            'src/networking/index.ts',
            'src/networking/server.ts',
        ],
    },
    lint: {
        options: {
            typeAware: true,
            typeCheck: true,
        },
    },
    fmt: {},
    test: {
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
    },
});
