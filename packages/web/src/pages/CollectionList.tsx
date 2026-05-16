/**
 * CollectionList 页面组件 - 收藏列表
 * 支持卡片/列表视图切换、搜索、筛选、排序和批量操作
 * 支持拖拽收藏到文件夹
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import SearchBar, { type SearchBarRef } from '../components/SearchBar';
import CollectionCard from '../components/CollectionCard';
import SkeletonCard from '../components/SkeletonCard';
import BatchActionBar from '../components/BatchActionBar';
import FolderSelector from '../components/FolderSelector';
import TagPicker from '../components/TagPicker';
import { useToast } from '../contexts/ToastContext';
import type { Collection, GetCollectionsParams } from '../types';
import { useFolderStore, type FolderState } from '../store/folderStore';
import { useTagStore, type TagState } from '../store/tagStore';
import { useDeepReadStore } from '../store/deepReadStore';
import * as api from '../services/api';
import './CollectionList.css';

/** 视图模式 */
type ViewMode = 'grid' | 'list';

/** 排序选项 */
interface SortOption {
    /** 排序字段 */
    sortBy: string;
    /** 排序方向 */
    sortOrder: 'asc' | 'desc';
    /** 显示文本 */
    label: string;
}

/** 排序选项列表 */
const SORT_OPTIONS: SortOption[] = [
    { sortBy: 'createdAt', sortOrder: 'desc', label: '最新创建' },
    { sortBy: 'createdAt', sortOrder: 'asc', label: '最早创建' },
    { sortBy: 'updatedAt', sortOrder: 'desc', label: '最新更新' },
    { sortBy: 'title', sortOrder: 'asc', label: '标题 A→Z' },
    { sortBy: 'title', sortOrder: 'desc', label: '标题 Z→A' },
];

/**
 * 收藏列表页面组件
 * 展示收藏项列表，支持搜索、筛选、排序和批量操作
 * 文件夹和标签数据从 Zustand store 读取
 */
export default function CollectionList() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { showToast, showConfirm } = useToast();

    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
    });
    const [keyword, setKeyword] = useState('');
    const searchBarRef = useRef<SearchBarRef>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 批量操作状态
    const [batchMode, setBatchMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showFolderSelector, setShowFolderSelector] = useState(false);
    const [showTagPicker, setShowTagPicker] = useState(false);
    const [batchLoading, setBatchLoading] = useState(false);

    // 文件夹和标签数据（用于批量操作，从 store 读取）
    const folders = useFolderStore((s: FolderState) => s.folders);
    const allTags = useTagStore((s: TagState) => s.tags);

    // 从 URL 参数获取筛选条件
    const folderId = searchParams.get('folder') || undefined;
    const tagId = searchParams.get('tag') || undefined;
    const isFavorite = searchParams.get('favorite') === 'true' ? true : undefined;
    const sortByParam = searchParams.get('sortBy') || 'createdAt';
    const sortOrderParam = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    /**
     * 监听全局 focus-search 事件，响应 Ctrl/Cmd+K 快捷键
     */
    useEffect(() => {
        const handleFocusSearch = () => {
            searchBarRef.current?.focus();
        };

        document.addEventListener('focus-search', handleFocusSearch);
        return () => {
            document.removeEventListener('focus-search', handleFocusSearch);
        };
    }, []);

    /**
     * 手动重新加载收藏列表（供事件处理函数调用，不依赖 useEffect）
     */
    async function reloadCollections() {
        try {
            setLoading(true);
            const params: GetCollectionsParams = {
                page: pagination.page,
                pageSize: pagination.pageSize,
                folderId,
                tagId,
                isFavorite,
                keyword: keyword || undefined,
                sortBy: sortByParam,
                sortOrder: sortOrderParam,
            };
            const result = await api.getCollections(params);
            setCollections(result.items);
            setPagination(result.pagination);
            if (result.items.length === 0 && pagination.page > 1) {
                setPagination(prev => ({ ...prev, page: 1 }));
            }
        } catch (err) {
            console.error('加载收藏列表失败:', err);
        } finally {
            setLoading(false);
        }
    }

    /**
     * 筛选条件、页码或搜索关键词变化时自动加载列表
     */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const params: GetCollectionsParams = {
                    page: pagination.page,
                    pageSize: pagination.pageSize,
                    folderId,
                    tagId,
                    isFavorite,
                    keyword: keyword || undefined,
                    sortBy: sortByParam,
                    sortOrder: sortOrderParam,
                };
                const result = await api.getCollections(params);
                if (!cancelled) {
                    setCollections(result.items);
                    setPagination(result.pagination);
                    // 首次加载成功后初始化精读队列
                    const deepReadState = useDeepReadStore.getState();
                    if (!deepReadState.initialized) {
                        deepReadState.initQueue(result.items);
                    }
                }
            } catch (err) {
                if (!cancelled) console.error('加载收藏列表失败:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [folderId, tagId, isFavorite, sortByParam, sortOrderParam, pagination.page, pagination.pageSize, keyword]);

    /**
     * 进入批量模式时预加载 folders/tags 数据
     */
    const enterBatchMode = async () => {
        setBatchMode(true);
        setSelectedIds(new Set());
        await Promise.all([
            useFolderStore.getState().fetchFolders(),
            useTagStore.getState().fetchTags(),
        ]);
    };

    /**
     * 批量精读：将选中项中未精读的链接收藏入队
     */
    const handleBatchDeepRead = () => {
        const items = collections
            .filter((c) => selectedIds.has(c.id) && c.type === 'link' && c.url && !c.content)
            .map((c) => ({ id: c.id, url: c.url!, title: c.title }));
        if (items.length === 0) {
            showToast('选中的项中没有可精读的链接', 'warning');
            return;
        }
        useDeepReadStore.getState().enqueueBatch(items);
        showToast(`已加入精读队列 ${items.length} 项`, 'success');
        exitBatchMode();
    };

    /**
     * 搜索处理（300ms 防抖），防抖结束后更新 keyword，由 useEffect 自动触发加载
     */
    const handleSearch = (value: string) => {
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }

        searchTimerRef.current = setTimeout(() => {
            setKeyword(value);
            setPagination(prev => ({ ...prev, page: 1 }));
        }, 300);
    };

    /**
     * 组件卸载时清理搜索防抖定时器
     */
    useEffect(() => {
        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }
        };
    }, []);

    /**
     * 点击收藏卡片
     */
    const handleCardClick = (collection: Collection) => {
        if (batchMode) return;
        navigate(`/collection/${collection.id}`);
    };

    /**
     * 切换星标
     */
    const handleToggleFavorite = async (id: string) => {
        try {
            await api.toggleFavorite(id);
            await reloadCollections();
        } catch (err) {
            console.error('切换星标失败:', err);
        }
    };

    /**
     * 切换页码
     */
    const handlePageChange = (newPage: number) => {
        setPagination((prev) => ({ ...prev, page: newPage }));
    };

    /**
     * 排序变化处理，重置到第 1 页
     * @param option - 选中的排序选项
     */
    const handleSortChange = (option: SortOption) => {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('sortBy', option.sortBy);
        newParams.set('sortOrder', option.sortOrder);
        setSearchParams(newParams);
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    // ==================== 批量操作相关 ====================

    /**
     * 退出批量模式
     */
    const exitBatchMode = () => {
        setBatchMode(false);
        setSelectedIds(new Set());
        setShowFolderSelector(false);
        setShowTagPicker(false);
    };

    /**
     * ESC 退出批量模式（监听键盘事件 + Layout 全局事件）
     */
    useEffect(() => {
        function handleEsc(e: KeyboardEvent) {
            if (e.key === 'Escape' && batchMode) {
                exitBatchMode();
            }
        }

        function handleExitBatchMode() {
            if (batchMode) {
                exitBatchMode();
            }
        }

        document.addEventListener('keydown', handleEsc);
        document.addEventListener('exit-batch-mode', handleExitBatchMode);
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.removeEventListener('exit-batch-mode', handleExitBatchMode);
        };
    }, [batchMode]);

    /**
     * 切换单个收藏项选中状态
     * @param id - 收藏项 ID
     */
    const handleSelectItem = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    /**
     * 全选/取消全选
     */
    const handleSelectAll = () => {
        if (selectedIds.size === collections.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(collections.map((c) => c.id)));
        }
    };

    /**
     * 批量删除
     */
    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;

        const confirmed = await showConfirm({
            title: '批量删除确认',
            message: `确定要删除选中的 ${selectedIds.size} 项吗？此操作不可撤销。`,
            danger: true,
        });
        if (!confirmed) return;

        try {
            setBatchLoading(true);
            await api.batchDeleteCollections(Array.from(selectedIds));
            await useFolderStore.getState().invalidate();
            await useTagStore.getState().invalidate();
            exitBatchMode();
            await reloadCollections();
        } catch (err) {
            console.error('批量删除失败:', err);
            showToast('批量删除失败，请重试', 'error');
        } finally {
            setBatchLoading(false);
        }
    };

    /**
     * 批量移动到文件夹
     * @param targetFolderId - 目标文件夹 ID，null 表示移至未分类
     */
    const handleBatchMove = async (targetFolderId: string | null) => {
        if (selectedIds.size === 0) return;

        setShowFolderSelector(false);
        setBatchLoading(true);

        try {
            await api.batchMoveCollections(Array.from(selectedIds), targetFolderId);
            await useFolderStore.getState().invalidate();
            exitBatchMode();
            await reloadCollections();
        } catch (err) {
            console.error('批量移动失败:', err);
            showToast('批量移动失败，请重试', 'error');
        } finally {
            setBatchLoading(false);
        }
    };

    /**
     * 批量添加标签
     * @param tagIds - 要添加的标签 ID 列表
     */
    const handleBatchAddTags = async (tagIds: string[]) => {
        if (selectedIds.size === 0 || tagIds.length === 0) return;

        setShowTagPicker(false);
        setBatchLoading(true);

        try {
            await api.batchAddTags(Array.from(selectedIds), tagIds, 'add');
            exitBatchMode();
            await reloadCollections();
        } catch (err) {
            console.error('批量添加标签失败:', err);
            showToast('批量添加标签失败，请重试', 'error');
        } finally {
            setBatchLoading(false);
        }
    };

    // 获取当前筛选标题
    const getFilterTitle = () => {
        if (searchParams.get('favorite') === 'true') return '星标收藏';
        if (searchParams.get('folder')) return '文件夹';
        if (searchParams.get('tag')) return '标签筛选';
        return '全部收藏';
    };

    // 当前排序选项
    const currentSortOption = useMemo(
        () => SORT_OPTIONS.find(
            (o) => o.sortBy === sortByParam && o.sortOrder === sortOrderParam,
        ) || SORT_OPTIONS[0],
        [sortByParam, sortOrderParam],
    );

    return (
        <div className="collection-list">
            {/* 工具栏 */}
            <div className="collection-list-toolbar">
                <div className="collection-list-toolbar-left">
                    <h2 className="collection-list-title">{getFilterTitle()}</h2>
                    <span className="collection-list-count">
                        共 {pagination.total} 项
                    </span>
                </div>

                <div className="collection-list-toolbar-right">
                    <SearchBar ref={searchBarRef} onSearch={handleSearch} placeholder="搜索收藏..." />

                    {/* 排序选择器 */}
                    <div className="collection-list-sort">
                        <select
                            className="collection-list-sort-select"
                            value={`${currentSortOption.sortBy}-${currentSortOption.sortOrder}`}
                            onChange={(e) => {
                                const option = SORT_OPTIONS.find(
                                    (o) => `${o.sortBy}-${o.sortOrder}` === e.target.value,
                                );
                                if (option) handleSortChange(option);
                            }}
                        >
                            {SORT_OPTIONS.map((option) => (
                                <option
                                    key={`${option.sortBy}-${option.sortOrder}`}
                                    value={`${option.sortBy}-${option.sortOrder}`}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 批量管理按钮 */}
                    <button
                        className={`collection-list-batch-btn ${batchMode ? 'active' : ''}`}
                        onClick={batchMode ? exitBatchMode : enterBatchMode}
                        title={batchMode ? '退出批量管理' : '批量管理'}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 11 12 14 22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        {batchMode ? '退出批量' : '批量管理'}
                    </button>

                    <div className="collection-list-view-toggle">
                        <button
                            className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="卡片视图"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                            </svg>
                        </button>
                        <button
                            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="列表视图"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* 批量操作工具栏 */}
            {batchMode && (
                <BatchActionBar
                    selectedCount={selectedIds.size}
                    totalCount={collections.length}
                    isAllSelected={selectedIds.size === collections.length && collections.length > 0}
                    onSelectAll={handleSelectAll}
                    onDelete={handleBatchDelete}
                    onMoveToFolder={() => {
                        setShowFolderSelector((prev) => !prev);
                        setShowTagPicker(false);
                    }}
                    onAddTags={() => {
                        setShowTagPicker((prev) => !prev);
                        setShowFolderSelector(false);
                    }}
                    onDeepRead={handleBatchDeepRead}
                    onCancel={exitBatchMode}
                />
            )}

            {/* 内容区域 */}
            {batchLoading ? (
                <div className="collection-list-loading">
                    <div className="loading-spinner" />
                    <span>操作中...</span>
                </div>
            ) : loading ? (
                <div className={`collection-list-content ${viewMode}`}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonCard key={i} viewMode={viewMode} />
                    ))}
                </div>
            ) : collections.length === 0 ? (
                <div className="collection-list-empty">
                    <div className="collection-list-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                    </div>
                    <p>暂无收藏内容</p>
                    <Link to="/add" className="collection-list-empty-action">
                        添加第一个收藏
                    </Link>
                </div>
            ) : (
                <>
                    <div className={`collection-list-content ${viewMode}`}>
                        {collections.map((collection) => (
                            <CollectionCard
                                key={collection.id}
                                collection={collection}
                                onClick={handleCardClick}
                                onToggleFavorite={handleToggleFavorite}
                                selectable={batchMode}
                                selected={selectedIds.has(collection.id)}
                                onSelect={handleSelectItem}
                            />
                        ))}
                    </div>

                    {/* 分页 */}
                    {pagination.totalPages > 1 && (
                        <div className="collection-list-pagination">
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

            {/* 文件夹选择下拉 */}
            {showFolderSelector && (
                <div className="collection-list-dropdown-wrapper">
                    <FolderSelector
                        folders={folders}
                        onSelect={handleBatchMove}
                        onClose={() => setShowFolderSelector(false)}
                    />
                </div>
            )}

            {/* 标签选择面板 */}
            {showTagPicker && (
                <div className="collection-list-dropdown-wrapper collection-list-dropdown-right">
                    <TagPicker
                        tags={allTags}
                        onConfirm={handleBatchAddTags}
                        onClose={() => setShowTagPicker(false)}
                    />
                </div>
            )}
        </div>
    );
}
