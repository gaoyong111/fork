import { getPlatformCapabilities, isTauriEnvironment } from '@favorites/shared/platform';

export function usePlatform() {
    const capabilities = getPlatformCapabilities();
    return {
        isDesktop: capabilities.isDesktop,
        isWeb: !capabilities.isDesktop,
        showPWA: capabilities.pwaInstall,
        showClipboardAutoDetect: !capabilities.isDesktop,
        capabilities,
    };
}

/** 非 React 环境检测（如 main.tsx） */
export { isTauriEnvironment, getPlatformCapabilities };
