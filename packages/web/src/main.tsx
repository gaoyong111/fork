/**
 * 应用入口文件
 * 挂载 React 应用到 DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { isTauriEnvironment } from '@favorites/shared/services/createApi';
import App from './App';
import './styles/globals.css';

// Service Worker 注册（Web 非开发环境；桌面端跳过）
if ('serviceWorker' in navigator && !isTauriEnvironment()) {
    if (location.hostname.includes('localhost')) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((r) => r.unregister());
        });
        caches.keys().then((names) => {
            names.forEach((n) => caches.delete(n));
        });
    } else {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch((err) => {
                console.error('Service Worker 注册失败:', err);
            });
        });
    }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('找不到根元素 #root');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
