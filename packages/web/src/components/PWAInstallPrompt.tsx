/**
 * PWAInstallPrompt 组件 - PWA 添加到桌面引导
 * 监听 beforeinstallprompt 事件，首次访问时显示安装引导横幅
 * iOS Safari 不支持 beforeinstallprompt，显示自定义引导提示
 */

import { useState, useEffect, useCallback } from 'react';
import './PWAInstallPrompt.css';

/** localStorage 中存储用户关闭引导的 key */
const DISMISS_KEY = 'pwa-install-dismissed';

/**
 * 检测是否为 iOS Safari
 * @returns 是否为 iOS Safari
 */
function isIOSSafari(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isWebkit = /WebKit/.test(ua);
    const isNotChrome = !/CriOS/.test(ua);

    return isIOS && isWebkit && isNotChrome;
}

/**
 * 检测是否在 standalone 模式下运行（已安装 PWA）
 * @returns 是否为 standalone 模式
 */
function isStandaloneMode(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    );
}

/**
 * PWAInstallPrompt 安装引导组件
 * 支持 Chrome/Edge 的 beforeinstallprompt 和 iOS Safari 的自定义引导
 */
export default function PWAInstallPrompt() {
    const [visible, setVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

    /**
     * 检查是否应该显示引导
     * 条件：非 standalone 模式 + 用户未关闭过
     */
    const shouldShow = useCallback((): boolean => {
        if (isStandaloneMode()) return false;
        if (localStorage.getItem(DISMISS_KEY)) return false;
        return true;
    }, []);

    /**
     * 处理 beforeinstallprompt 事件
     * 保存事件引用，延迟显示引导横幅
     */
    useEffect(() => {
        if (!shouldShow()) return;

        // iOS Safari 检测
        if (isIOSSafari()) {
            setIsIOS(true);
            // 延迟显示，避免影响首屏加载
            const timer = setTimeout(() => {
                setVisible(true);
            }, 2000);
            return () => clearTimeout(timer);
        }

        // Chrome/Edge: 监听 beforeinstallprompt
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            const timer = setTimeout(() => {
                setVisible(true);
            }, 2000);

            return () => clearTimeout(timer);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
    }, [shouldShow]);

    /**
     * 触发 PWA 安装
     */
    const handleInstall = useCallback(async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
                setVisible(false);
            }

            setDeferredPrompt(null);
        }
    }, [deferredPrompt]);

    /**
     * 关闭引导横幅
     * 记录到 localStorage，后续不再显示
     */
    const handleDismiss = useCallback(() => {
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, '1');
    }, []);

    if (!visible) return null;

    return (
        <div className="pwa-install-banner">
            <div className="pwa-install-content">
                <div className="pwa-install-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </div>
                <div className="pwa-install-text">
                    <div className="pwa-install-title">添加到桌面</div>
                    <div className="pwa-install-desc">快速收藏微信文章，随时查看</div>
                </div>
                <div className="pwa-install-actions">
                    {isIOS ? (
                        <span className="pwa-install-ios-hint">
                            点击分享按钮，选择「添加到主屏幕」
                        </span>
                    ) : (
                        <button className="pwa-install-btn" onClick={handleInstall}>
                            安装
                        </button>
                    )}
                    <button className="pwa-install-dismiss" onClick={handleDismiss}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * BeforeInstallPromptEvent 类型声明
 * Chrome 浏览器的 beforeinstallprompt 事件类型
 */
interface BeforeInstallPromptEvent extends Event {
    /** 触发安装提示 */
    prompt: () => Promise<void>;
    /** 用户选择结果 */
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
