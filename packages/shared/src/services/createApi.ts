import { FavoritesApi } from './FavoritesApi';
import { HttpApi } from './HttpApi';
import { TauriApi } from './TauriApi';

/**
 * 平台检测：判断当前运行环境是否为 Tauri 桌面端
 * 检测 window.__TAURI_INTERNALS__ 对象是否存在
 * （withGlobalTauri: true 时 Tauri 会在 window 上注入此对象）
 */
function isTauriEnvironment(): boolean {
    return typeof window !== 'undefined' &&
        '__TAURI_INTERNALS__' in window;
}

export { isTauriEnvironment };

/**
 * API 适配器工厂
 * 根据运行环境自动创建 HttpApi 或 TauriApi
 * @param apiBase - HTTP API 基础路径（仅 HttpApi 使用），默认 '/api'
 * @returns 适配器实例
 */
export function createApi(apiBase?: string): FavoritesApi {
    if (isTauriEnvironment()) {
        return new TauriApi();
    }
    return new HttpApi(apiBase || '/api');
}