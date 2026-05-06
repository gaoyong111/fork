/**
 * Sidebar 页面组件 - 侧边栏
 * 包含全部收藏入口、文件夹树和标签列表
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import FolderTree from '../components/FolderTree';
import TagList from '../components/TagList';
import TagManageModal from '../components/TagManageModal';
import { useToast } from '../contexts/ToastContext';
import type { Folder, Tag } from '../types';
import * as api from '../services/api';
import './Sidebar.css';

interface SidebarProps {
    /** 文件夹排序完成回调 */
    onFolderReorder?: (folderId: string, newSortOrder: number) => void;
}

/**
 * 侧边栏页面组件
 * 提供文件夹导航、标签筛选和全部收藏入口
 */
export default function Sidebar({ onFolderReorder }: SidebarProps) {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { showToast } = useToast();

    const [folders, setFolders] = useState<Folder[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [trashCount, setTrashCount] = useState(0);
    const [showTagManage, setShowTagManage] = useState(false);

    // 内联创建文件夹状态
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [createParentId, setCreateParentId] = useState<string | null>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const currentFolderId = searchParams.get('folder') || null;
    const currentTagId = searchParams.get('tag') || null;
    const showFavorites = searchParams.get('favorite') === 'true';

    useEffect(() => {
        loadSidebarData();
    }, []);

    /**
     * 静默刷新侧边栏数据（不显示加载状态，避免闪烁）
     */
    async function refreshSidebarData() {
        try {
            const [folderData, tagData, trashData] = await Promise.all([
                api.getFolderTree(),
                api.getTags(),
                api.getTrashCollections({ page: 1, pageSize: 1 }).catch(() => null),
            ]);
            setFolders(folderData);
            setTags(tagData);
            if (trashData) {
                setTrashCount(trashData.pagination.total);
            }
        } catch (err) {
            console.error('刷新侧边栏数据失败:', err);
        }
    }

    /**
     * 监听回收站数据变更事件，静默刷新
     */
    useEffect(() => {
        const handleTrashUpdated = () => {
            refreshSidebarData();
        };
        window.addEventListener('trash-updated', handleTrashUpdated);
        return () => window.removeEventListener('trash-updated', handleTrashUpdated);
    }, []);

    /**
     * 离开回收站页面时静默刷新
     */
    const prevPathRef = useRef(location.pathname);
    useEffect(() => {
        const prevPath = prevPathRef.current;
        prevPathRef.current = location.pathname;
        if (prevPath === '/trash' && location.pathname !== '/trash') {
            refreshSidebarData();
        }
    }, [location.pathname]);

    /**
     * 加载侧边栏数据（首次加载，带 loading 状态）
     */
    async function loadSidebarData() {
        try {
            setLoading(true);
            const [folderData, tagData, trashData] = await Promise.all([
                api.getFolderTree(),
                api.getTags(),
                api.getTrashCollections({ page: 1, pageSize: 1 }).catch(() => null),
            ]);
            setFolders(folderData);
            setTags(tagData);
            if (trashData) {
                setTrashCount(trashData.pagination.total);
            }
        } catch (err) {
            console.error('加载侧边栏数据失败:', err);
        } finally {
            setLoading(false);
        }
    }

    /**
     * 选中文件夹
     */
    const handleSelectFolder = (folderId: string | null) => {
        const newParams = new URLSearchParams();
        if (folderId) {
            newParams.set('folder', folderId);
        }
        const qs = newParams.toString();
        navigate(qs ? `/?${qs}` : '/');
    };

    /**
     * 选中标签
     */
    const handleSelectTag = (tagId: string | null) => {
        const newParams = new URLSearchParams();
        if (tagId) {
            newParams.set('tag', tagId);
        }
        const qs = newParams.toString();
        navigate(qs ? `/?${qs}` : '/');
    };

    /**
     * 显示全部收藏
     */
    const handleShowAll = () => {
        navigate('/');
    };

    /**
     * 显示星标收藏
     */
    const handleShowFavorites = () => {
        navigate('/?favorite=true');
    };

    /**
     * 开始创建文件夹（显示内联输入框）
     * @param parentId - 父文件夹 ID，null 表示根目录
     */
    const handleCreateFolder = (parentId: string | null) => {
        setCreateParentId(parentId);
        setNewFolderName('');
        setIsCreatingFolder(true);
    };

    /**
     * 自动聚焦内联输入框
     */
    useEffect(() => {
        if (isCreatingFolder && folderInputRef.current) {
            folderInputRef.current.focus();
        }
    }, [isCreatingFolder]);

    /**
     * 确认创建文件夹
     */
    const handleConfirmCreateFolder = async () => {
        const name = newFolderName.trim();
        if (!name) {
            setIsCreatingFolder(false);
            return;
        }

        try {
            setCreatingFolder(true);
            await api.createFolder({ name, parentId: createParentId ?? undefined });
            showToast('文件夹创建成功', 'success');
            await loadSidebarData();
        } catch (err) {
            console.error('创建文件夹失败:', err);
            showToast('创建文件夹失败', 'error');
        } finally {
            setCreatingFolder(false);
            setIsCreatingFolder(false);
        }
    };

    /**
     * 取消创建文件夹
     */
    const handleCancelCreateFolder = () => {
        setIsCreatingFolder(false);
        setNewFolderName('');
    };

    /**
     * 内联输入框键盘事件处理
     */
    const handleFolderInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirmCreateFolder();
        } else if (e.key === 'Escape') {
            handleCancelCreateFolder();
        }
    };

    if (loading) {
        return (
            <div className="sidebar">
                <div className="sidebar-loading">加载中...</div>
            </div>
        );
    }

    return (
        <div className="sidebar">
            {/* 快捷入口 */}
            <div className="sidebar-nav">
                <button
                    className={`sidebar-nav-item ${!currentFolderId && !currentTagId && !showFavorites ? 'active' : ''}`}
                    onClick={handleShowAll}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>全部收藏</span>
                </button>

                <button
                    className={`sidebar-nav-item ${showFavorites ? 'active' : ''}`}
                    onClick={handleShowFavorites}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>星标收藏</span>
                </button>
            </div>

            {/* 文件夹树 */}
            <FolderTree
                folders={folders}
                selectedFolderId={currentFolderId}
                onSelectFolder={handleSelectFolder}
                onCreateFolder={handleCreateFolder}
                onFolderReorder={onFolderReorder}
                onFolderUpdated={loadSidebarData}
            />

            {/* 内联创建文件夹输入框 */}
            {isCreatingFolder && (
                <div className="sidebar-inline-folder">
                    <input
                        ref={folderInputRef}
                        type="text"
                        className="sidebar-inline-folder-input"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={handleFolderInputKeyDown}
                        onBlur={handleCancelCreateFolder}
                        placeholder="输入文件夹名称..."
                        disabled={creatingFolder}
                    />
                    {creatingFolder && <span className="sidebar-inline-folder-loading" />}
                </div>
            )}

            {/* 标签列表 */}
            <TagList
                tags={tags}
                selectedTagId={currentTagId}
                onSelectTag={handleSelectTag}
                onManageTags={() => setShowTagManage(true)}
            />

            {/* 回收站入口 - 固定在底部 */}
            <div className="sidebar-trash">
                <button
                    className={`sidebar-nav-item ${location.pathname === '/trash' ? 'active' : ''}`}
                    onClick={() => navigate('/trash')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>回收站</span>
                    {trashCount > 0 && (
                        <span className="sidebar-trash-badge">{trashCount}</span>
                    )}
                </button>
            </div>

            {showTagManage && (
                <TagManageModal
                    tags={tags}
                    onClose={() => setShowTagManage(false)}
                    onTagUpdated={refreshSidebarData}
                />
            )}
        </div>
    );
}
