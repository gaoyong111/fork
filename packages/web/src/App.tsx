/**
 * App 根组件 - 路由配置
 * 配置应用的页面路由和整体布局
 * 在最外层提供 DndContext，使 Sidebar 和 CollectionList 共享拖拽上下文
 * 集成剪贴板自动检测和 PWA 安装引导
 */

import { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import Layout from './components/Layout';
import QuickSaveModal from './components/QuickSaveModal';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { ToastProvider } from './contexts/ToastContext';
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
    const [refreshKey, setRefreshKey] = useState(0);
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
     * 关闭弹窗并刷新列表
     */
    const handleQuickSaveSuccess = useCallback(() => {
        setQuickSaveVisible(false);
        setDetectedUrl(null);
        setRefreshKey((prev) => prev + 1);
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
     * - 收藏拖到文件夹：移动收藏到目标文件夹
     * - 文件夹排序：更新文件夹排序
     */
    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over) return;

        const activeData = active.data.current;
        const overData = over.data.current;

        // 收藏拖到文件夹
        if (activeData?.type === 'collection' && overData?.type === 'folder') {
            const collectionId = activeData.collection.id;
            const folderId = overData.folder.id;

            try {
                await api.moveCollection(collectionId, folderId);
                setRefreshKey((prev) => prev + 1);
            } catch (err) {
                console.error('移动收藏失败:', err);
            }
        }

        // 文件夹排序
        if (activeData?.type === 'folder-sort' && overData?.type === 'folder-sort') {
            const activeFolder = activeData.folder;
            const overFolder = overData.folder;

            if (activeFolder.id === overFolder.id) return;

            try {
                await api.updateFolder(activeFolder.id, {
                    sortOrder: overFolder.sortOrder,
                });
                setRefreshKey((prev) => prev + 1);
            } catch (err) {
                console.error('文件夹排序失败:', err);
            }
        }
    }, []);

    /**
     * 拖拽收藏到文件夹的回调（传递给 Sidebar）
     */
    const handleDropCollection = useCallback(
        async (collectionId: string, folderId: string) => {
            try {
                await api.moveCollection(collectionId, folderId);
                setRefreshKey((prev) => prev + 1);
            } catch (err) {
                console.error('移动收藏失败:', err);
            }
        },
        [],
    );

    /**
     * 文件夹排序完成回调（传递给 Sidebar）
     */
    const handleFolderReorder = useCallback(
        async (folderId: string, newSortOrder: number) => {
            try {
                await api.updateFolder(folderId, { sortOrder: newSortOrder });
                setRefreshKey((prev) => prev + 1);
            } catch (err) {
                console.error('文件夹排序失败:', err);
            }
        },
        [],
    );

    /**
     * 手动触发剪贴板检测（从 FAB 按钮触发）
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
                                onDropCollection={handleDropCollection}
                                onFolderReorder={handleFolderReorder}
                            />
                        }
                        content={
                            <Routes>
                                <Route
                                    path="/"
                                    element={<CollectionList refreshKey={refreshKey} />}
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
            </ToastProvider>
        </BrowserRouter>
    );
}
