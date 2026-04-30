/**
 * QuickSaveModal 组件 - 快速收藏弹窗
 * 检测到剪贴板中有链接时弹出，支持一键收藏或选择文件夹收藏
 * 移动端友好的底部弹出面板设计
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import type { ClipboardDetectResult } from '../hooks/useClipboardDetector';
import type { Folder, Tag } from '../types';
import './QuickSaveModal.css';

interface QuickSaveModalProps {
    /** 是否显示弹窗 */
    visible: boolean;
    /** 检测到的剪贴板链接信息 */
    detectedUrl: ClipboardDetectResult | null;
    /** 关闭弹窗回调 */
    onClose: () => void;
    /** 收藏成功回调 */
    onSuccess: () => void;
}

/**
 * QuickSaveModal 快速收藏弹窗组件
 * 显示检测到的链接信息，提供一键收藏和选择文件夹收藏两种方式
 * @param props - 组件属性
 */
export default function QuickSaveModal({
    visible,
    detectedUrl,
    onClose,
    onSuccess,
}: QuickSaveModalProps) {
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pageTitle, setPageTitle] = useState<string>('');
    const [pageDescription, setPageDescription] = useState<string>('');
    const [pageCoverUrl, setPageCoverUrl] = useState<string>('');
    const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);

    /**
     * 加载文件夹列表和标签列表
     */
    const loadFoldersAndTags = useCallback(async () => {
        try {
            const [folderTree, tagList] = await Promise.all([
                api.getFolderTree(),
                api.getTags(),
            ]);
            setFolders(folderTree);
            setTags(tagList);
        } catch (err) {
            console.error('加载文件夹和标签失败:', err);
        }
    }, []);

    /**
     * 弹窗显示时加载数据，关闭时重置状态
     */
    useEffect(() => {
        if (visible) {
            loadFoldersAndTags();
            setShowFolderPicker(false);
            setSelectedFolderId(null);
            setSelectedTagIds([]);
            setSaveSuccess(false);
            setError(null);
            setPageTitle('');
            setPageDescription('');
            setPageCoverUrl('');
        }
    }, [visible, loadFoldersAndTags]);

    /**
     * 弹窗显示时自动获取页面元数据
     */
    useEffect(() => {
        if (!visible || !detectedUrl?.url) return;

        let cancelled = false;
        setIsFetchingMetadata(true);

        api.fetchMetadata(detectedUrl.url)
            .then((metadata) => {
                if (cancelled) return;
                if (metadata.title) setPageTitle(metadata.title);
                if (metadata.description) setPageDescription(metadata.description);
                if (metadata.coverUrl) setPageCoverUrl(metadata.coverUrl);
            })
            .catch(() => {
                // 静默忽略，使用域名作为标题
            })
            .finally(() => {
                if (!cancelled) setIsFetchingMetadata(false);
            });

        return () => {
            cancelled = true;
        };
    }, [visible, detectedUrl?.url]);

    /**
     * 执行收藏操作
     * @param folderId - 目标文件夹 ID，null 表示不分类（收件箱）
     */
    const handleSave = useCallback(async (folderId: string | null) => {
        if (!detectedUrl) return;

        setIsSaving(true);
        setError(null);

        try {
            await api.createCollection({
                title: pageTitle || detectedUrl.domain,
                url: detectedUrl.url,
                type: 'link',
                description: pageDescription || undefined,
                thumbnailUrl: pageCoverUrl || undefined,
                folderId: folderId || undefined,
                tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
            });

            setSaveSuccess(true);

            // 成功后自动关闭
            setTimeout(() => {
                onSuccess();
            }, 1200);
        } catch (err) {
            setError(err instanceof Error ? err.message : '收藏失败，请重试');
        } finally {
            setIsSaving(false);
        }
    }, [detectedUrl, selectedTagIds, onSuccess]);

    /**
     * 切换标签选择
     * @param tagId - 标签 ID
     */
    const handleToggleTag = useCallback((tagId: string) => {
        setSelectedTagIds((prev) => {
            if (prev.includes(tagId)) {
                return prev.filter((id) => id !== tagId);
            }
            return [...prev, tagId];
        });
    }, []);

    /**
     * 获取 favicon URL
     * 使用 favicon.im 服务（国内可用）
     * @param domain - 域名
     * @returns favicon 图标 URL
     */
    const getFaviconUrl = (domain: string): string => {
        return `https://favicon.im/${domain}`;
    };

    if (!visible || !detectedUrl) return null;

    return (
        <div className="quick-save-overlay" onClick={onClose}>
            <div
                className="quick-save-panel"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 成功状态 */}
                {saveSuccess ? (
                    <div className="quick-save-success">
                        <div className="quick-save-success-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                            </svg>
                        </div>
                        <div className="quick-save-success-text">收藏成功</div>
                    </div>
                ) : (
                    <>
                        {/* 链接预览卡片 */}
                        <div className="quick-save-preview">
                            <div className="quick-save-preview-icon">
                                <img
                                    src={getFaviconUrl(detectedUrl.domain)}
                                    alt=""
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            </div>
                            <div className="quick-save-preview-info">
                                <div className="quick-save-preview-domain">
                                    {isFetchingMetadata
                                        ? '正在获取页面信息...'
                                        : (pageTitle || detectedUrl.domain)}
                                </div>
                                <div className="quick-save-preview-url">
                                    {detectedUrl.url}
                                </div>
                            </div>
                        </div>

                        {/* 标签选择 */}
                        {tags.length > 0 && (
                            <div className="quick-save-tags">
                                <div className="quick-save-tags-label">标签</div>
                                <div className="quick-save-tags-list">
                                    {tags.map((tag) => (
                                        <button
                                            key={tag.id}
                                            className={`quick-save-tag ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}
                                            style={{
                                                '--tag-color': tag.color,
                                            } as React.CSSProperties}
                                            onClick={() => handleToggleTag(tag.id)}
                                        >
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 文件夹选择（展开时显示） */}
                        {showFolderPicker && (
                            <div className="quick-save-folders">
                                <div className="quick-save-folders-label">选择文件夹</div>
                                <div className="quick-save-folders-list">
                                    <button
                                        className={`quick-save-folder-item ${selectedFolderId === null ? 'selected' : ''}`}
                                        onClick={() => setSelectedFolderId(null)}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                                        </svg>
                                        收件箱
                                    </button>
                                    {folders.map((folder) => (
                                        <button
                                            key={folder.id}
                                            className={`quick-save-folder-item ${selectedFolderId === folder.id ? 'selected' : ''}`}
                                            onClick={() => setSelectedFolderId(folder.id)}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                                            </svg>
                                            {folder.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 错误提示 */}
                        {error && (
                            <div className="quick-save-error">{error}</div>
                        )}

                        {/* 操作按钮 */}
                        <div className="quick-save-actions">
                            {!showFolderPicker ? (
                                <>
                                    <button
                                        className="quick-save-btn quick-save-btn-primary"
                                        disabled={isSaving}
                                        onClick={() => handleSave(selectedFolderId)}
                                    >
                                        {isSaving ? '收藏中...' : '一键收藏'}
                                    </button>
                                    <button
                                        className="quick-save-btn quick-save-btn-secondary"
                                        onClick={() => setShowFolderPicker(true)}
                                    >
                                        选择文件夹
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        className="quick-save-btn quick-save-btn-primary"
                                        disabled={isSaving}
                                        onClick={() => handleSave(selectedFolderId)}
                                    >
                                        {isSaving ? '收藏中...' : '确认收藏'}
                                    </button>
                                    <button
                                        className="quick-save-btn quick-save-btn-secondary"
                                        onClick={() => setShowFolderPicker(false)}
                                    >
                                        返回
                                    </button>
                                </>
                            )}
                            <button
                                className="quick-save-btn quick-save-btn-cancel"
                                onClick={onClose}
                                disabled={isSaving}
                            >
                                取消
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
