/**
 * ConfirmModal 确认弹窗组件
 * 替代原生 confirm()，支持自定义标题、内容、按钮文字和危险样式
 */

import { useEffect, useCallback } from 'react';
import './ConfirmModal.css';

/** ConfirmModal 组件 props */
interface ConfirmModalProps {
    /** 弹窗标题 */
    title: string;
    /** 弹窗内容 */
    message: string;
    /** 确认按钮文字 */
    confirmText?: string;
    /** 取消按钮文字 */
    cancelText?: string;
    /** 确认按钮是否为红色危险样式 */
    danger?: boolean;
    /** 关闭回调，传入 boolean 表示用户选择 */
    onClose: (result: boolean) => void;
}

/**
 * ConfirmModal 确认弹窗组件
 * 半透明遮罩 + 居中弹窗，支持 ESC 关闭和点击遮罩关闭
 */
export default function ConfirmModal({
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    danger = false,
    onClose,
}: ConfirmModalProps) {
    /**
     * ESC 键关闭弹窗（等同于取消）
     */
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose(false);
            }
        },
        [onClose],
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="confirm-overlay" onClick={() => onClose(false)}>
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="confirm-title">{title}</h3>
                <p className="confirm-message">{message}</p>
                <div className="confirm-actions">
                    <button className="confirm-btn" onClick={() => onClose(false)}>
                        {cancelText}
                    </button>
                    <button
                        className={`confirm-btn confirm-btn-confirm ${danger ? 'danger' : ''}`}
                        onClick={() => onClose(true)}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
