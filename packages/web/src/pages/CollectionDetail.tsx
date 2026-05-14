/**
 * CollectionDetail 页面组件 - 收藏详情
 * 查看收藏内容，支持编辑
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useFolderStore, type FolderState } from '../store/folderStore';
import { useTagStore, type TagState } from '../store/tagStore';
import type { Collection, Folder } from '../types';
import * as api from '../services/api';
import { formatDate } from '../utils/format';
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

    const [collection, setCollection] = useState<Collection | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [extracting, setExtracting] = useState(false);

    // 编辑表单状态
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editFolderId, setEditFolderId] = useState<string | null>(null);
    const [editTagIds, setEditTagIds] = useState<string[]>([]);

    // 文件夹和标签（用于编辑选择，从 store 读取）
    const folders = useFolderStore((s: FolderState) => s.folders);
    const tags = useTagStore((s: TagState) => s.tags);

    useEffect(() => {
        if (id) {
            loadDetail();
        }
    }, [id]);

    /**
     * 加载收藏详情
     */
    async function loadDetail() {
        try {
            setLoading(true);
            // 确保 store 数据已加载
            await Promise.all([
                useFolderStore.getState().fetchFolders(),
                useTagStore.getState().fetchTags(),
            ]);
            const detailData = await api.getCollectionById(id!);

            setCollection(detailData);

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
        if (collection) {
            setEditTitle(collection.title);
            setEditDescription(collection.description || '');
            setEditUrl(collection.url || '');
            setEditContent(collection.content || '');
            setEditFolderId(collection.folderId);
            setEditTagIds(collection.tags.map((t) => t.id));
        }
    };

    /**
     * 保存编辑
     */
    const handleSave = async () => {
        if (!collection) return;

        try {
            setSaving(true);
            const updated = await api.updateCollection(collection.id, {
                title: editTitle,
                description: editDescription || undefined,
                url: editUrl || undefined,
                content: editContent || undefined,
                folderId: editFolderId,
                tagIds: editTagIds,
            });

            setCollection(updated);
            setEditing(false);
        } catch (err) {
            console.error('保存失败:', err);
            showToast('保存失败，请重试', 'error');
        } finally {
            setSaving(false);
        }
    };

    /**
     * 删除收藏
     */
    const handleDelete = async () => {
        if (!collection) return;

        const ok = await showConfirm({
            title: '删除确认',
            message: '确定要删除这个收藏吗？此操作不可撤销。',
            danger: true,
        });
        if (!ok) return;

        try {
            await api.deleteCollection(collection.id);
            await useFolderStore.getState().invalidate();
            await useTagStore.getState().invalidate();
            navigate('/');
        } catch (err) {
            console.error('删除失败:', err);
            showToast('删除失败', 'error');
        }
    };

    /**
     * 切换星标
     */
    const handleToggleFavorite = async () => {
        if (!collection) return;

        try {
            const result = await api.toggleFavorite(collection.id);
            setCollection({ ...collection, isFavorite: result.isFavorite });
        } catch (err) {
            console.error('切换星标失败:', err);
        }
    };

    /**
     * AI 提取文章内容并生成精读摘要
     */
    const handleExtractSummary = async () => {
        if (!collection || !collection.url) return;

        try {
            setExtracting(true);
            const result = await api.extractSummary(collection.url);
            const updated = await api.updateCollection(collection.id, {
                content: result.summary,
            });
            setCollection(updated);
            showToast('精读完成', 'success');
        } catch (err) {
            console.error('AI 精读失败:', err);
            showToast('AI 精读失败，请稍后重试', 'error');
        } finally {
            setExtracting(false);
        }
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

    if (!collection) {
        return (
            <div className="collection-detail">
                <div className="collection-detail-not-found">
                    <p>收藏项不存在</p>
                    <Link to="/">返回首页</Link>
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
                {collection.folder && (
                    <>
                        <span className="breadcrumb-sep">/</span>
                        <span>{collection.folder.name}</span>
                    </>
                )}
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-current">{collection.title}</span>
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
                            className={`action-btn ${collection.isFavorite ? 'warning' : ''}`}
                            onClick={handleToggleFavorite}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={collection.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            {collection.isFavorite ? '取消星标' : '添加星标'}
                        </button>
                        <button className="action-btn danger" onClick={handleDelete}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            删除
                        </button>
                        {collection.type === 'link' && collection.url && (
                            <button
                                className="action-btn"
                                onClick={handleExtractSummary}
                                disabled={extracting}
                                title="AI 自动提取文章内容并生成精读摘要"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                                {extracting ? '精读中...' : '提取精读'}
                            </button>
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
                            <div className="form-tag-select">
                                {tags.map((tag) => (
                                    <button
                                        key={tag.id}
                                        className={`form-tag-btn ${editTagIds.includes(tag.id) ? 'selected' : ''}`}
                                        style={{
                                            borderColor: editTagIds.includes(tag.id) ? tag.color : undefined,
                                            backgroundColor: editTagIds.includes(tag.id) ? tag.color + '18' : undefined,
                                            color: editTagIds.includes(tag.id) ? tag.color : undefined,
                                        }}
                                        onClick={() => {
                                            if (editTagIds.includes(tag.id)) {
                                                setEditTagIds(editTagIds.filter((t) => t !== tag.id));
                                            } else {
                                                setEditTagIds([...editTagIds, tag.id]);
                                            }
                                        }}
                                    >
                                        {tag.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 查看模式 */
                    <div className="detail-view">
                        {/* 封面图 */}
                        {collection.thumbnailUrl && (
                            <div className="detail-cover">
                                <img src={collection.thumbnailUrl} alt={collection.title} />
                            </div>
                        )}

                        <h1 className="detail-title">{collection.title}</h1>

                        {/* 元信息 */}
                        <div className="detail-meta">
                            <span className="detail-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                创建于 {formatDate(collection.createdAt)}
                            </span>
                            <span className="detail-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                                更新于 {formatDate(collection.updatedAt)}
                            </span>
                            {collection.type === 'link' && collection.url && (
                                <a
                                    href={collection.url}
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
                        {collection.tags.length > 0 && (
                            <div className="detail-tags">
                                {collection.tags.map((tag) => (
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

                        {/* 精读内容（优先展示） */}
                        {collection.content && (
                            <div className="detail-section">
                                <h3 className="detail-section-title">
                                    {isHtmlContent(collection.content) ? 'AI 精读摘要' : '内容'}
                                </h3>
                                {isHtmlContent(collection.content) ? (
                                    <div
                                        className="detail-content-rich"
                                        dangerouslySetInnerHTML={{ __html: collection.content }}
                                    />
                                ) : (
                                    <div className="detail-content-text">
                                        {collection.content}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 描述 */}
                        {collection.description && (
                            <div className="detail-section">
                                <h3 className="detail-section-title">描述</h3>
                                <p className="detail-description">{collection.description}</p>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}
