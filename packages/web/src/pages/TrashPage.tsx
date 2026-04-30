/**
 * TrashPage 页面组件 - 回收站
 * 展示已删除的收藏项，支持恢复和永久删除操作
 */

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import type { Collection } from '../types';
import { formatRelativeTime, truncateText } from '../utils/format';
import * as api from '../services/api';
import './TrashPage.css';

/**
 * 回收站页面组件
 * 提供已删除收藏项的查看、恢复和永久删除功能
 */
export default function TrashPage() {
    const { showToast, showConfirm } = useToast();

    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
    });

    useEffect(() => {
        loadTrashCollections();
    }, [pagination.page]);

    /**
     * 加载回收站列表
     */
    const loadTrashCollections = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.getTrashCollections({
                page: pagination.page,
                pageSize: pagination.pageSize,
            });
            setCollections(result.items);
            setPagination(result.pagination);
        } catch (err) {
            console.error('加载回收站失败:', err);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.pageSize]);

    /**
     * 恢复单个收藏项
     * @param id - 收藏项 ID
     */
    const handleRestore = async (id: string) => {
        try {
            await api.restoreCollection(id);
            showToast('已恢复', 'success');
            await loadTrashCollections();
        } catch (err) {
            console.error('恢复失败:', err);
            showToast('恢复失败，请重试', 'error');
        }
    };

    /**
     * 永久删除单个收藏项
     * @param id - 收藏项 ID
     */
    const handlePermanentDelete = async (id: string) => {
        const confirmed = await showConfirm({
            title: '永久删除确认',
            message: '确定要永久删除该项吗？此操作不可撤销。',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await api.permanentDeleteCollection(id);
            showToast('已永久删除', 'success');
            await loadTrashCollections();
        } catch (err) {
            console.error('永久删除失败:', err);
            showToast('永久删除失败，请重试', 'error');
        }
    };

    /**
     * 恢复全部已删除项
     */
    const handleRestoreAll = async () => {
        if (pagination.total === 0) return;

        const confirmed = await showConfirm({
            title: '恢复全部确认',
            message: `确定要恢复全部 ${pagination.total} 项吗？`,
        });
        if (!confirmed) return;

        try {
            await api.restoreAllCollections();
            showToast('已恢复全部', 'success');
            await loadTrashCollections();
        } catch (err) {
            console.error('恢复全部失败:', err);
            showToast('恢复全部失败，请重试', 'error');
        }
    };

    /**
     * 清空回收站
     */
    const handleEmptyTrash = async () => {
        if (pagination.total === 0) return;

        const confirmed = await showConfirm({
            title: '清空回收站确认',
            message: `确定要永久删除全部 ${pagination.total} 项吗？此操作不可撤销。`,
            danger: true,
        });
        if (!confirmed) return;

        try {
            await api.emptyTrash();
            showToast('回收站已清空', 'success');
            await loadTrashCollections();
        } catch (err) {
            console.error('清空回收站失败:', err);
            showToast('清空回收站失败，请重试', 'error');
        }
    };

    /**
     * 切换页码
     * @param newPage - 目标页码
     */
    const handlePageChange = (newPage: number) => {
        setPagination((prev) => ({ ...prev, page: newPage }));
    };

    /**
     * 根据收藏项类型获取图标
     * @param type - 收藏项类型
     */
    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'link':
                return (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                );
            case 'file':
                return (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                );
            case 'note':
                return (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="17" y1="10" x2="3" y2="10" />
                        <line x1="21" y1="6" x2="3" y2="6" />
                        <line x1="21" y1="14" x2="3" y2="14" />
                        <line x1="17" y1="18" x2="3" y2="18" />
                    </svg>
                );
            default:
                return null;
        }
    };

    /**
     * 获取类型中文名
     * @param type - 收藏项类型
     */
    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'link': return '网页';
            case 'file': return '文件';
            case 'note': return '笔记';
            default: return type;
        }
    };

    return (
        <div className="trash-page">
            {/* 工具栏 */}
            <div className="trash-page-toolbar">
                <div className="trash-page-toolbar-left">
                    <h2 className="trash-page-title">回收站</h2>
                    <span className="trash-page-count">
                        共 {pagination.total} 项
                    </span>
                </div>

                <div className="trash-page-toolbar-right">
                    <button
                        className="trash-page-action-btn"
                        onClick={handleRestoreAll}
                        disabled={pagination.total === 0}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                        恢复全部
                    </button>
                    <button
                        className="trash-page-action-btn danger"
                        onClick={handleEmptyTrash}
                        disabled={pagination.total === 0}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        清空回收站
                    </button>
                </div>
            </div>

            {/* 内容区域 */}
            {loading ? (
                <div className="trash-page-loading">
                    <div className="loading-spinner" />
                    <span>加载中...</span>
                </div>
            ) : collections.length === 0 ? (
                <div className="trash-page-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <p>回收站是空的</p>
                </div>
            ) : (
                <>
                    <div className="trash-page-content">
                        {collections.map((collection) => (
                            <div key={collection.id} className="trash-page-card">
                                {/* 封面图区域 */}
                                <div className="trash-page-card-cover">
                                    {collection.thumbnailUrl ? (
                                        <img
                                            src={collection.thumbnailUrl}
                                            alt={collection.title}
                                            className="trash-page-card-thumbnail"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="trash-page-card-placeholder">
                                            {getTypeIcon(collection.type)}
                                        </div>
                                    )}

                                    <span className="trash-page-card-type">
                                        {getTypeIcon(collection.type)}
                                        {getTypeLabel(collection.type)}
                                    </span>
                                </div>

                                {/* 内容区域 */}
                                <div className="trash-page-card-body">
                                    <h3 className="trash-page-card-title" title={collection.title}>
                                        {collection.title}
                                    </h3>

                                    {collection.description && (
                                        <p className="trash-page-card-desc">
                                            {truncateText(collection.description, 80)}
                                        </p>
                                    )}

                                    {collection.url && (
                                        <p className="trash-page-card-url" title={collection.url}>
                                            {(() => {
                                                try {
                                                    return new URL(collection.url).hostname;
                                                } catch {
                                                    return collection.url;
                                                }
                                            })()}
                                        </p>
                                    )}

                                    {/* 标签 */}
                                    {collection.tags.length > 0 && (
                                        <div className="trash-page-card-tags">
                                            {collection.tags.slice(0, 3).map((tag) => (
                                                <span
                                                    key={tag.id}
                                                    className="trash-page-card-tag"
                                                    style={{ borderColor: tag.color, color: tag.color }}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                            {collection.tags.length > 3 && (
                                                <span className="trash-page-card-tag-more">
                                                    +{collection.tags.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* 删除时间 */}
                                    <div className="trash-page-card-time">
                                        删除于 {formatRelativeTime(collection.updatedAt)}
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="trash-page-card-actions">
                                        <button
                                            className="trash-page-card-btn restore"
                                            onClick={() => handleRestore(collection.id)}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="1 4 1 10 7 10" />
                                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                            </svg>
                                            恢复
                                        </button>
                                        <button
                                            className="trash-page-card-btn delete"
                                            onClick={() => handlePermanentDelete(collection.id)}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                            永久删除
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 分页 */}
                    {pagination.totalPages > 1 && (
                        <div className="trash-page-pagination">
                            <button
                                className="pagination-btn"
                                disabled={pagination.page <= 1}
                                onClick={() => handlePageChange(pagination.page - 1)}
                            >
                                上一页
                            </button>
                            <span className="pagination-info">
                                {pagination.page} / {pagination.totalPages}
                            </span>
                            <button
                                className="pagination-btn"
                                disabled={pagination.page >= pagination.totalPages}
                                onClick={() => handlePageChange(pagination.page + 1)}
                            >
                                下一页
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
