/**
 * FolderSelector 组件 - 文件夹选择下拉面板
 * 显示文件夹树形结构，支持选择目标文件夹或移至未分类
 */

import React, { useEffect, useRef } from 'react';
import type { Folder } from '../types';
import './FolderSelector.css';

interface FolderSelectorProps {
    /** 文件夹列表（树形结构） */
    folders: Folder[];
    /** 选择文件夹回调，null 表示移至未分类 */
    onSelect: (folderId: string | null) => void;
    /** 关闭面板回调 */
    onClose: () => void;
}

/**
 * 递归渲染文件夹树节点
 * @param folders - 文件夹列表
 * @param depth - 当前层级深度
 * @param onSelect - 选择回调
 */
function renderFolderTree(
    folders: Folder[],
    depth: number,
    onSelect: (folderId: string) => void,
): React.ReactNode {
    return folders.map((folder) => (
        <React.Fragment key={folder.id}>
            <button
                className="folder-selector-item"
                style={{ paddingLeft: `${12 + depth * 20}px` }}
                onClick={() => onSelect(folder.id)}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="folder-selector-item-name">{folder.name}</span>
                {folder.collectionCount !== undefined && (
                    <span className="folder-selector-item-count">
                        {folder.collectionCount}
                    </span>
                )}
            </button>
            {folder.children && folder.children.length > 0 && (
                renderFolderTree(folder.children, depth + 1, onSelect)
            )}
        </React.Fragment>
    ));
}

/**
 * 文件夹选择下拉面板组件
 * @param props - 组件属性
 */
export default function FolderSelector({ folders, onSelect, onClose }: FolderSelectorProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    /**
     * 点击外部关闭面板
     */
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    /**
     * ESC 关闭面板
     */
    useEffect(() => {
        function handleEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="folder-selector" ref={panelRef}>
            <div className="folder-selector-header">移动到文件夹</div>

            <button
                className="folder-selector-item folder-selector-uncategorized"
                onClick={() => onSelect(null)}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                </svg>
                <span className="folder-selector-item-name">未分类</span>
            </button>

            <div className="folder-selector-divider" />

            <div className="folder-selector-list">
                {folders.length === 0 ? (
                    <div className="folder-selector-empty">暂无文件夹</div>
                ) : (
                    renderFolderTree(folders, 0, (id) => onSelect(id))
                )}
            </div>
        </div>
    );
}
