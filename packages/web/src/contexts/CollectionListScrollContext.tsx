import { createContext, useContext, type RefObject } from 'react';

export const CollectionListScrollContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useCollectionListScrollRef(): RefObject<HTMLDivElement | null> {
    const ref = useContext(CollectionListScrollContext);
    if (!ref) {
        throw new Error('useCollectionListScrollRef must be used within CollectionList');
    }
    return ref;
}

export function useCollectionListScrollRefOptional(): RefObject<HTMLDivElement | null> | null {
    return useContext(CollectionListScrollContext);
}
