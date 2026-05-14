/**
 * 应用入口文件
 * 桌面端入口，挂载 React 应用到 DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../../web/src/styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('找不到根元素 #root');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
