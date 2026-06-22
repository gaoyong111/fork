const LIST_RETURN_STORAGE_KEY = 'favorites-list-return';

export interface ListReturnState {
    returnTo?: string;
}

/**
 * 生成列表页返回路径（含筛选 query）
 */
export function getListReturnPath(pathname: string, search: string): string {
    return `${pathname}${search}` || '/';
}

/**
 * 进入详情前持久化列表返回路径
 */
export function saveListReturnPath(path: string): void {
    try {
        sessionStorage.setItem(LIST_RETURN_STORAGE_KEY, path);
    } catch {
        // ignore storage errors
    }
}

/**
 * 读取上次列表返回路径
 */
export function readListReturnPath(): string {
    try {
        return sessionStorage.getItem(LIST_RETURN_STORAGE_KEY) || '/';
    } catch {
        return '/';
    }
}

/**
 * 解析详情页应返回的列表路径
 */
export function resolveListReturnPath(state?: ListReturnState | null): string {
    if (state?.returnTo) {
        return state.returnTo;
    }
    return readListReturnPath();
}
