/**
 * 桌面端原生事件集成：托盘菜单、全局快捷键、拖放、Deep Link
 * 仅在 Tauri 环境激活
 */

import { useEffect } from 'react';
import { isTauriEnvironment } from '@favorites/shared/platform';

interface DesktopIntegrationOptions {
    onQuickSave: () => void;
    onOpenUrl: (url: string) => void;
    onDropFiles: (paths: string[]) => void;
}

function getTauriEventListen(): ((event: string, handler: (payload: unknown) => void) => Promise<() => void>) | null {
    const tauri = (window as unknown as { __TAURI__?: { event?: { listen: (event: string, handler: (ev: { payload: unknown }) => void) => Promise<() => void> } } }).__TAURI__;
    if (!tauri?.event?.listen) return null;
    return (event, handler) =>
        tauri.event!.listen(event, (ev) => handler(ev.payload));
}

export function useDesktopIntegration(options: DesktopIntegrationOptions) {
    const { onQuickSave, onOpenUrl, onDropFiles } = options;

    useEffect(() => {
        if (!isTauriEnvironment()) return;

        const listen = getTauriEventListen();
        if (!listen) return;

        const unlisteners: Array<() => void> = [];
        let cancelled = false;

        void (async () => {
            unlisteners.push(await listen('desktop-quick-save', () => onQuickSave()));
            unlisteners.push(await listen('desktop-open-url', (payload) => {
                if (typeof payload === 'string') onOpenUrl(payload);
            }));
            unlisteners.push(await listen('desktop-drop-files', (payload) => {
                if (Array.isArray(payload)) {
                    onDropFiles(payload.filter((p): p is string => typeof p === 'string'));
                }
            }));

            // Deep link 插件事件（运行中收到 favorites:// 链接）
            unlisteners.push(await listen('deep-link://new-url', (payload) => {
                const urls = Array.isArray(payload) ? payload : [payload];
                for (const item of urls) {
                    if (typeof item === 'string') {
                        const match = item.match(/[?&]url=([^&]+)/);
                        if (match?.[1]) {
                            onOpenUrl(decodeURIComponent(match[1]));
                        } else if (item.startsWith('http://') || item.startsWith('https://')) {
                            onOpenUrl(item);
                        }
                    }
                }
            }));

            if (cancelled) {
                unlisteners.forEach((fn) => fn());
            }
        })();

        return () => {
            cancelled = true;
            unlisteners.forEach((fn) => fn());
        };
    }, [onQuickSave, onOpenUrl, onDropFiles]);
}
