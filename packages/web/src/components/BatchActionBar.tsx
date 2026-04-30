/**
 * BatchActionBar 组件 - 批量操作工具栏
 * 固定在列表顶部，提供全选、删除、移动、打标签等批量操作
 */

import React from 'react';
import './BatchActionBar.css';

interface BatchActionBarProps {
    /** 已选中的数量 */
    selectedCount: number;
    /** 列表总数量 */
    totalCount: number;
    /** 是否全选 */
    isAllSelected: boolean;
    /** 全选/取消全选回调 */
    onSelectAll: () => void;
    /** 批量删除回调 */
    onDelete: () => void;
    /** 移动到文件夹回调 */
    onMoveToFolder: () => void;
    /** 添加标签回调 */
    onAddTags: () => void;
    /** 取消批量模式回调 */
    onCancel: () => void;
}

/**
 * 批量操作工具栏组件
 * @param props - 组件属性
 */
export default function BatchActionBar({
    selectedCount,
    totalCount,
    isAllSelected,
    onSelectAll,
    onDelete,
    onMoveToFolder,
    onAddTags,
    onCancel,
}: BatchActionBarProps) {
    return (
        <div className="batch-action-bar">
            <div className="batch-action-bar-left">
                <span className="batch-action-bar-count">
                    已选 {selectedCount} 项
                </span>
                <button
                    className="batch-action-bar-btn batch-action-bar-btn-text"
                    onClick={onSelectAll}
                >
                    {isAllSelected ? '取消全选' : '全选'}
                </button>
            </div>

            <div className="batch-action-bar-right">
                <button
                    className="batch-action-bar-btn batch-action-bar-btn-danger"
                    onClick={onDelete}
                    disabled={selectedCount === 0}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    批量删除
                </button>

                <button
                    className="batch-action-bar-btn"
                    onClick={onMoveToFolder}
                    disabled={selectedCount === 0}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    移动到文件夹
                </button>

                <button
                    className="batch-action-bar-btn"
                    onClick={onAddTags}
                    disabled={selectedCount === 0}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                        <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    添加标签
                </button>

                <button
                    className="batch-action-bar-btn batch-action-bar-btn-cancel"
                    onClick={onCancel}
                >
                    取消
                </button>
            </div>
        </div>
    );
}
