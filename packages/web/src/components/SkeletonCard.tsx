/**
 * SkeletonCard 骨架屏组件
 * 与 CollectionCard 相同尺寸的灰色渐变占位，支持 grid/list 两种视图模式
 */

import type { CardSize, ViewMode } from '../store/collectionStore';
import './SkeletonCard.css';

/** SkeletonCard 组件 props */
interface SkeletonCardProps {
    /** 视图模式 */
    viewMode: ViewMode;
    /** 卡片尺寸（仅 grid 生效） */
    cardSize?: CardSize;
}

/**
 * SkeletonCard 骨架屏组件
 * 在数据加载时显示占位动画
 */
export default function SkeletonCard({ viewMode, cardSize = 'medium' }: SkeletonCardProps) {
    if (viewMode === 'list') {
        return (
            <div className="skeleton-card list">
                <div className="skeleton-line title" />
                <div className="skeleton-line preview" />
                <div className="skeleton-line meta" />
            </div>
        );
    }

    return (
        <div className={`skeleton-card grid card-size-${cardSize}`}>
            {cardSize === 'medium' && <div className="skeleton-thumb cover" />}
            <div className="skeleton-body">
                <div className="skeleton-line meta" />
                <div className="skeleton-line title" />
                {cardSize === 'medium' && <div className="skeleton-line desc" />}
                <div className="skeleton-line meta short" />
            </div>
        </div>
    );
}
