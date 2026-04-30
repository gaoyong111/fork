/**
 * CollectionCard 组件 - 收藏项卡片组件
 * 展示收藏项的封面图、标题、摘要、标签和时间
 * 支持批量选择模式
 * 支持拖拽功能
 */

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Collection } from '../types';
import { formatRelativeTime, truncateText } from '../utils/format';
import './CollectionCard.css';

interface CollectionCardProps {
    /** 收藏项数据 */
    collection: Collection;
    /** 点击卡片回调 */
    onClick?: (collection: Collection) => void;
    /** 切换星标回调 */
    onToggleFavorite?: (id: string) => void;
    /** 是否处于可选择模式 */
    selectable?: boolean;
    /** 是否已选中 */
    selected?: boolean;
    /** 选择回调 */
    onSelect?: (id: string) => void;
    /** 是否可拖拽 */
    draggable?: boolean;
}

/**
 * 收藏项卡片组件
 * @param props - 组件属性
 */
export default function CollectionCard({
    collection,
    onClick,
    onToggleFavorite,
    selectable,
    selected,
    onSelect,
    draggable = false,
}: CollectionCardProps) {
    // 拖拽功能
    const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
        id: `collection-${collection.id}`,
        data: { type: 'collection', collection },
        disabled: !draggable,
    });

    const dragStyle: React.CSSProperties = draggable
        ? {
              transform: CSS.Translate.toString(transform),
              opacity: isDragging ? 0.5 : 1,
          }
        : {};

    const handleClick = () => {
        onClick?.(collection);
    };

    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleFavorite?.(collection.id);
    };

    const handleUrlClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (collection.url) {
            window.open(collection.url, '_blank', 'noopener,noreferrer');
        }
    };

    /**
     * checkbox 点击事件，阻止冒泡避免触发卡片点击
     */
    const handleSelectClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect?.(collection.id);
    };

    // 根据类型获取图标
    const getTypeIcon = () => {
        switch (collection.type) {
            case 'link':
                return (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                );
            case 'file':
                return (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                );
            case 'note':
                return (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="17" y1="10" x2="3" y2="10" />
                        <line x1="21" y1="6" x2="3" y2="6" />
                        <line x1="21" y1="14" x2="3" y2="14" />
                        <line x1="17" y1="18" x2="3" y2="18" />
                    </svg>
                );
            default:
                return null;
        }
    };

    return (
        <div
            className={`collection-card ${selected ? 'collection-card-selected' : ''}`}
            ref={draggable ? setNodeRef : undefined}
            style={dragStyle}
            onClick={handleClick}
            {...(draggable ? listeners : {})}
            {...(draggable ? attributes : {})}
        >
            {/* 批量选择 checkbox */}
            {selectable && (
                <div className="collection-card-checkbox" onClick={handleSelectClick}>
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {}}
                        tabIndex={-1}
                    />
                    <svg
                        className="collection-card-checkbox-icon"
                        width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
            )}

            {/* 封面图区域 */}
            <div className="collection-card-cover">
                {collection.thumbnailUrl ? (
                    <img
                        src={collection.thumbnailUrl}
                        alt={collection.title}
                        className="collection-card-thumbnail"
                        loading="lazy"
                    />
                ) : (
                    <div className="collection-card-placeholder">
                        {getTypeIcon()}
                    </div>
                )}

                {/* 星标按钮 */}
                <button
                    className={`collection-card-favorite ${collection.isFavorite ? 'active' : ''}`}
                    onClick={handleFavoriteClick}
                    title={collection.isFavorite ? '取消星标' : '添加星标'}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill={collection.isFavorite ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                </button>

                {/* 类型标签 */}
                <span className="collection-card-type">
                    {getTypeIcon()}
                    {collection.type === 'link' ? '网页' : collection.type === 'file' ? '文件' : '笔记'}
                </span>
            </div>

            {/* 内容区域 */}
            <div className="collection-card-body">
                <h3 className="collection-card-title" title={collection.title}>
                    {collection.title}
                </h3>

                {collection.description && (
                    <p className="collection-card-desc">
                        {truncateText(collection.description, 80)}
                    </p>
                )}

                {collection.url && (
                    <p className="collection-card-url" onClick={handleUrlClick} title={collection.url}>
                        {(() => {
                            try {
                                return new URL(collection.url).hostname;
                            } catch {
                                return collection.url;
                            }
                        })()}
                    </p>
                )}

                {/* 标签 */}
                {collection.tags.length > 0 && (
                    <div className="collection-card-tags">
                        {collection.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag.id}
                                className="collection-card-tag"
                                style={{ borderColor: tag.color, color: tag.color }}
                            >
                                {tag.name}
                            </span>
                        ))}
                        {collection.tags.length > 3 && (
                            <span className="collection-card-tag-more">
                                +{collection.tags.length - 3}
                            </span>
                        )}
                    </div>
                )}

                {/* 时间 */}
                <div className="collection-card-time">
                    {formatRelativeTime(collection.createdAt)}
                </div>
            </div>
        </div>
    );
}
