/**
 * TagList 组件 - 标签列表组件
 * 支持选中标签进行筛选，通过标签管理弹窗进行编辑和删除
 */

import type { Tag } from '../types';
import './TagList.css';

interface TagListProps {
    tags: Tag[];
    selectedTagId: string | null;
    onSelectTag: (tagId: string | null) => void;
    onManageTags?: () => void;
}

/**
 * 标签列表组件
 * @param props - 组件属性
 */
export default function TagList({ tags, selectedTagId, onSelectTag, onManageTags }: TagListProps) {
    return (
        <div className="tag-list">
            <div className="tag-list-header">
                <span className="tag-list-header-title">标签</span>
                <button className="tag-list-manage-btn" onClick={onManageTags} title="管理标签">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                </button>
            </div>

            <div className="tag-list-items">
                {tags.filter((tag) => tag.collectionCount).map((tag) => (
                    <button
                        key={tag.id}
                        className={`tag-list-item ${selectedTagId === tag.id ? 'selected' : ''}`}
                        onClick={() => onSelectTag(selectedTagId === tag.id ? null : tag.id)}
                    >
                        <span
                            className="tag-list-dot"
                            style={{ backgroundColor: tag.color }}
                        />
                        <span className="tag-list-name">{tag.name}</span>
                        <span className="tag-list-count">{tag.collectionCount}</span>
                    </button>
                ))}

                {tags.length === 0 && (
                    <div className="tag-list-empty">暂无标签</div>
                )}
            </div>
        </div>
    );
}
