import { createContext, useContext, type RefObject } from 'react';

export const LayoutScrollContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useLayoutScrollRef(): RefObject<HTMLDivElement | null> {
    const ref = useContext(LayoutScrollContext);
    if (!ref) {
        throw new Error('useLayoutScrollRef must be used within Layout');
    }
    return ref;
}

/** 非虚拟列表场景可选使用，缺失 context 时返回 null */
export function useLayoutScrollRefOptional(): RefObject<HTMLDivElement | null> | null {
    return useContext(LayoutScrollContext);
}
