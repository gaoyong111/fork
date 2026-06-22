/**
 * 虚拟滚动收藏列表
 * 滚动容器为列表页内层 .collection-list-scroll，工具栏固定在外层
 */

import { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import CollectionCard from './CollectionCard';
import type { Collection } from '../types';
import type { CardSize, ViewMode } from '../store/collectionStore';
import { useCollectionListScrollRefOptional } from '../contexts/CollectionListScrollContext';
import { getListBodyScrollKey, restoreScrollWhenReady } from '../hooks/useScrollRestoration';

const GRID_LAYOUT = {
    small: { minColumnWidth: 220, rowHeight: 160 },
    medium: { minColumnWidth: 300, rowHeight: 220 },
} as const;

const LIST_ROW_HEIGHT = 44;
const VIRTUAL_THRESHOLD = 12;

interface VirtualCollectionListProps {
    collections: Collection[];
    viewMode: ViewMode;
    cardSize: CardSize;
    batchMode: boolean;
    selectedIds: Set<string>;
    onCardClick: (collection: Collection) => void;
    onToggleFavorite: (id: string) => void;
    onToggleArchive: (id: string) => void;
    onSelect: (id: string) => void;
}

export default function VirtualCollectionList({
    collections,
    viewMode,
    cardSize,
    batchMode,
    selectedIds,
    onCardClick,
    onToggleFavorite,
    onToggleArchive,
    onSelect,
}: VirtualCollectionListProps) {
    const location = useLocation();
    const scrollKey = getListBodyScrollKey(location.pathname, location.search);
    const listScrollRef = useCollectionListScrollRefOptional();
    const listRootRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);

    const gridLayout = GRID_LAYOUT[cardSize];

    useEffect(() => {
        const measureTarget = listScrollRef?.current ?? listRootRef.current;
        if (!measureTarget) return;

        const updateWidth = () => setContainerWidth(measureTarget.clientWidth);
        updateWidth();

        const observer = new ResizeObserver(updateWidth);
        observer.observe(measureTarget);
        return () => observer.disconnect();
    }, [listScrollRef, collections.length, viewMode, cardSize]);

    const columnCount = useMemo(() => {
        if (viewMode === 'list') return 1;
        return Math.max(1, Math.floor(containerWidth / gridLayout.minColumnWidth));
    }, [viewMode, containerWidth, gridLayout.minColumnWidth]);

    const rowCount = Math.ceil(collections.length / columnCount);
    const rowHeight = viewMode === 'list' ? LIST_ROW_HEIGHT : gridLayout.rowHeight;
    const contentClassName = [
        'collection-list-content',
        viewMode,
        viewMode === 'grid' ? `card-size-${cardSize}` : '',
    ].filter(Boolean).join(' ');

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => listScrollRef?.current ?? null,
        estimateSize: () => rowHeight,
        overscan: 4,
    });

    const totalSize = rowVirtualizer.getTotalSize();

    /** 虚拟列表算出高度后再恢复一次滚动 */
    useLayoutEffect(() => {
        if (collections.length < VIRTUAL_THRESHOLD) return;
        restoreScrollWhenReady(listScrollRef?.current, scrollKey);
    }, [scrollKey, totalSize, collections.length, listScrollRef]);

    const renderCard = (collection: Collection) => (
        <CollectionCard
            key={collection.id}
            collection={collection}
            variant={viewMode}
            size={cardSize}
            onClick={onCardClick}
            onToggleFavorite={onToggleFavorite}
            onToggleArchive={onToggleArchive}
            selectable={batchMode}
            selected={selectedIds.has(collection.id)}
            onSelect={onSelect}
        />
    );

    if (collections.length < VIRTUAL_THRESHOLD) {
        return (
            <div ref={listRootRef} className={contentClassName}>
                {collections.map(renderCard)}
            </div>
        );
    }

    return (
        <div
            ref={listRootRef}
            className={`${contentClassName} virtual`}
        >
            <div
                style={{
                    height: `${totalSize}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const startIndex = virtualRow.index * columnCount;
                    const rowItems = collections.slice(startIndex, startIndex + columnCount);

                    return (
                        <div
                            key={virtualRow.key}
                            className={`collection-list-virtual-row ${viewMode} ${viewMode === 'grid' ? `card-size-${cardSize}` : ''}`}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            {rowItems.map(renderCard)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
