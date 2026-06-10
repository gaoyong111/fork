/**
 * TagPopover 组件 - 统一标签选择/添加交互
 * 支持三种 mode：inline（表单内）、trigger（批量操作）、always-open（弹窗内）
 * 提供搜索过滤、点击切换、内联创建标签、颜色选择
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Tag } from '../types';
import './TagPopover.css';

/** 统一预设颜色（9色） */
export const PRESET_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

/** Popover 下方最小可用空间（px），低于此值时改为上弹 */
const POPOVER_MIN_BOTTOM_SPACE = 300;

interface TagPopoverProps {
    /** 所有可选标签 */
    tags: Tag[];
    /** 已选中的标签 ID 列表 */
    selectedTagIds: string[];
    /** 选中变化回调 */
    onChange: (tagIds: string[]) => void;
    /** 创建新标签回调，需返回创建的 Tag 对象 */
    onCreateTag?: (name: string, color: string) => Promise<Tag>;
    /** 渲染模式 */
    mode: 'inline' | 'trigger' | 'always-open';
    /** 外部控制是否打开（mode=trigger 时使用） */
    open?: boolean;
    /** 关闭回调 */
    onClose?: () => void;
    /** 批量模式显示底部确认栏 */
    showFooter?: boolean;
    /** 批量确认回调 */
    onConfirm?: (tagIds: string[]) => void;
    /** popover 对齐方向 */
    anchorAlign?: 'left' | 'right';
}

/**
 * 统一标签选择/添加弹出组件
 * @param props - 组件属性
 */
export default function TagPopover({
    tags,
    selectedTagIds,
    onChange,
    onCreateTag,
    mode,
    open,
    onClose,
    showFooter,
    onConfirm,
    anchorAlign = 'left',
}: TagPopoverProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [direction, setDirection] = useState<'down' | 'up'>('down');
    const isPopoverOpen = mode === 'always-open' || (mode === 'trigger' ? open : internalOpen);

    const [searchQuery, setSearchQuery] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createColor, setCreateColor] = useState(PRESET_COLORS[0]);
    const [creating, setCreating] = useState(false);
    const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const createInputRef = useRef<HTMLInputElement>(null);

    // 批量模式：打开时初始化 localSelectedIds
    useEffect(() => {
        if (showFooter && isPopoverOpen) {
            setLocalSelectedIds(new Set(selectedTagIds));
        }
    }, [isPopoverOpen, showFooter]);

    /**
     * 打开时计算 popover 方向：下方空间不足时改为上弹
     */
    useEffect(() => {
        if (mode === 'always-open' || !isPopoverOpen) return;
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const bottomSpace = window.innerHeight - rect.bottom;
        setDirection(bottomSpace < POPOVER_MIN_BOTTOM_SPACE ? 'up' : 'down');
    }, [isPopoverOpen, mode]);

    // 打开时自动聚焦搜索框
    useEffect(() => {
        if (isPopoverOpen && !isCreating && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isPopoverOpen, isCreating]);

    // 创建模式时聚焦创建输入框
    useEffect(() => {
        if (isCreating && createInputRef.current) {
            createInputRef.current.focus();
        }
    }, [isCreating]);

    // 点击外部关闭（inline 和 trigger 模式）
    useEffect(() => {
        if (mode === 'always-open' || !isPopoverOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                handleClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isPopoverOpen, mode]);

    // ESC 关闭
    useEffect(() => {
        if (mode === 'always-open') return;
        if (!isPopoverOpen) return;

        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isCreating) {
                    setIsCreating(false);
                    setCreateName('');
                } else {
                    handleClose();
                }
            }
        };

        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isPopoverOpen, isCreating, mode]);

    const handleClose = () => {
        if (mode === 'trigger') {
            onClose?.();
        } else {
            setInternalOpen(false);
        }
        setSearchQuery('');
        setIsCreating(false);
        setCreateName('');
    };

    const handleToggle = (tagId: string) => {
        if (showFooter) {
            // 批量模式：更新 localSelectedIds
            setLocalSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(tagId)) {
                    next.delete(tagId);
                } else {
                    next.add(tagId);
                }
                return next;
            });
        } else {
            // 直接模式：立即回调 onChange
            if (selectedTagIds.includes(tagId)) {
                onChange(selectedTagIds.filter((id) => id !== tagId));
            } else {
                onChange([...selectedTagIds, tagId]);
            }
        }
    };

    /**
     * 开始创建标签
     */
    const startCreate = (initialName?: string) => {
        setCreateName(initialName || '');
        setCreateColor(PRESET_COLORS[0]);
        setIsCreating(true);
    };

    /**
     * 确认创建标签
     */
    const handleConfirmCreate = useCallback(async () => {
        const name = createName.trim();
        if (!name || !onCreateTag) return;

        try {
            setCreating(true);
            const newTag = await onCreateTag(name, createColor);
            // 自动选中新创建的标签
            if (showFooter) {
                setLocalSelectedIds((prev) => new Set([...prev, newTag.id]));
            } else {
                onChange([...selectedTagIds, newTag.id]);
            }
            setIsCreating(false);
            setCreateName('');
            setSearchQuery('');
        } catch (err) {
            console.error('创建标签失败:', err);
        } finally {
            setCreating(false);
        }
    }, [createName, createColor, onCreateTag, showFooter, selectedTagIds, onChange]);

    /**
     * 搜索键盘事件
     */
    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchQuery.trim().toLowerCase();
            const exactMatch = filteredTags.find((t) => t.name.toLowerCase() === query);
            if (exactMatch) {
                handleToggle(exactMatch.id);
                setSearchQuery('');
            } else if (query && onCreateTag) {
                startCreate(searchQuery.trim());
            }
        }
    };

    /**
     * 创建输入框键盘事件
     */
    const handleCreateKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirmCreate();
        } else if (e.key === 'Escape') {
            setIsCreating(false);
            setCreateName('');
        }
    };

    /**
     * 批量确认
     */
    const handleFooterConfirm = () => {
        onConfirm?.(Array.from(localSelectedIds));
        handleClose();
    };

    // 过滤标签
    const query = searchQuery.trim().toLowerCase();
    const filteredTags = query
        ? tags.filter((t) => t.name.toLowerCase().includes(query))
        : tags;

    const isSelected = (id: string) =>
        showFooter ? localSelectedIds.has(id) : selectedTagIds.includes(id);

    // 搜索无匹配且可创建 → 显示创建选项
    const showCreateOption = query
        && !filteredTags.some((t) => t.name.toLowerCase() === query)
        && onCreateTag
        && !isCreating;

    // ==================== 渲染 ====================

    // always-open 模式：直接渲染 popover body
    if (mode === 'always-open') {
        return (
            <div className="tag-popover-always-open">
                {renderPopoverBody()}
            </div>
        );
    }

    // inline 模式：渲染触发区 + popover
    if (mode === 'inline') {
        const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

        return (
            <div className="tag-popover-inline" ref={containerRef}>
                <div className="tag-popover-trigger" onClick={() => setInternalOpen(!internalOpen)}>
                    {selectedTags.length > 0 ? (
                        selectedTags.map((tag) => (
                            <span
                                key={tag.id}
                                className="tag-popover-selected-tag"
                                style={{
                                    backgroundColor: tag.color + '18',
                                    borderColor: tag.color,
                                    color: tag.color,
                                }}
                            >
                                {tag.name}
                            </span>
                        ))
                    ) : (
                        <span className="tag-popover-placeholder">选择标签...</span>
                    )}
                    <button className="tag-popover-add-btn" title="添加标签">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>

                {isPopoverOpen && (
                    <div className={`tag-popover-body ${anchorAlign === 'right' ? 'align-right' : 'align-left'} ${direction === 'up' ? 'direction-up' : ''}`}>
                        {renderPopoverBody()}
                    </div>
                )}
            </div>
        );
    }

    // trigger 模式：只渲染 popover body（外部控制 open）
    return (
        <div className={`tag-popover-trigger-wrap ${anchorAlign === 'right' ? 'align-right' : 'align-left'}`} ref={containerRef}>
            {isPopoverOpen && (
                <div className={`tag-popover-body ${direction === 'up' ? 'direction-up' : ''}`}>
                    {renderPopoverBody()}
                </div>
            )}
        </div>
    );

    // ==================== Popover Body（共享渲染） ====================

    function renderPopoverBody() {
        return (
            <>
                {/* 搜索框 */}
                <div className="tag-popover-search">
                    <svg className="tag-popover-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="tag-popover-search-input"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="搜索或新建标签..."
                    />
                </div>

                {/* 标签列表 */}
                <div className="tag-popover-list">
                    {filteredTags.length === 0 && !showCreateOption && !isCreating && (
                        <div className="tag-popover-empty">
                            {query ? `未找到"${searchQuery.trim()}"相关标签` : '暂无标签'}
                        </div>
                    )}
                    {filteredTags.map((tag) => (
                        <button
                            key={tag.id}
                            className={`tag-popover-item ${isSelected(tag.id) ? 'selected' : ''}`}
                            onClick={() => handleToggle(tag.id)}
                        >
                            <span
                                className="tag-popover-item-dot"
                                style={{ backgroundColor: tag.color }}
                            />
                            <span className="tag-popover-item-name">{tag.name}</span>
                            {isSelected(tag.id) && (
                                <svg className="tag-popover-item-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </button>
                    ))}

                    {/* 搜索无匹配 → 创建选项 */}
                    {showCreateOption && (
                        <button
                            className="tag-popover-item tag-popover-create-option"
                            onClick={() => startCreate(searchQuery.trim())}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            <span>创建标签「{searchQuery.trim()}」</span>
                        </button>
                    )}
                </div>

                {/* 内联创建区 */}
                {isCreating && (
                    <div className="tag-popover-create">
                        <input
                            ref={createInputRef}
                            className="tag-popover-create-input"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            onKeyDown={handleCreateKeyDown}
                            disabled={creating}
                            placeholder="标签名称"
                        />
                        <div className="tag-popover-color-picker">
                            {PRESET_COLORS.map((color) => (
                                <button
                                    key={color}
                                    className={`tag-popover-color-dot ${createColor === color ? 'active' : ''}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setCreateColor(color)}
                                    title={color}
                                />
                            ))}
                        </div>
                        <button
                            className="tag-popover-create-confirm"
                            onClick={handleConfirmCreate}
                            disabled={creating || !createName.trim()}
                            title="确认创建"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </button>
                        <button
                            className="tag-popover-create-cancel"
                            onClick={() => { setIsCreating(false); setCreateName(''); }}
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

                {/* 批量确认底部 */}
                {showFooter && (
                    <div className="tag-popover-footer">
                        <button className="tag-popover-btn-cancel" onClick={handleClose}>取消</button>
                        <button
                            className="tag-popover-btn-confirm"
                            onClick={handleFooterConfirm}
                            disabled={localSelectedIds.size === 0}
                        >
                            确认添加 ({localSelectedIds.size})
                        </button>
                    </div>
                )}
            </>
        );
    }
}