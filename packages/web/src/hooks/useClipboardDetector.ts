/**
 * 剪贴板链接检测 Hook
 * 自动检测剪贴板中是否包含 URL，用于快速收藏场景
 * 主要用于 PWA 模式下，用户从微信复制链接后打开收藏夹自动识别
 */

import { useState, useCallback, useRef } from 'react';

/** 剪贴板检测状态 */
interface ClipboardDetectResult {
    /** 检测到的 URL */
    url: string;
    /** 从 URL 中提取的域名 */
    domain: string;
}

interface UseClipboardDetectorOptions {
    /** 检测到 URL 时的回调 */
    onUrlDetected: (result: ClipboardDetectResult) => void;
    /** 防抖间隔（毫秒），默认 3000ms */
    debounceMs?: number;
}

/**
 * 从文本中提取 URL
 * 支持带协议和不带协议的 URL，以及微信分享链接格式
 * @param text - 待检测的文本内容
 * @returns 匹配到的 URL，未匹配到返回 null
 */
function extractUrl(text: string): string | null {
    if (!text || typeof text !== 'string') return null;

    const trimmed = text.trim();

    // 常见 URL 正则
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i;
    const match = trimmed.match(urlPattern);

    if (match) {
        return match[0].replace(/[.,;:!?)]+$/, '');
    }

    // 不带协议的 URL（如 mp.weixin.qq.com/s/xxx）
    const domainPattern = /[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?\/[^\s<>"{}|\\^`\[\]]+/i;
    const domainMatch = trimmed.match(domainPattern);

    if (domainMatch) {
        return 'https://' + domainMatch[0].replace(/[.,;:!?)]+$/, '');
    }

    return null;
}

/**
 * 从 URL 中提取域名
 * @param url - URL 字符串
 * @returns 域名字符串
 */
function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/**
 * 剪贴板链接检测 Hook
 * 组件挂载时自动尝试读取剪贴板内容，检测是否包含 URL
 * iOS Safari 需要用户交互才能访问剪贴板，因此提供了手动触发的 detect 方法
 * @param options - 配置选项
 * @returns 检测状态和手动触发方法
 */
export default function useClipboardDetector(options: UseClipboardDetectorOptions) {
    const { onUrlDetected, debounceMs = 3000 } = options;
    const [isDetecting, setIsDetecting] = useState(false);
    const lastDetectTime = useRef(0);
    const lastDetectedUrl = useRef<string | null>(null);

    /**
     * 执行剪贴板检测
     * 包含防抖逻辑，避免短时间内重复检测同一内容
     * @returns 是否成功检测到 URL
     */
    const detect = useCallback(async (): Promise<boolean> => {
        // 防抖检查
        const now = Date.now();
        if (now - lastDetectTime.current < debounceMs) {
            return false;
        }
        lastDetectTime.current = now;

        // 检查 Clipboard API 是否可用
        if (!navigator.clipboard || !navigator.clipboard.readText) {
            console.warn('当前浏览器不支持 Clipboard API');
            return false;
        }

        setIsDetecting(true);

        try {
            const text = await navigator.clipboard.readText();
            const url = extractUrl(text);

            if (url && url !== lastDetectedUrl.current) {
                lastDetectedUrl.current = url;
                onUrlDetected({
                    url,
                    domain: extractDomain(url),
                });
                return true;
            }
        } catch (err) {
            // iOS Safari 在非用户交互时访问剪贴板会抛出异常
            // 这是预期行为，静默处理
            console.debug('剪贴板访问被拒绝（可能需要用户交互）:', err);
        } finally {
            setIsDetecting(false);
        }

        return false;
    }, [onUrlDetected, debounceMs]);

    /**
     * 重置检测状态，允许再次检测同一 URL
     */
    const reset = useCallback(() => {
        lastDetectedUrl.current = null;
        lastDetectTime.current = 0;
    }, []);

    return {
        /** 是否正在检测 */
        isDetecting,
        /** 手动触发检测 */
        detect,
        /** 重置检测状态 */
        reset,
    };
}

export type { ClipboardDetectResult };
