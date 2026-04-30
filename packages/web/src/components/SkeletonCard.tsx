/**
 * SkeletonCard 骨架屏组件
 * 与 CollectionCard 相同尺寸的灰色渐变占位，支持 grid/list 两种视图模式
 */

import './SkeletonCard.css';

/** SkeletonCard 组件 props */
interface SkeletonCardProps {
    /** 视图模式 */
    viewMode: 'grid' | 'list';
}

/**
 * SkeletonCard 骨架屏组件
 * 在数据加载时显示占位动画
 */
export default function SkeletonCard({ viewMode }: SkeletonCardProps) {
    return (
        <div className={`skeleton-card ${viewMode}`}>
            <div className="skeleton-thumb" />
            <div className="skeleton-body">
                <div className="skeleton-line title" />
                <div className="skeleton-line desc" />
                <div className="skeleton-line meta" />
            </div>
        </div>
    );
}
