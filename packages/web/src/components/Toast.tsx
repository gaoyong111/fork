/**
 * Toast 通知组件
 * 支持 success/error/warning/info 四种类型
 * 自动 3 秒消失，支持手动关闭，支持堆叠（最多 5 条）
 */

import { useEffect, useState } from 'react';
import './Toast.css';

/** Toast 类型 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** 单条 Toast 数据 */
export interface ToastItem {
    /** 唯一 ID */
    id: number;
    /** 消息内容 */
    message: string;
    /** Toast 类型 */
    type: ToastType;
    /** 是否正在退出 */
    exiting?: boolean;
    /** Undo 按钮文字 */
    undoLabel?: string;
    /** Undo 按钮回调 */
    undoAction?: () => void;
}

/** Toast 容器组件 props */
interface ToastContainerProps {
    /** Toast 列表 */
    toasts: ToastItem[];
    /** 移除 Toast */
    onRemove: (id: number) => void;
}

/** 各类型对应的 SVG 图标 */
const TOAST_ICONS: Record<ToastType, string> = {
    success: '<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>',
    error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
};

/**
 * 渲染对应类型的图标
 * @param type - Toast 类型
 * @returns SVG 元素
 */
function ToastIcon({ type }: { type: ToastType }) {
    return (
        <svg
            className="toast-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: TOAST_ICONS[type] }}
        />
    );
}

/**
 * Toast 容器组件
 * 渲染所有 Toast 通知
 */
export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <ToastItemComponent key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

/** 单条 Toast 组件 props */
interface ToastItemProps {
    /** Toast 数据 */
    toast: ToastItem;
    /** 移除回调 */
    onRemove: (id: number) => void;
}

/**
 * 单条 Toast 组件
 * 3 秒后自动消失，支持手动关闭
 */
function ToastItemComponent({ toast, onRemove }: ToastItemProps) {
    const [exiting, setExiting] = useState(false);

    /** 有 undoAction 时延长自动消失时间 */
    const dismissDuration = toast.undoAction ? 5000 : 3000;

    useEffect(() => {
        const timer = setTimeout(() => {
            setExiting(true);
        }, dismissDuration);

        return () => clearTimeout(timer);
    }, [toast.id, dismissDuration]);

    /**
     * 处理退出动画结束
     */
    const handleAnimationEnd = () => {
        if (exiting) {
            onRemove(toast.id);
        }
    };

    /**
     * 手动关闭
     */
    const handleClose = () => {
        setExiting(true);
    };

    /**
     * 执行 Undo 操作后退出
     */
    const handleUndo = () => {
        toast.undoAction?.();
        setExiting(true);
    };

    return (
        <div
            className={`toast-item ${toast.type} ${exiting ? 'exiting' : ''} ${toast.undoAction ? 'with-undo' : ''}`}
            onAnimationEnd={handleAnimationEnd}
        >
            <ToastIcon type={toast.type} />
            <span className="toast-message">{toast.message}</span>
            {toast.undoAction && (
                <button className="toast-undo" onClick={handleUndo}>{toast.undoLabel}</button>
            )}
            <button className="toast-close" onClick={handleClose}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}
