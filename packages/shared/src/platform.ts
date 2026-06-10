import { isTauriEnvironment } from './services/createApi';

export { isTauriEnvironment };

/** 平台能力标识 */
export interface PlatformCapabilities {
    /** 当前是否为 Tauri 桌面端 */
    isDesktop: boolean;
    /** 备份 / 恢复 / 存储信息 */
    dataManagement: boolean;
    /** AI 设置 UI（本地 settings 表） */
    aiSettings: boolean;
    /** 原生文件选择上传 */
    nativeFileUpload: boolean;
    /** 打开本地文件 */
    openLocalFile: boolean;
    /** PWA 安装提示 */
    pwaInstall: boolean;
    /** Service Worker 离线缓存 */
    serviceWorker: boolean;
    /** 系统托盘 / 全局快捷键 / Deep Link */
    systemTray: boolean;
    /** 窗口拖放导入 */
    windowDragDrop: boolean;
}

/** 桌面端专属 API 方法名（编译期参考 + 运行时校验） */
export const DESKTOP_ONLY_API_METHODS = [
    'getStorageInfo',
    'backupDatabase',
    'restoreDatabase',
    'listBackups',
    'deleteBackup',
    'getDataDir',
    'getAiConfig',
    'setAiConfig',
    'testAiConnection',
    'openFile',
    'uploadFileFromDialog',
    'uploadFileFromPath',
    'cancelDeepRead',
] as const;

export type DesktopOnlyApiMethod = (typeof DESKTOP_ONLY_API_METHODS)[number];

/**
 * 获取当前运行平台的能力矩阵
 */
export function getPlatformCapabilities(): PlatformCapabilities {
    const isDesktop = isTauriEnvironment();
    return {
        isDesktop,
        dataManagement: isDesktop,
        aiSettings: isDesktop,
        nativeFileUpload: isDesktop,
        openLocalFile: isDesktop,
        pwaInstall: !isDesktop,
        serviceWorker: !isDesktop,
        systemTray: isDesktop,
        windowDragDrop: isDesktop,
    };
}

/**
 * 判断某 API 方法是否仅在桌面端可用
 */
export function isDesktopOnlyMethod(method: string): method is DesktopOnlyApiMethod {
    return (DESKTOP_ONLY_API_METHODS as readonly string[]).includes(method);
}
