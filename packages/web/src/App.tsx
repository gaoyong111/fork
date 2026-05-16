/**
 * App 根组件 - 路由配置
 * 配置应用的页面路由和整体布局
 * 在最外层提供 DndContext，使 Sidebar 和 CollectionList 共享拖拽上下文
 * 集成剪贴板自动检测和 PWA 安装引导
 * mutation 后通过 Zustand store invalidate 刷新数据，不再使用 refreshKey
 */

import { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import Layout from './components/Layout';
import QuickSaveModal from './components/QuickSaveModal';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import DeepReadProgress from './components/DeepReadProgress';
import { ToastProvider } from './contexts/ToastContext';
import { useFolderStore } from './store/folderStore';
import Sidebar from './pages/Sidebar';
import CollectionList from './pages/CollectionList';
import CollectionDetail from './pages/CollectionDetail';
import AddCollection from './pages/AddCollection';
import DataManage from './pages/DataManage';
import TrashPage from './pages/TrashPage';
import useClipboardDetector from './hooks/useClipboardDetector';
import type { ClipboardDetectResult } from './hooks/useClipboardDetector';
import * as api from './services/api';

/**
 * App 根组件
 * 定义路由规则并使用 Layout 包裹所有页面
 * 提供 DndContext 支持跨组件拖拽
 */
export default function App() {
    const [quickSaveVisible, setQuickSaveVisible] = useState(false);
    const [detectedUrl, setDetectedUrl] = useState<ClipboardDetectResult | null>(null);

    /**
     * 剪贴板检测到 URL 的回调
     * @param result - 检测结果
     */
    const handleUrlDetected = useCallback((result: ClipboardDetectResult) => {
        setDetectedUrl(result);
        setQuickSaveVisible(true);
    }, []);

    /**
     * 快速收藏成功的回调
     * 关闭弹窗并刷新 store 数据
     */
    const handleQuickSaveSuccess = useCallback(() => {
        setQuickSaveVisible(false);
        setDetectedUrl(null);
        useFolderStore.getState().invalidate();
    }, []);

    /**
     * 关闭快速收藏弹窗
     */
    const handleQuickSaveClose = useCallback(() => {
        setQuickSaveVisible(false);
    }, []);

    // 初始化剪贴板检测 Hook
    const { detect: detectClipboard, reset: resetClipboard } = useClipboardDetector({
        onUrlDetected: handleUrlDetected,
    });

    /**
     * 组件挂载时自动检测剪贴板
     * 延迟 500ms 执行，避免影响页面加载性能
     */
    useEffect(() => {
        const timer = setTimeout(() => {
            detectClipboard();
        }, 500);

        return () => clearTimeout(timer);
    }, [detectClipboard]);

    /**
     * 处理拖拽结束事件
     * 处理文件夹排序
     */
    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over) return;

        const activeData = active.data.current;
        const overData = over.data.current;

        // 文件夹排序
        if (activeData?.type === 'folder-sort' && overData?.type === 'folder-sort') {
            const activeFolder = activeData.folder;
            const overFolder = overData.folder;

            if (activeFolder.id === overFolder.id) return;

            try {
                await api.updateFolder(activeFolder.id, {
                    sortOrder: overFolder.sortOrder,
                });
                await useFolderStore.getState().invalidate();
            } catch (err) {
                console.error('文件夹排序失败:', err);
            }
        }
    }, []);

    /**
     * 文件夹排序完成回调（传递给 Sidebar）
     */
    const handleFolderReorder = useCallback(
        async (folderId: string, newSortOrder: number) => {
            try {
                await api.updateFolder(folderId, { sortOrder: newSortOrder });
                await useFolderStore.getState().invalidate();
            } catch (err) {
                console.error('文件夹排序失败:', err);
            }
        },
        [],
    );

    /**
     * 手动触发剪贴板检测（从 FAB 钮触发）
     */
    const handleManualDetect = useCallback(async () => {
        resetClipboard();
        await detectClipboard();
    }, [detectClipboard, resetClipboard]);

    return (
        <BrowserRouter>
            <ToastProvider>
                <DndContext onDragEnd={handleDragEnd}>
                    <Layout
                        sidebar={
                            <Sidebar
                                onFolderReorder={handleFolderReorder}
                            />
                        }
                        content={
                            <Routes>
                                <Route
                                    path="/"
                                    element={<CollectionList />}
                                />
                                <Route
                                    path="/collection/:id"
                                    element={<CollectionDetail />}
                                />
                                <Route path="/add" element={<AddCollection />} />
                                <Route path="/settings" element={<DataManage />} />
                                <Route path="/trash" element={<TrashPage />} />
                            </Routes>
                        }
                        onQuickSave={handleManualDetect}
                    />
                </DndContext>

                <QuickSaveModal
                    visible={quickSaveVisible}
                    detectedUrl={detectedUrl}
                    onClose={handleQuickSaveClose}
                    onSuccess={handleQuickSaveSuccess}
                />

                <PWAInstallPrompt />
                <DeepReadProgress />
            </ToastProvider>
        </BrowserRouter>
    );
}