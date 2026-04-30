/**
 * TagPicker 组件 - 标签多选弹出面板
 * 显示所有标签供用户多选，确认后触发批量操作
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Tag } from '../types';
import './TagPicker.css';

interface TagPickerProps {
    /** 所有可选标签 */
    tags: Tag[];
    /** 确认选择回调，传入选中的标签 ID 列表 */
    onConfirm: (tagIds: string[]) => void;
    /** 关闭面板回调 */
    onClose: () => void;
}

/**
 * 标签多选弹出面板组件
 * @param props - 组件属性
 */
export default function TagPicker({ tags, onConfirm, onClose }: TagPickerProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

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

    /**
     * 切换标签选中状态
     * @param tagId - 标签 ID
     */
    const handleToggleTag = (tagId: string) => {
        setSelectedTagIds((prev) => {
            const next = new Set(prev);
            if (next.has(tagId)) {
                next.delete(tagId);
            } else {
                next.add(tagId);
            }
            return next;
        });
    };

    /**
     * 确认选择
     */
    const handleConfirm = () => {
        onConfirm(Array.from(selectedTagIds));
        onClose();
    };

    return (
        <div className="tag-picker" ref={panelRef}>
            <div className="tag-picker-header">
                <span>添加标签</span>
                {selectedTagIds.size > 0 && (
                    <span className="tag-picker-selected-count">
                        已选 {selectedTagIds.size} 个
                    </span>
                )}
            </div>

            <div className="tag-picker-list">
                {tags.length === 0 ? (
                    <div className="tag-picker-empty">暂无标签</div>
                ) : (
                    tags.map((tag) => (
                        <button
                            key={tag.id}
                            className={`tag-picker-item ${selectedTagIds.has(tag.id) ? 'selected' : ''}`}
                            onClick={() => handleToggleTag(tag.id)}
                        >
                            <span
                                className="tag-picker-item-dot"
                                style={{ backgroundColor: tag.color }}
                            />
                            <span className="tag-picker-item-name">{tag.name}</span>
                            {selectedTagIds.has(tag.id) && (
                                <svg
                                    className="tag-picker-item-check"
                                    width="14" height="14" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" strokeWidth="2"
                                >
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </button>
                    ))
                )}
            </div>

            <div className="tag-picker-footer">
                <button className="tag-picker-btn tag-picker-btn-cancel" onClick={onClose}>
                    取消
                </button>
                <button
                    className="tag-picker-btn tag-picker-btn-confirm"
                    onClick={handleConfirm}
                    disabled={selectedTagIds.size === 0}
                >
                    确认添加
                </button>
            </div>
        </div>
    );
}
