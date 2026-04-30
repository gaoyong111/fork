/**
 * 全局快捷键 Hook
 * 支持的快捷键：
 * - N: 新建收藏
 * - Ctrl/Cmd + K: 聚焦搜索框
 * - Escape: 退出批量模式
 */

import { useEffect } from 'react';

interface KeyboardShortcutsCallbacks {
    /** N 键回调：新建收藏 */
    onNew?: () => void;
    /** Ctrl/Cmd + K 回调：聚焦搜索框 */
    onFocusSearch?: () => void;
    /** Escape 回调：退出批量模式 */
    onEscape?: () => void;
}

/**
 * 判断事件目标是否为可编辑元素
 * @param target - 事件目标元素
 * @returns 是否为输入框、文本域或带有 contentEditable 的元素
 */
function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;

    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return true;
    }

    return target.isContentEditable;
}

/**
 * 全局快捷键 Hook
 * 监听键盘事件并触发对应的回调函数
 * 自动忽略在输入框中的快捷键（Escape 除外）
 * @param callbacks - 快捷键回调函数集合
 */
export default function useKeyboardShortcuts(callbacks: KeyboardShortcutsCallbacks) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const { key, metaKey, ctrlKey } = event;

            // Escape 键：任何场景下都响应（包括输入框中）
            if (key === 'Escape') {
                callbacks.onEscape?.();
                return;
            }

            // 在输入框中不响应其他快捷键
            if (isEditableElement(event.target)) {
                return;
            }

            // Ctrl/Cmd + K：聚焦搜索框
            if (key === 'k' && (metaKey || ctrlKey)) {
                event.preventDefault();
                callbacks.onFocusSearch?.();
                return;
            }

            // N 键：新建收藏
            if (key === 'n' && !metaKey && !ctrlKey && !event.shiftKey) {
                event.preventDefault();
                callbacks.onNew?.();
                return;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [callbacks]);
}
