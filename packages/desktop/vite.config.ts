import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],

    // Tauri 开发时使用 web 包的 dev server，所以 desktop 不需要单独起 vite server
    // 但 tauri dev 命令会启动 vite，这里配置与 web 包一致的端口
    server: {
        port: 5173,
        strictPort: true,
    },

    // 生产构建输出到 dist 目录，供 Tauri 打包使用
    build: {
        outDir: 'dist',
        // Tauri 需要清空输出目录
        emptyOutDir: true,
        // 生产环境不需要 sourcemap
        sourcemap: false,
    },

    // 开发时不做依赖预构建优化（Tauri 场景下）
    optimizeDeps: {
        exclude: [],
    },

    resolve: {
        alias: {
            // 路径别名，与 web 包保持一致
            '@': '/src',
        },
    },
});
