/**
 * TagManageModal 组件 - 标签管理弹窗
 * 提供标签的编辑名称、颜色和删除功能
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import * as api from '../services/api';
import type { Tag } from '../types';
import './TagManageModal.css';

/** 预设颜色列表 */
const PRESET_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

interface TagManageModalProps {
    tags: Tag[];
    onClose: () => void;
    /** 标签变更后刷新回调（支持 async） */
    onTagUpdated?: () => void | Promise<void>;
}

/**
 * 标签管理弹窗组件
 * @param props - 组件属性
 */
export default function TagManageModal({ tags, onClose, onTagUpdated }: TagManageModalProps) {
    const { showToast, showConfirm } = useToast();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    // 创建标签状态
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createColor, setCreateColor] = useState(PRESET_COLORS[0]);
    const [creating, setCreating] = useState(false);
    const createInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingId]);

    useEffect(() => {
        if (showCreate && createInputRef.current) {
            createInputRef.current.focus();
        }
    }, [showCreate]);

    /**
     * 创建标签
     */
    const handleCreate = useCallback(async () => {
        const name = createName.trim();
        if (!name) {
            showToast('标签名称不能为空', 'warning');
            return;
        }

        try {
            setCreating(true);
            await api.createTag({ name, color: createColor });
            showToast('标签已创建', 'success');
            await onTagUpdated?.();
            setCreateName('');
            setCreateColor(PRESET_COLORS[0]);
            setShowCreate(false);
        } catch (err) {
            console.error('创建标签失败:', err);
            showToast('创建标签失败', 'error');
        } finally {
            setCreating(false);
        }
    }, [createName, createColor, showToast, onTagUpdated]);

    /**
     * 创建标签输入框键盘事件
     */
    const handleCreateKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCreate();
        } else if (e.key === 'Escape') {
            setShowCreate(false);
            setCreateName('');
        }
    };

    /**
     * 开始编辑标签
     */
    const handleStartEdit = (tag: Tag) => {
        setEditingId(tag.id);
        setEditName(tag.name);
        setEditColor(tag.color);
    };

    /**
     * 取消编辑
     */
    const handleCancelEdit = () => {
        setEditingId(null);
    };

    /**
     * 确认编辑标签
     */
    const handleConfirmEdit = useCallback(async () => {
        if (!editingId) return;

        const name = editName.trim();
        if (!name) {
            setEditingId(null);
            return;
        }

        try {
            setSaving(true);
            await api.updateTag(editingId, { name, color: editColor });
            showToast('标签已更新', 'success');
            await onTagUpdated?.();
            setEditingId(null);
        } catch (err) {
            console.error('更新标签失败:', err);
            showToast('更新标签失败', 'error');
        } finally {
            setSaving(false);
        }
    }, [editingId, editName, editColor, showToast, onTagUpdated]);

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
    const handleDelete = async (tag: Tag) => {
        const confirmed = await showConfirm({
            title: '删除标签',
            message: `确定要删除标签「${tag.name}」吗？收藏项上的此标签将被移除。`,
            danger: true,
        });

        if (!confirmed) return;

        try {
            setDeleting(tag.id);
            await api.deleteTag(tag.id);
            showToast('标签已删除', 'success');
            await onTagUpdated?.();
        } catch (err) {
            console.error('删除标签失败:', err);
            showToast('删除标签失败', 'error');
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="tag-manage-overlay" onClick={onClose}>
            <div className="tag-manage-modal" onClick={(e) => e.stopPropagation()}>
                <div className="tag-manage-header">
                    <h3>标签管理</h3>
                    <div className="tag-manage-header-actions">
                        <button className="tag-manage-create-btn" onClick={() => setShowCreate(true)} title="新建标签">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            新建
                        </button>
                        <button className="tag-manage-close-btn" onClick={onClose} title="关闭">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="tag-manage-body">
                    {/* 创建标签表单 */}
                    {showCreate && (
                        <div className="tag-manage-create-form">
                            <input
                                ref={createInputRef}
                                className="tag-manage-edit-input"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                onKeyDown={handleCreateKeyDown}
                                disabled={creating}
                                placeholder="输入标签名称..."
                            />
                            <div className="tag-manage-color-picker">
                                {PRESET_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        className={`tag-manage-color-dot ${createColor === color ? 'active' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => setCreateColor(color)}
                                        title={color}
                                    />
                                ))}
                            </div>
                            <button
                                className="tag-manage-edit-confirm"
                                onClick={handleCreate}
                                disabled={creating}
                                title="确认创建"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </button>
                            <button
                                className="tag-manage-edit-cancel"
                                onClick={() => { setShowCreate(false); setCreateName(''); }}
                                disabled={creating}
                                title="取消"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {tags.length === 0 && !showCreate ? (
                        <div className="tag-manage-empty">暂无标签</div>
                    ) : (
                        tags.map((tag) => (
                            <div key={tag.id} className="tag-manage-item">
                                {editingId === tag.id ? (
                                    <div className="tag-manage-edit-form">
                                        <input
                                            ref={editInputRef}
                                            className="tag-manage-edit-input"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onKeyDown={handleEditKeyDown}
                                            disabled={saving}
                                        />
                                        <div className="tag-manage-color-picker">
                                            {PRESET_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    className={`tag-manage-color-dot ${editColor === color ? 'active' : ''}`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => setEditColor(color)}
                                                    title={color}
                                                />
                                            ))}
                                        </div>
                                        <button
                                            className="tag-manage-edit-confirm"
                                            onClick={handleConfirmEdit}
                                            disabled={saving}
                                            title="确认"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </button>
                                        <button
                                            className="tag-manage-edit-cancel"
                                            onClick={handleCancelEdit}
                                            disabled={saving}
                                            title="取消"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="tag-manage-item-dot" style={{ backgroundColor: tag.color }} />
                                        <span className="tag-manage-item-name">{tag.name}</span>
                                        {tag.collectionCount !== undefined && (
                                            <span className="tag-manage-item-count">{tag.collectionCount}</span>
                                        )}
                                        <span className="tag-manage-item-actions">
                                            <button
                                                className="tag-manage-action-btn edit"
                                                onClick={() => handleStartEdit(tag)}
                                                title="编辑标签"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                </svg>
                                            </button>
                                            <button
                                                className="tag-manage-action-btn delete"
                                                onClick={() => handleDelete(tag)}
                                                disabled={deleting === tag.id}
                                                title="删除标签"
                                            >
                                                {deleting === tag.id ? (
                                                    <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                                ) : (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                )}
                                            </button>
                                        </span>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="tag-manage-footer">
                    <button className="tag-manage-done-btn" onClick={onClose}>
                        完成
                    </button>
                </div>
            </div>
        </div>
    );
}
