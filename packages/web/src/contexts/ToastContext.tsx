/**
 * Toast 上下文
 * 提供 showToast 和 showConfirm 方法，替代原生 alert/confirm
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import ToastContainer, { type ToastItem, type ToastType } from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';

/** 确认弹窗配置 */
export interface ConfirmOptions {
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
}

/** Toast 上下文类型 */
interface ToastContextType {
    /** 显示 Toast 通知 */
    showToast: (message: string, type?: ToastType, undo?: { label: string; action: () => void }) => void;
    /** 显示确认弹窗，返回 Promise<boolean> */
    showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | null>(null);

/** Toast 最大堆叠数量 */
const MAX_TOASTS = 5;

/**
 * ToastProvider 组件
 * 包裹应用，提供 showToast 和 showConfirm 能力
 */
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
    const confirmResolveRef = useRef<((result: boolean) => void) | null>(null);
    const nextIdRef = useRef(0);

    /**
     * 显示 Toast 通知
     * @param message - 消息内容
     * @param type - Toast 类型，默认 info
     * @param undo - Undo 配置，包含按钮文字和回调
     */
    const showToast = useCallback((message: string, type: ToastType = 'info', undo?: { label: string; action: () => void }) => {
        const id = ++nextIdRef.current;
        const newToast: ToastItem = { id, message, type, undoLabel: undo?.label, undoAction: undo?.action };

        setToasts((prev) => {
            const updated = [...prev, newToast];
            // 超出最大数量时移除最早的
            if (updated.length > MAX_TOASTS) {
                return updated.slice(updated.length - MAX_TOASTS);
            }
            return updated;
        });
    }, []);

    /**
     * 显示确认弹窗
     * @param options - 确认弹窗配置
     * @returns Promise<boolean>，用户点确认为 true，取消为 false
     */
    const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            confirmResolveRef.current = resolve;
            setConfirmOptions(options);
        });
    }, []);

    /**
     * 移除指定 Toast
     * @param id - Toast ID
     */
    const handleRemoveToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    /**
     * 处理确认弹窗关闭
     * @param result - 用户选择结果
     */
    const handleConfirmClose = useCallback((result: boolean) => {
        setConfirmOptions(null);
        if (confirmResolveRef.current) {
            confirmResolveRef.current(result);
            confirmResolveRef.current = null;
        }
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, showConfirm }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={handleRemoveToast} />
            {confirmOptions && (
                <ConfirmModal
                    title={confirmOptions.title}
                    message={confirmOptions.message}
                    confirmText={confirmOptions.confirmText}
                    cancelText={confirmOptions.cancelText}
                    danger={confirmOptions.danger}
                    onClose={handleConfirmClose}
                />
            )}
        </ToastContext.Provider>
    );
}

/**
 * useToast Hook
 * 获取 showToast 和 showConfirm 方法
 * @returns Toast 上下文类型
 * @throws 在 ToastProvider 外使用时抛出错误
 */
export function useToast(): ToastContextType {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
