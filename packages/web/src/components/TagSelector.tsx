/**
 * TagSelector 组件 - 标签选择器组件
 * 支持多选标签、创建新标签
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Tag } from '../types';
import './TagSelector.css';

interface TagSelectorProps {
    /** 可选标签列表 */
    tags: Tag[];
    /** 已选中的标签 ID 列表 */
    selectedTagIds: string[];
    /** 选中变化回调 */
    onChange: (tagIds: string[]) => void;
    /** 创建新标签回调 */
    onCreateTag?: (name: string, color: string) => void;
}

/** 预设标签颜色 */
const TAG_COLORS = [
    '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];

/**
 * 标签选择器组件
 * @param props - 组件属性
 */
export default function TagSelector({
    tags,
    selectedTagIds,
    onChange,
    onCreateTag,
}: TagSelectorProps) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭下拉
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDropdown]);

    /**
     * 切换标签选中状态
     * @param tagId - 标签 ID
     */
    const handleToggleTag = (tagId: string) => {
        if (selectedTagIds.includes(tagId)) {
            onChange(selectedTagIds.filter((id) => id !== tagId));
        } else {
            onChange([...selectedTagIds, tagId]);
        }
    };

    /**
     * 创建新标签
     */
    const handleCreateTag = () => {
        const name = newTagName.trim();
        if (!name) return;

        const color = TAG_COLORS[tags.length % TAG_COLORS.length];
        onCreateTag?.(name, color);
        setNewTagName('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreateTag();
        }
    };

    const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));
    const unselectedTags = tags.filter((tag) => !selectedTagIds.includes(tag.id));

    return (
        <div className="tag-selector" ref={dropdownRef}>
            {/* 已选标签展示 */}
            <div className="tag-selector-selected" onClick={() => setShowDropdown(!showDropdown)}>
                {selectedTags.length > 0 ? (
                    selectedTags.map((tag) => (
                        <span
                            key={tag.id}
                            className="tag-selector-tag"
                            style={{ backgroundColor: tag.color + '18', borderColor: tag.color, color: tag.color }}
                        >
                            {tag.name}
                            <button
                                className="tag-selector-tag-remove"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleTag(tag.id);
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </span>
                    ))
                ) : (
                    <span className="tag-selector-placeholder">选择标签...</span>
                )}

                <svg
                    className="tag-selector-arrow"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>

            {/* 下拉选项 */}
            {showDropdown && (
                <div className="tag-selector-dropdown">
                    {/* 可选标签 */}
                    {unselectedTags.length > 0 && (
                        <div className="tag-selector-options">
                            {unselectedTags.map((tag) => (
                                <button
                                    key={tag.id}
                                    className="tag-selector-option"
                                    onClick={() => handleToggleTag(tag.id)}
                                >
                                    <span
                                        className="tag-selector-option-dot"
                                        style={{ backgroundColor: tag.color }}
                                    />
                                    <span className="tag-selector-option-name">{tag.name}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* 创建新标签 */}
                    <div className="tag-selector-create">
                        <input
                            type="text"
                            className="tag-selector-create-input"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="新建标签，回车确认"
                            maxLength={20}
                        />
                        {newTagName.trim() && (
                            <button className="tag-selector-create-btn" onClick={handleCreateTag}>
                                创建
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
