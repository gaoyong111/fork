/**
 * QuickSaveModal 组件 - 快速收藏弹窗
 * 检测到剪贴板中有链接时弹出，支持一键收藏或选择文件夹收藏
 * 移动端友好的底部弹出面板设计
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import { useFolderStore, type FolderState } from '../store/folderStore';
import { useTagStore, type TagState } from '../store/tagStore';
import { useDeepReadStore } from '../store/deepReadStore';
import { useAppSettingsStore } from '../store/appSettingsStore';
import type { ClipboardDetectResult } from '../hooks/useClipboardDetector';
import type { Folder } from '../types';
import TagPopover from './TagPopover';
import './QuickSaveModal.css';

/**
 * 文件夹选择器节点 - 递归渲染文件夹层级
 * 支持展开/折叠和选中，不包含拖拽、重命名等复杂交互
 * @param props - 组件属性
 */
function FolderPickerItem({
    folder,
    selectedFolderId,
    onSelect,
    depth,
}: {
    folder: Folder;
    selectedFolderId: string | null;
    onSelect: (folderId: string) => void;
    depth: number;
}) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = folder.children && folder.children.length > 0;
    const isSelected = selectedFolderId === folder.id;

    /** 切换展开/折叠，不影响选中 */
    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    return (
        <>
            <button
                className={`quick-save-folder-item ${isSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
                onClick={() => onSelect(folder.id)}
            >
                <span
                    className={`folder-picker-toggle ${!hasChildren ? 'invisible' : ''}`}
                    onClick={handleToggle}
                >
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{
                            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 150ms ease',
                        }}
                    >
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                {folder.name}
            </button>
            {hasChildren && expanded && folder.children!.map((child) => (
                <FolderPickerItem
                    key={child.id}
                    folder={child}
                    selectedFolderId={selectedFolderId}
                    onSelect={onSelect}
                    depth={depth + 1}
                />
            ))}
        </>
    );
}

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
    const folders = useFolderStore((s: FolderState) => s.folders);
    const tags = useTagStore((s: TagState) => s.tags);
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
     * 弹窗显示时从 store 加载 folders/tags 数据
     */
    useEffect(() => {
        if (visible) {
            (async () => {
                await Promise.all([
                    useFolderStore.getState().fetchFolders(),
                    useTagStore.getState().fetchTags(),
                ]);
            })();
            setShowFolderPicker(false);
            setSelectedFolderId(null);
            setSelectedTagIds([]);
            setSaveSuccess(false);
            setError(null);
            setPageTitle('');
            setPageDescription('');
            setPageCoverUrl('');
        }
    }, [visible]);

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
            const result = await api.createCollection({
                title: pageTitle || detectedUrl.domain,
                url: detectedUrl.url,
                type: 'link',
                description: pageDescription || undefined,
                thumbnailUrl: pageCoverUrl || undefined,
                folderId: folderId || undefined,
                tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
            });

            // 链接类型按设置自动入队精读
            if (result?.url && useAppSettingsStore.getState().isAutoDeepReadEnabled()) {
                useDeepReadStore.getState().enqueue(
                    result.id,
                    result.url,
                    result.title,
                    0,
                    { summaryMode: useAppSettingsStore.getState().getDefaultSummaryMode() },
                );
            }

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
    }, [detectedUrl, selectedTagIds, onSuccess, pageTitle, pageDescription, pageCoverUrl]);

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
                        <div className="quick-save-tags">
                            <div className="quick-save-tags-label">标签</div>
                            <TagPopover
                                mode="always-open"
                                tags={tags}
                                selectedTagIds={selectedTagIds}
                                onChange={setSelectedTagIds}
                                onCreateTag={async (name, color) => {
                                    const newTag = await api.createTag({ name, color });
                                    await useTagStore.getState().invalidate();
                                    return newTag;
                                }}
                            />
                        </div>

                        {/* 文件夹选择（展开时显示） */}
                        {showFolderPicker && (
                            <div className="quick-save-folders">
                                <div className="quick-save-folders-label">选择文件夹</div>
                                <div className="quick-save-folders-list">
                                    <button
                                        className={`quick-save-folder-item ${selectedFolderId === null ? 'selected' : ''}`}
                                        onClick={() => setSelectedFolderId(null)}
                                    >
                                        <span className="folder-picker-toggle invisible">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="9 18 15 12 9 6" />
                                            </svg>
                                        </span>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                                        </svg>
                                        收件箱
                                    </button>
                                    {folders.map((folder) => (
                                        <FolderPickerItem
                                            key={folder.id}
                                            folder={folder}
                                            selectedFolderId={selectedFolderId}
                                            onSelect={setSelectedFolderId}
                                            depth={0}
                                        />
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
