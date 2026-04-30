/**
 * TagList 组件 - 标签列表组件
 * 支持选中标签进行筛选、编辑标签名称和颜色、删除标签
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import * as api from '../services/api';
import type { Tag } from '../types';
import './TagList.css';

/** 预设颜色列表 */
const PRESET_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

interface TagListProps {
    /** 标签列表 */
    tags: Tag[];
    /** 当前选中的标签 ID */
    selectedTagId: string | null;
    /** 选中标签回调 */
    onSelectTag: (tagId: string | null) => void;
    /** 标签变更后刷新回调 */
    onTagUpdated?: () => void;
}

/**
 * 单个标签项组件
 * 支持编辑模式和删除操作
 * @param props - 组件属性
 */
function TagItem({
    tag,
    isSelected,
    onSelectTag,
    onTagUpdated,
}: {
    tag: Tag;
    isSelected: boolean;
    onSelectTag: (tagId: string | null) => void;
    onTagUpdated?: () => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(tag.name);
    const [editColor, setEditColor] = useState(tag.color);
    const [saving, setSaving] = useState(false);
    const editInputRef = useRef<HTMLInputElement>(null);

    const { showToast, showConfirm } = useToast();

    /** 自动聚焦编辑输入框并选中文字 */
    useEffect(() => {
        if (isEditing && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [isEditing]);

    /**
     * 开始编辑标签
     */
    const handleStartEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditName(tag.name);
        setEditColor(tag.color);
        setIsEditing(true);
    };

    /**
     * 确认编辑标签
     */
    const handleConfirmEdit = useCallback(async () => {
        const name = editName.trim();
        if (!name || (name === tag.name && editColor === tag.color)) {
            setIsEditing(false);
            return;
        }

        try {
            setSaving(true);
            await api.updateTag(tag.id, { name, color: editColor });
            showToast('标签已更新', 'success');
            onTagUpdated?.();
        } catch (err) {
            console.error('更新标签失败:', err);
            showToast('更新标签失败', 'error');
        } finally {
            setSaving(false);
            setIsEditing(false);
        }
    }, [editName, editColor, tag.id, tag.name, tag.color, showToast, onTagUpdated]);

    /**
     * 取消编辑标签
     */
    const handleCancelEdit = () => {
        setIsEditing(false);
    };

    /**
     * 编辑输入框键盘事件
     */
    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirmEdit();
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    /**
     * 删除标签
     */
    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();

        const confirmed = await showConfirm({
            title: '删除标签',
            message: `确定要删除标签「${tag.name}」吗？收藏项上的此标签将被移除。`,
            danger: true,
        });

        if (!confirmed) return;

        try {
            await api.deleteTag(tag.id);
            showToast('标签已删除', 'success');
            onTagUpdated?.();
        } catch (err) {
            console.error('删除标签失败:', err);
            showToast('删除标签失败', 'error');
        }
    };

    /** 编辑模式渲染 */
    if (isEditing) {
        return (
            <div className="tag-list-edit-form">
                <input
                    ref={editInputRef}
                    className="tag-list-edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleConfirmEdit}
                    disabled={saving}
                    onClick={(e) => e.stopPropagation()}
                />
                <div className="tag-color-picker">
                    {PRESET_COLORS.map((color) => (
                        <button
                            key={color}
                            className={`tag-color-dot ${editColor === color ? 'active' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditColor(color);
                            }}
                            title={color}
                        />
                    ))}
                </div>
            </div>
        );
    }

    /** 普通模式渲染 */
    return (
        <button
            className={`tag-list-item ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectTag(isSelected ? null : tag.id)}
        >
            <span
                className="tag-list-dot"
                style={{ backgroundColor: tag.color }}
            />
            <span className="tag-list-name">{tag.name}</span>
            {tag.collectionCount !== undefined && (
                <span className="tag-list-count">{tag.collectionCount}</span>
            )}
            <span className="tag-list-item-actions">
                <button
                    className="tag-list-action-btn tag-list-edit-btn"
                    onClick={handleStartEdit}
                    title="编辑标签"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                </button>
                <button
                    className="tag-list-action-btn tag-list-delete-btn"
                    onClick={handleDelete}
                    title="删除标签"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </span>
        </button>
    );
}

/**
 * 标签列表组件
 * @param props - 组件属性
 */
export default function TagList({ tags, selectedTagId, onSelectTag, onTagUpdated }: TagListProps) {
    return (
        <div className="tag-list">
            <div className="tag-list-header">
                <span className="tag-list-header-title">标签</span>
            </div>

            <div className="tag-list-items">
                {tags.map((tag) => (
                    <TagItem
                        key={tag.id}
                        tag={tag}
                        isSelected={selectedTagId === tag.id}
                        onSelectTag={onSelectTag}
                        onTagUpdated={onTagUpdated}
                    />
                ))}

                {tags.length === 0 && (
                    <div className="tag-list-empty">暂无标签</div>
                )}
            </div>
        </div>
    );
}
