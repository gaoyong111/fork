/** 各路由滚动位置缓存（pathname + search） */
const scrollPositions: Record<string, number> = {};

export function getScrollKey(pathname: string, search: string): string {
    return `${pathname}${search}`;
}

/** 列表页内层滚动区域专用 key */
export function getListBodyScrollKey(pathname: string, search: string): string {
    return `${getScrollKey(pathname, search)}::list-body`;
}

export function isListRoute(pathname: string): boolean {
    return pathname === '/';
}

export function saveScrollPosition(key: string, top: number): void {
    scrollPositions[key] = top;
}

export function readScrollPosition(key: string): number {
    return scrollPositions[key] ?? 0;
}

/**
 * 恢复滚动位置；内容异步增高时（虚拟列表）会多次尝试
 */
export function applyScrollPosition(el: HTMLElement, key: string): void {
    const target = readScrollPosition(key);
    const apply = () => {
        el.scrollTop = target;
    };
    apply();
    requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
    });
}

/** 供子组件在布局稳定后再次恢复（如虚拟列表计算出总高度） */
export function restoreScrollWhenReady(
    el: HTMLElement | null | undefined,
    key: string,
): void {
    if (!el) return;
    applyScrollPosition(el, key);
}
