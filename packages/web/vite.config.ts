import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@favorites/shared': path.resolve(__dirname, '../shared/src'),
        },
    },
    build: {
        rollupOptions: {
            external: ['@tauri-apps/api/core'],
        },
    },
});