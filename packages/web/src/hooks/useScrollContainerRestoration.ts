import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { applyScrollPosition, saveScrollPosition } from './useScrollRestoration';

/** 绑定滚动容器的保存与恢复 */
export function useScrollContainerRestoration(
    ref: RefObject<HTMLElement | null>,
    scrollKey: string,
    enabled = true,
): void {
    useEffect(() => {
        if (!enabled) return;
        const el = ref.current;
        if (!el) return;

        const onScroll = () => saveScrollPosition(scrollKey, el.scrollTop);
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [ref, scrollKey, enabled]);

    useLayoutEffect(() => {
        if (!enabled) return;
        const el = ref.current;
        if (!el) return;
        applyScrollPosition(el, scrollKey);
    }, [ref, scrollKey, enabled]);
}
