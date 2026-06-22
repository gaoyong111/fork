/**
 * CollectionCard 组件 - 收藏项卡片组件
 * 支持 grid 卡片（小/中）与 list 精简行两种展示
 */

import React, { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Collection } from '../types';
import type { CardSize, ViewMode } from '../store/collectionStore';
import {
    getDisplayTitle,
    getListContentPreview,
    getMetadataGapLabel,
    getMetadataGapStatus,
} from '@favorites/shared/metadata/collectionMeta';
import { formatRelativeTime } from '../utils/format';
import { useDeepReadStore } from '../store/deepReadStore';
import { wechatImageReferrerPolicy } from '../utils/wechatImage';
import './CollectionCard.css';

interface CollectionCardProps {
    /** 收藏项数据 */
    collection: Collection;
    /** 展示模式 */
    variant?: ViewMode;
    /** 卡片尺寸（仅 grid 生效） */
    size?: CardSize;
    /** 点击卡片回调 */
    onClick?: (collection: Collection) => void;
    /** 切换星标回调 */
    onToggleFavorite?: (id: string) => void;
    /** 切换归档回调 */
    onToggleArchive?: (id: string) => void;
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
 * 根据类型和 URL 检测来源徽章信息
 */
function getSourceBadge(collection: Collection): { label: string; icon: string } {
    const url = collection.url || '';
    const type = collection.type;

    if (type === 'link') {
        if (url.includes('mp.weixin.qq.com')) {
            return { label: '公众号', icon: '📰' };
        }
        if (url.includes('twitter.com') || url.includes('x.com')) {
            return { label: 'X', icon: '𝕏' };
        }
        if (url.includes('github.com')) {
            return { label: 'GitHub', icon: '🐙' };
        }
        return { label: '网页', icon: '↗' };
    }
    if (type === 'file') {
        return { label: '文件', icon: '📄' };
    }
    if (type === 'note') {
        return { label: '笔记', icon: '✎' };
    }
    return { label: '网页', icon: '↗' };
}

function getHostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/**
 * 收藏项卡片组件
 * @param props - 组件属性
 */
export default memo(function CollectionCard({
    collection,
    variant = 'grid',
    size = 'medium',
    onClick,
    onToggleFavorite,
    onToggleArchive,
    selectable,
    selected,
    onSelect,
    draggable = false,
}: CollectionCardProps) {
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
        if (isDragging) return;
        onClick?.(collection);
    };

    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFavorite?.(collection.id);
    };

    const handleSelectClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect?.(collection.id);
    };

    const handleArchiveClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleArchive?.(collection.id);
    };

    const source = getSourceBadge(collection);
    const hasThumbnail = !!collection.thumbnailUrl;
    const { deepReadTask, hasDeepRead } = useDeepReadStore(
        useShallow((s) => ({
            deepReadTask: s.taskByCollectionId[collection.id],
            hasDeepRead: !!collection.content || !!s.completedContent[collection.id],
        })),
    );
    const isDeepReading = deepReadTask?.status === 'processing' || deepReadTask?.status === 'pending';
    const metadataGap = getMetadataGapStatus(collection, deepReadTask);
    const metadataGapLabel = getMetadataGapLabel(metadataGap);
    const displayTitle = getDisplayTitle(collection);
    const listPreview = variant === 'list' ? getListContentPreview(collection) : '';

    const cardClassName = [
        'collection-card',
        variant === 'list' ? 'collection-card-list' : `collection-card-${size}`,
        selected ? 'collection-card-selected' : '',
        collection.isArchived ? 'collection-card-archived' : '',
    ].filter(Boolean).join(' ');

    if (variant === 'list') {
        return (
            <div
                className={cardClassName}
                ref={draggable ? setNodeRef : undefined}
                style={dragStyle}
                onClick={handleClick}
                {...(draggable ? listeners : {})}
                {...(draggable ? attributes : {})}
            >
                <div className="collection-card-list-leading">
                    {selectable && (
                        <div className="collection-card-checkbox collection-card-checkbox-list" onClick={handleSelectClick}>
                            <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {}}
                                tabIndex={-1}
                            />
                            <svg
                                className="collection-card-checkbox-icon"
                                width="14" height="14" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2"
                            >
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>
                    )}

                    {collection.isFavorite && (
                        <span className="collection-card-list-fav" title="已星标">★</span>
                    )}
                </div>

                <div className="collection-card-list-main">
                    <span className="collection-card-list-title" title={displayTitle}>
                        {displayTitle}
                    </span>
                    {listPreview && (
                        <span className="collection-card-list-preview" title={listPreview}>
                            {listPreview}
                        </span>
                    )}
                </div>

                <div className="collection-card-list-trailing">
                    <div className="collection-card-list-meta">
                        {metadataGapLabel && (
                            <span
                                className={`collection-card-list-gap ${metadataGap}`}
                                title={metadataGapLabel}
                            >
                                {metadataGapLabel}
                            </span>
                        )}
                        {isDeepReading && (
                            <span className="collection-card-list-status processing" title="精读中">精读中</span>
                        )}
                        {hasDeepRead && !isDeepReading && (
                            <span className="collection-card-list-status done" title="已精读">已精读</span>
                        )}
                        <span className="collection-card-list-time">
                            {formatRelativeTime(collection.createdAt)}
                        </span>
                    </div>

                    <div className="collection-card-actions collection-card-list-actions">
                    <button
                        type="button"
                        className={`collection-card-favorite ${collection.isFavorite ? 'active' : ''}`}
                        onClick={handleFavoriteClick}
                        title={collection.isFavorite ? '取消星标' : '添加星标'}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill={collection.isFavorite ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className={`collection-card-archive ${collection.isArchived ? 'active' : ''}`}
                        onClick={handleArchiveClick}
                        title={collection.isArchived ? '取消归档' : '归档'}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill={collection.isArchived ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <polyline points="21 8 21 21 3 21 3 8" />
                            <rect x="1" y="3" width="22" height="5" />
                            <line x1="10" y1="12" x2="14" y2="12" />
                        </svg>
                    </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cardClassName}
            ref={draggable ? setNodeRef : undefined}
            style={dragStyle}
            onClick={handleClick}
            {...(draggable ? listeners : {})}
            {...(draggable ? attributes : {})}
        >
            <div className="collection-card-accent" />

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

            {size === 'medium' && hasThumbnail && (
                <div className="collection-card-cover">
                    <img
                        src={collection.thumbnailUrl ?? undefined}
                        alt={collection.title}
                        className="collection-card-thumbnail"
                        loading="lazy"
                        referrerPolicy={wechatImageReferrerPolicy(collection.thumbnailUrl)}
                    />
                </div>
            )}

            <div className="collection-card-body">
                <div className="collection-card-top-row">
                    <div className="collection-card-top-left">
                        <span className="collection-card-source">
                            <span className="collection-card-source-icon">{source.icon}</span>
                            {source.label}
                        </span>
                        {isDeepReading && (
                            <span className="collection-card-deepread-badge processing" title="精读中">
                                <span className="deep-read-spinner-sm" />
                                精读中
                            </span>
                        )}
                        {hasDeepRead && !isDeepReading && (
                            <span className="collection-card-deepread-badge done">
                                ✓ 已精读
                            </span>
                        )}
                    </div>
                    <div className="collection-card-actions">
                        <button
                            type="button"
                            className={`collection-card-favorite ${collection.isFavorite ? 'active' : ''}`}
                            onClick={handleFavoriteClick}
                            title={collection.isFavorite ? '取消星标' : '添加星标'}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill={collection.isFavorite ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className={`collection-card-archive ${collection.isArchived ? 'active' : ''}`}
                            onClick={handleArchiveClick}
                            title={collection.isArchived ? '取消归档' : '归档'}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill={collection.isArchived ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <polyline points="21 8 21 21 3 21 3 8" />
                                <rect x="1" y="3" width="22" height="5" />
                                <line x1="10" y1="12" x2="14" y2="12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <h3 className="collection-card-title" title={displayTitle}>
                    {displayTitle}
                </h3>

                {size === 'medium' && collection.description && (
                    <p className="collection-card-desc">
                        {collection.description}
                    </p>
                )}

                <div className="collection-card-footer">
                    {collection.tags.length > 0 && (
                        <div className="collection-card-tags">
                            {collection.tags.slice(0, size === 'small' ? 2 : 3).map((tag) => (
                                <span
                                    key={tag.id}
                                    className="collection-card-tag"
                                    style={{ borderColor: tag.color, color: tag.color }}
                                >
                                    {tag.name}
                                </span>
                            ))}
                            {collection.tags.length > (size === 'small' ? 2 : 3) && (
                                <span className="collection-card-tag-more">
                                    +{collection.tags.length - (size === 'small' ? 2 : 3)}
                                </span>
                            )}
                        </div>
                    )}
                    <div className="collection-card-meta">
                        {collection.url && (
                            <span className="collection-card-hostname" title={collection.url}>
                                {getHostname(collection.url)}
                            </span>
                        )}
                        {collection.readCount > 0 && (
                            <span className="collection-card-read-count">
                                读{collection.readCount}次
                            </span>
                        )}
                        <span className="collection-card-time">
                            {formatRelativeTime(collection.createdAt)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});
