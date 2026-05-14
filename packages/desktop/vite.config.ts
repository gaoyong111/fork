import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
    },
    resolve: {
        alias: {
            '@': '/src',
            '@favorites/shared': path.resolve(__dirname, '../shared/src'),
        },
    },
});