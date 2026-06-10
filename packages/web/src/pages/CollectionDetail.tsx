/**
 * CollectionDetail 页面组件 - 收藏详情
 * 查看收藏内容，支持编辑
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useFolderStore, type FolderState } from '../store/folderStore';
import { useTagStore, type TagState } from '../store/tagStore';
import { useDeepReadStore } from '../store/deepReadStore';
import { useCollectionStore } from '../store/collectionStore';
import TagPopover from '../components/TagPopover';
import DeepReadDirectionModal from '../components/DeepReadDirectionModal';
import type { Collection, Folder } from '../types';
import {
    isHtmlContent as isHtmlRawContent,
    getCachedSummary,
    resolveSummaryMode,
} from '@favorites/shared/ai/deepRead';
import type { SummaryMode } from '../types';
import * as api from '../services/api';
import { formatDate } from '../utils/format';
import { wechatImageReferrerPolicy } from '../utils/wechatImage';
import { useToast } from '../contexts/ToastContext';
import './CollectionDetail.css';

/**
 * 收藏详情页面组件
 * 展示收藏项完整信息，支持编辑模式
 */
export default function CollectionDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast, showConfirm } = useToast();

    const [localCollection, setLocalCollection] = useState<Collection | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const readCountedRef = useRef(false);
    const deepReadTask = useDeepReadStore((s) => (id ? s.taskByCollectionId[id] : undefined));
    const completedContent = useDeepReadStore((s) => id ? s.completedContent[id] : undefined);
    const completedRawContent = useDeepReadStore((s) => id ? s.completedRawContent[id] : undefined);
    const enqueue = useDeepReadStore((s) => s.enqueue);
    const retryTask = useDeepReadStore((s) => s.retryTask);

    // 编辑表单状态
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editFolderId, setEditFolderId] = useState<string | null>(null);
    const [editTagIds, setEditTagIds] = useState<string[]>([]);
    const [contentMode, setContentMode] = useState<'summary' | 'raw'>('summary');
    const [showDirectionModal, setShowDirectionModal] = useState(false);

    // 文件夹和标签（用于编辑选择，从 store 读取）
    const folders = useFolderStore((s: FolderState) => s.folders);
    const tags = useTagStore((s: TagState) => s.tags);

    useEffect(() => {
        if (id) {
            loadDetail();
        }
    }, [id]);

    useEffect(() => {
        if (!id || !completedContent) return;
        setLocalCollection((prev) => {
            if (!prev || prev.id !== id) return prev;
            return { ...prev, content: completedContent };
        });
    }, [id, completedContent]);

    /**
     * 加载收藏详情
     * 优先从 collectionStore 读取，若不存在则通过 API 获取
     */
    async function loadDetail() {
        try {
            setLoading(true);
            // 确保 store 数据已加载
            await Promise.all([
                useFolderStore.getState().fetchFolders(),
                useTagStore.getState().fetchTags(),
            ]);

            // 优先从 collectionStore 读取
            const storeItem = useCollectionStore.getState().collections.find((c) => c.id === id);
            let detailData: Collection;

            if (storeItem && storeItem.content) {
                detailData = storeItem;
            } else {
                detailData = await api.getCollectionById(id!);
            }

            setLocalCollection(detailData);

            // 累加阅读次数（仅首次挂载时执行一次，避免 StrictMode 双调用）
            if (!readCountedRef.current) {
                readCountedRef.current = true;
                api.incrementReadCount(id!).then((result) => {
                    setLocalCollection((prev) =>
                        prev ? { ...prev, readCount: result.readCount } : prev
                    );
                }).catch((err) => {
                    console.error('累加阅读次数失败:', err);
                });
            }

            // 初始化编辑表单
            setEditTitle(detailData.title);
            setEditDescription(detailData.description || '');
            setEditUrl(detailData.url || '');
            setEditContent(detailData.content || '');
            setEditFolderId(detailData.folderId);
            setEditTagIds(detailData.tags.map((t) => t.id));
        } catch (err) {
            console.error('加载收藏详情失败:', err);
        } finally {
            setLoading(false);
        }
    }

    /**
     * 进入编辑模式
     */
    const handleEdit = () => {
        setEditing(true);
    };

    /**
     * 取消编辑
     */
    const handleCancel = () => {
        setEditing(false);
        if (localCollection) {
            setEditTitle(localCollection.title);
            setEditDescription(localCollection.description || '');
            setEditUrl(localCollection.url || '');
            setEditContent(localCollection.content || '');
            setEditFolderId(localCollection.folderId);
            setEditTagIds(localCollection.tags.map((t) => t.id));
        }
    };

    /**
     * 保存编辑
     */
    const handleSave = async () => {
        if (!localCollection) return;

        // 检查 tagIds 是否变化，决定是否需要刷新标签计数
        const oldTagIds = localCollection.tags.map((t) => t.id);
        const tagsChanged = editTagIds.length !== oldTagIds.length
            || editTagIds.some((id) => !oldTagIds.includes(id))
            || oldTagIds.some((id) => !editTagIds.includes(id));

        try {
            setSaving(true);
            const updated = await api.updateCollection(localCollection.id, {
                title: editTitle,
                description: editDescription || undefined,
                url: editUrl || undefined,
                content: editContent || undefined,
                folderId: editFolderId,
                tagIds: editTagIds,
            });

            setLocalCollection(updated);
            setEditing(false);

            // 标签变化时刷新 sidebar 标签计数
            if (tagsChanged) {
                useTagStore.getState().invalidate();
            }
            // folderId 变化时刷新 sidebar 文件夹计数
            if (editFolderId !== localCollection.folderId) {
                useFolderStore.getState().invalidate();
            }
        } catch (err) {
            console.error('保存失败:', err);
            showToast('保存失败，请重试', 'error');
        } finally {
            setSaving(false);
        }
    };

    /**
     * 删除收藏 - 乐观删除 + Undo Toast
     */
    const handleDelete = useCallback(async () => {
        if (!localCollection) return;
        const confirm = await showConfirm({
            title: '确认删除',
            message: `确定要删除 "${localCollection.title}" 吗？`,
            confirmText: '删除',
            danger: true,
        });
        if (!confirm) return;

        useCollectionStore.getState().optimisticDelete(localCollection.id);
        showToast(`已删除 "${localCollection.title}"`, 'info', {
            label: '撤销',
            action: () => {
                const undo = useCollectionStore.getState().pendingUndos.find(
                    (u) => u.targetId === localCollection.id && u.type === 'delete'
                );
                if (undo) {
                    useCollectionStore.getState().undo(undo.id);
                    showToast(`已恢复 "${localCollection.title}"`, 'success');
                }
            },
        });
        navigate('/');
    }, [localCollection, showConfirm, showToast, navigate]);

    /**
     * 切换星标 - 乐观更新
     */
    const handleToggleFavorite = useCallback(() => {
        if (!localCollection) return;
        useCollectionStore.getState().optimisticToggleFavorite(localCollection.id);
        setLocalCollection({ ...localCollection, isFavorite: !localCollection.isFavorite });
    }, [localCollection]);

    /**
     * 切换归档状态
     */
    const handleToggleArchive = useCallback(async () => {
        if (!localCollection) return;
        try {
            const result = await useCollectionStore.getState().optimisticToggleArchive(localCollection.id);
            setLocalCollection((prev) =>
                prev ? { ...prev, isArchived: result.isArchived } : prev
            );
        } catch {
            showToast('归档操作失败，请重试', 'error');
        }
    }, [localCollection, showToast]);

    /**
     * 重新摘要（有原文时跳过重抓，使用默认模板）
     */
    const handleResummary = () => {
        if (!localCollection || !localCollection.url) return;
        const raw = localCollection.rawContent || completedRawContent;
        const mode = resolveSummaryMode(localCollection);
        enqueue(localCollection.id, localCollection.url, localCollection.title, 1, {
            rawContent: raw || undefined,
            summaryMode: mode,
        });
    };

    /**
     * 切换简略 / 详细摘要（有缓存则即时切换，否则排队生成）
     */
    const handleSummaryModeChange = async (mode: SummaryMode) => {
        if (!localCollection?.url || !id) return;
        if (resolveSummaryMode(localCollection) === mode) return;

        const cached = getCachedSummary(localCollection, mode);
        if (cached) {
            try {
                const updated = await api.updateCollection(id, {
                    summaryMode: mode,
                    content: cached,
                });
                setLocalCollection(updated);
                useCollectionStore.getState().updateSummary(id, updated);
            } catch {
                showToast('切换摘要模式失败', 'error');
            }
            return;
        }

        const raw = localCollection.rawContent || completedRawContent;
        enqueue(id, localCollection.url, localCollection.title, 1, {
            rawContent: raw || undefined,
            summaryMode: mode,
        });
    };

    /**
     * 定向再次精读（基于原文 + 用户诉求）
     */
    const handleDirectedRead = (direction: string) => {
        if (!localCollection || !localCollection.url) return;
        const raw = localCollection.rawContent || completedRawContent;
        const summary = localCollection.content || completedContent || '';
        setShowDirectionModal(false);
        enqueue(localCollection.id, localCollection.url, localCollection.title, 1, {
            rawContent: raw || undefined,
            userDirection: direction,
            previousSummary: summary,
            summaryMode: resolveSummaryMode(localCollection),
        });
    };

    /**
     * 完整重读（重新抓取 + 摘要）
     */
    const handleRefetchAndRead = () => {
        if (!localCollection || !localCollection.url) return;
        enqueue(localCollection.id, localCollection.url, localCollection.title, 1, {
            refetch: true,
            summaryMode: resolveSummaryMode(localCollection),
        });
    };

    /**
     * 取消精读 - 从队列移除
     */
    const handleCancelExtract = () => {
        if (!id) return;
        useDeepReadStore.getState().cancelTask(id);
    };

    /**
     * 重试失败的精读任务
     */
    const handleRetryExtract = () => {
        if (!id) return;
        retryTask(id);
    };

    /**
     * 判断内容是否为 HTML
     */
    function isHtmlContent(text: string): boolean {
        return /<[a-z][\s\S]*>/i.test(text);
    }

    /**
     * 扁平化文件夹树（用于下拉选择）
     */
    const flattenFolders = (folderList: Folder[], depth: number = 0): { id: string; name: string; depth: number }[] => {
        const result: { id: string; name: string; depth: number }[] = [];
        for (const folder of folderList) {
            result.push({ id: folder.id, name: folder.name, depth });
            if (folder.children) {
                result.push(...flattenFolders(folder.children, depth + 1));
            }
        }
        return result;
    };

    if (loading) {
        return (
            <div className="collection-detail">
                <div className="collection-detail-loading">
                    <div className="loading-spinner" />
                    <span>加载中...</span>
                </div>
            </div>
        );
    }

    const activeSummaryMode = localCollection ? resolveSummaryMode(localCollection) : 'detailed';
    const displaySummary = localCollection
        ? (getCachedSummary(localCollection, activeSummaryMode) || completedContent || '')
        : (completedContent || '');

    if (!localCollection) {
        return (
            <div className="collection-detail">
                <div className="collection-detail-not-found">
                    <div className="collection-detail-not-found-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </div>
                    <p>收藏项不存在或已被删除</p>
                    <Link to="/" className="collection-detail-not-found-link">返回首页</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="collection-detail">
            {/* 返回按钮 */}
            <div className="collection-detail-back">
                <button className="action-btn" onClick={() => navigate('/')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    返回
                </button>
            </div>

            {/* 面包屑导航 */}
            <div className="collection-detail-breadcrumb">
                <Link to="/">全部收藏</Link>
                {localCollection.folder && (
                    <>
                        <span className="breadcrumb-sep">/</span>
                        <span>{localCollection.folder.name}</span>
                    </>
                )}
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-current">{localCollection.title}</span>
            </div>

            {/* 操作栏 */}
            <div className="collection-detail-actions">
                {!editing ? (
                    <>
                        <button className="action-btn primary" onClick={handleEdit}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            编辑
                        </button>
                        <button
                            className={`action-btn ${localCollection.isFavorite ? 'warning' : ''}`}
                            onClick={handleToggleFavorite}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={localCollection.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            {localCollection.isFavorite ? '取消星标' : '添加星标'}
                        </button>
                        <button
                            className={`action-btn ${localCollection.isArchived ? 'warning' : ''}`}
                            onClick={handleToggleArchive}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={localCollection.isArchived ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <polyline points="21 8 21 21 3 21 3 8" />
                                <rect x="1" y="3" width="22" height="5" />
                                <line x1="10" y1="12" x2="14" y2="12" />
                            </svg>
                            {localCollection.isArchived ? '取消归档' : '归档'}
                        </button>
                        <button className="action-btn danger" onClick={handleDelete}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            删除
                        </button>
                        {localCollection.type === 'link' && localCollection.url && (
                            <>
                                {!deepReadTask && (
                                    <>
                                        {!displaySummary ? (
                                            <button
                                                className="action-btn"
                                                onClick={handleRefetchAndRead}
                                                title="抓取页面并 AI 精读"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <polyline points="12 6 12 12 16 14" />
                                                </svg>
                                                提取精读
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    className="action-btn"
                                                    onClick={() => setShowDirectionModal(true)}
                                                    title="输入阅读方向，基于原文重新精读"
                                                >
                                                    再次精读
                                                </button>
                                                {(localCollection.rawContent || completedRawContent) && (
                                                    <button
                                                        className="action-btn"
                                                        onClick={handleResummary}
                                                        title="使用默认模板重新生成摘要"
                                                    >
                                                        重新摘要
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {(localCollection.rawContent || completedRawContent) && (
                                            <button
                                                className="action-btn"
                                                onClick={handleRefetchAndRead}
                                                title="重新抓取网页原文并生成摘要"
                                            >
                                                重新抓取
                                            </button>
                                        )}
                                    </>
                                )}
                                {deepReadTask?.status === 'pending' && (
                                    <button
                                        className="action-btn"
                                        disabled
                                        title="等待精读..."
                                    >
                                        等待精读...
                                    </button>
                                )}
                                {deepReadTask?.status === 'processing' && (
                                    <>
                                        <button
                                            className="action-btn"
                                            disabled
                                            title="精读中..."
                                        >
                                            <span className="deep-read-spinner-sm" />
                                            {deepReadTask.phase === 'summarizing' ? '生成摘要...' : '抓取正文...'}
                                        </button>
                                        <button
                                            className="action-btn action-btn-cancel"
                                            onClick={handleCancelExtract}
                                            title="取消精读"
                                        >
                                            取消
                                        </button>
                                    </>
                                )}
                                {deepReadTask?.status === 'error' && (
                                    <button
                                        className="action-btn"
                                        onClick={handleRetryExtract}
                                        title="重试精读"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        重试精读
                                    </button>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <button className="action-btn primary" onClick={handleSave} disabled={saving}>
                            {saving ? '保存中...' : '保存'}
                        </button>
                        <button className="action-btn" onClick={handleCancel}>
                            取消
                        </button>
                    </>
                )}
            </div>

            {/* 内容区域 */}
            <div className="collection-detail-content">
                <div className="collection-detail-content-inner">
                {editing ? (
                    /* 编辑模式 */
                    <div className="detail-edit-form">
                        <div className="form-group">
                            <label className="form-label">标题</label>
                            <input
                                type="text"
                                className="form-input"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="请输入标题"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">URL</label>
                            <input
                                type="url"
                                className="form-input"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                placeholder="https://"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">描述</label>
                            <textarea
                                className="form-textarea"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="添加描述..."
                                rows={3}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">内容</label>
                            <textarea
                                className="form-textarea form-textarea-large"
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                placeholder="添加内容..."
                                rows={10}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">文件夹</label>
                            <select
                                className="form-select"
                                value={editFolderId || ''}
                                onChange={(e) => setEditFolderId(e.target.value || null)}
                            >
                                <option value="">未分类</option>
                                {flattenFolders(folders).map((folder) => (
                                    <option key={folder.id} value={folder.id}>
                                        {'  '.repeat(folder.depth)}{folder.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">标签</label>
                            <TagPopover
                                mode="inline"
                                tags={tags}
                                selectedTagIds={editTagIds}
                                onChange={setEditTagIds}
                                onCreateTag={async (name, color) => {
                                    const newTag = await api.createTag({ name, color });
                                    await useTagStore.getState().invalidate();
                                    return newTag;
                                }}
                            />
                        </div>
                    </div>
                ) : (
                    /* 查看模式 */
                    <div className="detail-view">
                        {/* 封面图 */}
                        {localCollection.thumbnailUrl && (
                            <div className="detail-cover">
                                <img
                                    src={localCollection.thumbnailUrl}
                                    alt={localCollection.title}
                                    referrerPolicy={wechatImageReferrerPolicy(localCollection.thumbnailUrl)}
                                />
                            </div>
                        )}

                        <h1 className="detail-title">{localCollection.title}</h1>

                        {/* 元信息 */}
                        <div className="detail-meta">
                            <span className="detail-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                创建于 {formatDate(localCollection.createdAt)}
                            </span>
                            <span className="detail-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                                更新于 {formatDate(localCollection.updatedAt)}
                            </span>
                            {localCollection.readCount > 0 && (
                                <span className="detail-meta-item">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                    </svg>
                                    已读 {localCollection.readCount} 次
                                </span>
                            )}
                            {localCollection.type === 'link' && localCollection.url && (
                                <a
                                    href={localCollection.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="detail-meta-item detail-link"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                    访问链接
                                </a>
                            )}
                        </div>

                        {/* 标签 */}
                        {localCollection.tags.length > 0 && (
                            <div className="detail-tags">
                                {localCollection.tags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="detail-tag"
                                        style={{ backgroundColor: tag.color + '18', color: tag.color }}
                                    >
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* 精读内容（优先展示，使用 completedContent 兜底刷新） */}
                        {displaySummary && (
                            <div className="detail-section">
                                <div className="detail-section-header">
                                    <h3 className="detail-section-title">
                                        {isHtmlContent(displaySummary) ? 'AI 精读摘要' : '内容'}
                                    </h3>
                                    <div className="detail-section-header-actions">
                                        <div className="detail-summary-mode-switch">
                                            <button
                                                type="button"
                                                className={`mode-btn ${activeSummaryMode === 'brief' ? 'active' : ''}`}
                                                onClick={() => void handleSummaryModeChange('brief')}
                                                disabled={deepReadTask?.status === 'processing' || deepReadTask?.status === 'pending'}
                                            >
                                                简略
                                            </button>
                                            <button
                                                type="button"
                                                className={`mode-btn ${activeSummaryMode === 'detailed' ? 'active' : ''}`}
                                                onClick={() => void handleSummaryModeChange('detailed')}
                                                disabled={deepReadTask?.status === 'processing' || deepReadTask?.status === 'pending'}
                                            >
                                                详细
                                            </button>
                                        </div>
                                        {(localCollection.rawContent || completedRawContent) && (
                                            <div className="detail-content-mode-switch">
                                                <button
                                                    type="button"
                                                    className={`mode-btn ${contentMode === 'summary' ? 'active' : ''}`}
                                                    onClick={() => setContentMode('summary')}
                                                >
                                                    AI摘要
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`mode-btn ${contentMode === 'raw' ? 'active' : ''}`}
                                                    onClick={() => setContentMode('raw')}
                                                >
                                                    原文
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {contentMode === 'raw' && (localCollection.rawContent || completedRawContent) ? (
                                    isHtmlRawContent(localCollection.rawContent || completedRawContent || '') ? (
                                        <div
                                            className="detail-content-rich detail-raw-content"
                                            dangerouslySetInnerHTML={{
                                                __html: DOMPurify.sanitize(localCollection.rawContent || completedRawContent || '', {
                                                    ADD_ATTR: ['referrerpolicy'],
                                                }),
                                            }}
                                        />
                                    ) : (
                                        <div className="detail-content-text detail-raw-content">
                                            {(localCollection.rawContent || completedRawContent || '').split('\n\n').map((para, i) => (
                                                <p key={i}>{para}</p>
                                            ))}
                                        </div>
                                    )
                                ) : isHtmlContent(displaySummary) ? (
                                    <div
                                        className="detail-content-rich"
                                        role="document"
                                        aria-label="AI 精读摘要内容"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displaySummary) }}
                                    />
                                ) : (
                                    <div className="detail-content-text">
                                        {displaySummary}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 描述 */}
                        {localCollection.description && (
                            <div className="detail-section">
                                <h3 className="detail-section-title">描述</h3>
                                <p className="detail-description">{localCollection.description}</p>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>
            {showDirectionModal && (
                <DeepReadDirectionModal
                    onClose={() => setShowDirectionModal(false)}
                    onConfirm={handleDirectedRead}
                />
            )}
        </div>
    );
}
