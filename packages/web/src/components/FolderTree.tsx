/**
 * FolderTree 组件 - 文件夹树形组件
 * 支持展开/折叠、选中、创建子文件夹、重命名、删除
 * 支持文件夹拖拽排序
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../contexts/ToastContext';
import * as api from '../services/api';
import type { Folder } from '../types';
import './FolderTree.css';

const ITEM_BASE_PADDING = 24;
const DEPTH_INDENT = 16;

/**
 * 递归计算文件夹及其子级的收藏总数
 */
function totalCollectionCount(folder: Folder): number {
    const direct = folder.collectionCount ?? 0;
    const childTotal = folder.children?.reduce(
        (sum, c) => sum + totalCollectionCount(c), 0
    ) ?? 0;
    return direct + childTotal;
}

interface FolderTreeProps {
    /** 文件夹树数据 */
    folders: Folder[];
    /** 当前选中的文件夹 ID */
    selectedFolderId: string | null;
    /** 选中文件夹回调 */
    onSelectFolder: (folderId: string | null) => void;
    /** 创建文件夹回调 */
    onCreateFolder: (parentId: string | null) => void;
    /** 文件夹排序完成回调 */
    onFolderReorder?: (folderId: string, newSortOrder: number) => void;
    /** 文件夹变更后刷新回调 */
    onFolderUpdated?: () => void;
}

/**
 * 文件夹树节点组件
 * 支持 Sortable（文件夹排序）
 * @param props - 组件属性
 */
function FolderTreeNode({
    folder,
    selectedFolderId,
    onSelectFolder,
    onCreateFolder,
    onFolderReorder,
    onFolderUpdated,
    depth,
    activeMenuId,
    setActiveMenuId,
}: {
    folder: Folder;
    selectedFolderId: string | null;
    onSelectFolder: (folderId: string | null) => void;
    onCreateFolder: (parentId: string | null) => void;
    onFolderReorder?: (folderId: string, newSortOrder: number) => void;
    onFolderUpdated?: () => void;
    depth: number;
    activeMenuId: string | null;
    setActiveMenuId: (id: string | null) => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(folder.name);
    const [renaming, setRenaming] = useState(false);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const { showToast, showConfirm } = useToast();
    const hasChildren = folder.children && folder.children.length > 0;
    const isSelected = selectedFolderId === folder.id;
    const isMenuOpen = activeMenuId === folder.id;

    // 排序：文件夹拖拽排序
    const {
        attributes: _sortableAttributes,
        isDragging: isSorting,
        listeners: sortableListeners,
        setNodeRef: setSortableRef,
        setActivatorNodeRef: setDragHandleRef,
        transform: sortableTransform,
        transition: sortableTransition,
    } = useSortable({
        id: `folder-sort-${folder.id}`,
        data: { type: 'folder-sort', folder },
        disabled: !onFolderReorder,
    });

    /** 自动聚焦重命名输入框并选中文字 */
    useEffect(() => {
        if (isRenaming && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isRenaming]);

    /** 点击菜单外部关闭 */
    useEffect(() => {
        if (!isMenuOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setActiveMenuId(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const sortableStyle: React.CSSProperties = {
        transform: CSS.Translate.toString(sortableTransform),
        transition: sortableTransition,
        opacity: isSorting ? 0.5 : 1,
    };

    const handleClick = () => {
        if (isRenaming) return;
        onSelectFolder(folder.id);
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    /**
     * 切换操作菜单
     */
    const handleMenuToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(isMenuOpen ? null : folder.id);
    };

    /**
     * 开始重命名
     */
    const handleStartRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRenameValue(folder.name);
        setIsRenaming(true);
        setActiveMenuId(null);
    };

    /**
     * 确认重命名
     */
    const handleConfirmRename = useCallback(async () => {
        const name = renameValue.trim();
        if (!name || name === folder.name) {
            setIsRenaming(false);
            return;
        }

        try {
            setRenaming(true);
            await api.updateFolder(folder.id, { name });
            showToast('重命名成功', 'success');
            onFolderUpdated?.();
        } catch (err) {
            console.error('重命名失败:', err);
            showToast('重命名失败', 'error');
        } finally {
            setRenaming(false);
            setIsRenaming(false);
        }
    }, [renameValue, folder.id, folder.name, showToast, onFolderUpdated]);

    /**
     * 取消重命名
     */
    const handleCancelRename = () => {
        setIsRenaming(false);
        setRenameValue(folder.name);
    };

    /**
     * 重命名输入框键盘事件
     */
    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirmRename();
        } else if (e.key === 'Escape') {
            handleCancelRename();
        }
    };

    /**
     * 删除文件夹
     */
    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(null);

        const confirmed = await showConfirm({
            title: '删除文件夹',
            message: `确定要删除「${folder.name}」吗？其中的收藏将移至未分类。`,
            danger: true,
        });

        if (!confirmed) return;

        try {
            await api.deleteFolder(folder.id);
            showToast('文件夹已删除', 'success');
            onFolderUpdated?.();
        } catch (err) {
            console.error('删除文件夹失败:', err);
            showToast('删除文件夹失败', 'error');
        }
    };

    /**
     * 新建子文件夹
     */
    const handleCreateSubFolder = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(null);
        onCreateFolder(folder.id);
    };

    return (
        <li className="folder-tree-node">
            <div
                ref={setSortableRef}
                className={`folder-tree-item ${isSelected ? 'selected' : ''} ${hasChildren && expanded ? 'expanded' : ''}`}
                style={{ ...sortableStyle, paddingLeft: ITEM_BASE_PADDING + depth * DEPTH_INDENT }}
                onClick={handleClick}
            >
                {/* 拖拽排序手柄 */}
                {onFolderReorder && (
                    <button
                        className="folder-tree-drag-handle"
                        ref={setDragHandleRef}
                        {...sortableListeners}
                        onClick={(e) => e.stopPropagation()}
                        title="拖拽排序"
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <circle cx="9" cy="6" r="2" />
                            <circle cx="15" cy="6" r="2" />
                            <circle cx="9" cy="12" r="2" />
                            <circle cx="15" cy="12" r="2" />
                            <circle cx="9" cy="18" r="2" />
                            <circle cx="15" cy="18" r="2" />
                        </svg>
                    </button>
                )}

                <button
                    className={`folder-tree-toggle ${!hasChildren ? 'invisible' : ''}`}
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
                </button>

                <svg
                    className="folder-tree-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={hasChildren && expanded ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth={hasChildren && expanded ? 1 : 2}
                >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>

                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        className="folder-tree-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={handleConfirmRename}
                        disabled={renaming}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="folder-tree-name" title={folder.name}>
                        {folder.name}
                    </span>
                )}

                {totalCollectionCount(folder) > 0 && !isRenaming && (
                    <span className="folder-tree-count">{totalCollectionCount(folder)}</span>
                )}

                {/* 操作按钮区域 */}
                {!isRenaming && (
                    <div className="folder-tree-item-actions">
                        <button
                            className="folder-tree-add-btn"
                            onClick={handleCreateSubFolder}
                            title="新建子文件夹"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </button>

                        <button
                            className="folder-tree-more-btn"
                            onClick={handleMenuToggle}
                            title="更多操作"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* 下拉菜单 */}
                {isMenuOpen && (
                    <div className="folder-tree-context-menu" ref={menuRef}>
                        <button onClick={handleStartRename}>重命名</button>
                        <button onClick={handleCreateSubFolder}>新建子文件夹</button>
                        <button className="danger" onClick={handleDelete}>删除</button>
                    </div>
                )}
            </div>

            {hasChildren && expanded && (
                <ul className="folder-tree-children">
                    {folder.children!.map((child) => (
                        <FolderTreeNode
                            key={child.id}
                            folder={child}
                            selectedFolderId={selectedFolderId}
                            onSelectFolder={onSelectFolder}
                            onCreateFolder={onCreateFolder}
                            onFolderReorder={onFolderReorder}
                            onFolderUpdated={onFolderUpdated}
                            depth={depth + 1}
                            activeMenuId={activeMenuId}
                            setActiveMenuId={setActiveMenuId}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

/**
 * 文件夹树组件
 * @param props - 组件属性
 */
export default function FolderTree({
    folders,
    selectedFolderId,
    onSelectFolder,
    onCreateFolder,
    onFolderReorder,
    onFolderUpdated,
}: FolderTreeProps) {
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    return (
        <div className="folder-tree">
            <div className="folder-tree-header">
                <span className="folder-tree-header-title">文件夹</span>
                <button
                    className="folder-tree-header-add"
                    onClick={() => onCreateFolder(null)}
                    title="新建文件夹"
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>

            <ul className="folder-tree-list">
                {folders.map((folder) => (
                    <FolderTreeNode
                        key={folder.id}
                        folder={folder}
                        selectedFolderId={selectedFolderId}
                        onSelectFolder={onSelectFolder}
                        onCreateFolder={onCreateFolder}
                        onFolderReorder={onFolderReorder}
                        onFolderUpdated={onFolderUpdated}
                        depth={0}
                        activeMenuId={activeMenuId}
                        setActiveMenuId={setActiveMenuId}
                    />
                ))}
            </ul>
        </div>
    );
}
