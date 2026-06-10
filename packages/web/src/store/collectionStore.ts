/**
 * collectionStore - 收藏项数据集中管理
 * 取代各页面独立 useState，支持乐观更新 + Undo
 * mutation 后不再全量刷新，直接本地更新 + 后台同步
 */

import { create } from 'zustand';
import * as api from '../services/api';
import type { Collection, GetCollectionsParams, SearchParams, SearchResultItem } from '../types';
import { useFolderStore } from './folderStore';
import { useTagStore } from './tagStore';

const UNDO_EXPIRE_MS = 5000;

export interface UndoAction {
    id: string;
    type: 'delete' | 'move' | 'untag' | 'unfavorite';
    targetId: string;
    payload: Record<string, unknown>;
    expiresAt: number;
}

export interface CollectionFilters {
    folderId: string | null;
    tagId: string | null;
    keyword: string;
    isFavorite: boolean | null;
    isArchived: boolean | null;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
}

export interface CollectionState {
    collections: Collection[];
    total: number;
    filters: CollectionFilters;
    page: number;
    pageSize: number;
    viewMode: 'grid' | 'list';
    loading: boolean;
    initialized: boolean;
    pendingUndos: UndoAction[];

    fetchCollections: (params?: Partial<GetCollectionsParams>) => Promise<void>;
    invalidate: () => Promise<void>;
    setFilters: (filters: Partial<CollectionFilters>) => void;
    setPage: (page: number) => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    searchCollections: (query: string) => Promise<SearchResultItem[]>;

    optimisticDelete: (id: string) => void;
    optimisticToggleFavorite: (id: string) => Promise<{ id: string; isFavorite: boolean }>;
    optimisticToggleArchive: (id: string) => Promise<{ id: string; isArchived: boolean }>;
    optimisticMove: (id: string, folderId: string | null) => Promise<void>;
    undo: (undoId: string) => void;
    updateContent: (collectionId: string, content: string, rawContent?: string) => void;
    updateSummary: (collectionId: string, collection: Collection | undefined) => void;
}

/**
 * 将 API 返回的数据与 pendingUndos 合并，保留乐观变更
 * 过滤掉待删除的项，恢复已切换的 favorite 状态
 */
/** 将接口返回的 0/1 规范为 boolean */
function normalizeCollection(collection: Collection): Collection {
    return {
        ...collection,
        isFavorite: collection.isFavorite === true || (collection.isFavorite as unknown) === 1,
        isArchived: collection.isArchived === true || (collection.isArchived as unknown) === 1,
    };
}

function normalizeCollections(items: Collection[]): Collection[] {
    return items.map(normalizeCollection);
}

function patchCollectionFlag(
    collections: Collection[],
    id: string,
    patch: Partial<Pick<Collection, 'isFavorite' | 'isArchived'>>,
): Collection[] {
    return collections.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

function applyOptimisticOverrides(items: Collection[], pendingUndos: UndoAction[]): Collection[] {
    const deletedIds = new Set(
        pendingUndos.filter((u) => u.type === 'delete').map((u) => u.targetId)
    );
    return items
        .filter((c) => !deletedIds.has(c.id));
}

function buildFetchParams(
    state: Pick<CollectionState, 'page' | 'pageSize' | 'filters'>,
    overrides?: Partial<GetCollectionsParams>,
): GetCollectionsParams {
    return {
        page: state.page,
        pageSize: state.pageSize,
        sortBy: state.filters.sortBy,
        sortOrder: state.filters.sortOrder,
        folderId: state.filters.folderId || undefined,
        tagId: state.filters.tagId || undefined,
        isFavorite: state.filters.isFavorite || undefined,
        isArchived: state.filters.isArchived || undefined,
        keyword: state.filters.keyword || undefined,
        ...overrides,
    };
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
    collections: [],
    total: 0,
    filters: {
        folderId: null,
        tagId: null,
        keyword: '',
        isFavorite: null,
        isArchived: null,
        sortBy: 'created_at',
        sortOrder: 'desc',
    },
    page: 1,
    pageSize: 20,
    viewMode: 'grid',
    loading: false,
    initialized: false,
    pendingUndos: [],

    fetchCollections: async (params?: Partial<GetCollectionsParams>) => {
        const state = get();
        const merged = buildFetchParams(state, params);

        set({ loading: true });
        try {
            const data = await api.getCollections(merged);
            const collections = normalizeCollections(
                applyOptimisticOverrides(data.items, get().pendingUndos),
            );
            set({
                collections,
                total: data.pagination.total - (data.items.length - collections.length),
                initialized: true,
                loading: false,
            });
        } catch (err) {
            console.error('加载收藏数据失败:', err);
            set({ loading: false });
        }
    },

    invalidate: async () => {
        set({ loading: true });
        try {
            const data = await api.getCollections(buildFetchParams(get()));
            const collections = normalizeCollections(
                applyOptimisticOverrides(data.items, get().pendingUndos),
            );
            set({
                collections,
                total: data.pagination.total - (data.items.length - collections.length),
                initialized: true,
                loading: false,
            });
        } catch (err) {
            console.error('刷新收藏数据失败:', err);
            set({ loading: false });
        }
    },

    setFilters: (filters: Partial<CollectionFilters>) => {
        set({ filters: { ...get().filters, ...filters }, page: 1 });
        get().fetchCollections();
    },

    setPage: (page: number) => {
        set({ page });
        get().fetchCollections({ page });
    },

    setViewMode: (mode: 'grid' | 'list') => {
        set({ viewMode: mode });
    },

    searchCollections: async (query: string) => {
        const params: SearchParams = { q: query };
        const data = await api.searchCollections(params);
        return data.items;
    },

    optimisticDelete: (id: string) => {
        const state = get();
        const target = state.collections.find((c) => c.id === id);
        if (!target) return;

        const undoId = `delete-${id}-${Date.now()}`;
        const undo: UndoAction = {
            id: undoId,
            type: 'delete',
            targetId: id,
            payload: { collection: target },
            expiresAt: Date.now() + UNDO_EXPIRE_MS,
        };

        set({
            collections: state.collections.filter((c) => c.id !== id),
            total: state.total - 1,
            pendingUndos: [...state.pendingUndos, undo],
        });

        // 同步更新侧边栏文件夹计数
        useFolderStore.getState().updateCollectionCount(target.folderId, -1);

        setTimeout(() => {
            const current = get();
            const stillPending = current.pendingUndos.find((u) => u.id === undoId);
            if (stillPending) {
                api.deleteCollection(id).catch((err) => {
                    console.error('延迟删除失败:', err);
                });
                // API 删除完成后刷新文件夹和标签计数
                useFolderStore.getState().invalidate();
                useTagStore.getState().invalidate();
                set({ pendingUndos: current.pendingUndos.filter((u) => u.id !== undoId) });
            }
        }, UNDO_EXPIRE_MS);
    },

    optimisticToggleFavorite: async (id: string) => {
        const state = get();
        const target = state.collections.find((c) => c.id === id);
        const prevFavorite = target?.isFavorite;

        if (target) {
            set({
                collections: patchCollectionFlag(state.collections, id, {
                    isFavorite: !normalizeCollection(target).isFavorite,
                }),
            });
        }

        try {
            const result = await api.toggleFavorite(id);
            const isFavorite = result.isFavorite === true || (result.isFavorite as unknown) === 1;
            const latest = get();
            if (latest.collections.some((c) => c.id === id)) {
                set({
                    collections: patchCollectionFlag(latest.collections, id, { isFavorite }),
                });
            }
            return { id: result.id, isFavorite };
        } catch (err) {
            console.error('收藏切换失败:', err);
            if (target && prevFavorite !== undefined) {
                set({
                    collections: patchCollectionFlag(get().collections, id, { isFavorite: prevFavorite }),
                });
            }
            throw err;
        }
    },

    optimisticToggleArchive: async (id: string) => {
        const state = get();
        const target = state.collections.find((c) => c.id === id);
        const prevArchived = target?.isArchived;

        if (target) {
            set({
                collections: patchCollectionFlag(state.collections, id, {
                    isArchived: !normalizeCollection(target).isArchived,
                }),
            });
        }

        try {
            const result = await api.toggleArchive(id);
            const isArchived = result.isArchived === true || (result.isArchived as unknown) === 1;
            const latest = get();
            if (latest.collections.some((c) => c.id === id)) {
                set({
                    collections: patchCollectionFlag(latest.collections, id, { isArchived }),
                });
            }
            return { id: result.id, isArchived };
        } catch (err) {
            console.error('归档切换失败:', err);
            if (target && prevArchived !== undefined) {
                set({
                    collections: patchCollectionFlag(get().collections, id, { isArchived: prevArchived }),
                });
            }
            throw err;
        }
    },

    optimisticMove: async (id: string, folderId: string | null) => {
        const state = get();
        const target = state.collections.find((c) => c.id === id);
        if (!target) return;

        const oldFolderId = target.folderId;

        set({
            collections: state.collections.map((c) =>
                c.id === id ? { ...c, folderId } : c
            ),
        });

        try {
            await api.moveCollection(id, folderId);
        } catch (err) {
            console.error('移动失败:', err);
            set({
                collections: get().collections.map((c) =>
                    c.id === id ? { ...c, folderId: oldFolderId } : c
                ),
            });
        }
    },

    undo: (undoId: string) => {
        const state = get();
        const action = state.pendingUndos.find((u) => u.id === undoId);
        if (!action) return;

        switch (action.type) {
            case 'delete': {
                const collection = action.payload.collection as Collection;
                set({
                    collections: [...state.collections, collection],
                    total: state.total + 1,
                    pendingUndos: state.pendingUndos.filter((u) => u.id !== undoId),
                });
                // 撤销删除时恢复文件夹和标签计数
                useFolderStore.getState().updateCollectionCount(collection.folderId, 1);
                if (collection.tags.length > 0) {
                    useTagStore.getState().invalidate();
                }
                break;
            }
            default:
                set({ pendingUndos: state.pendingUndos.filter((u) => u.id !== undoId) });
        }
    },

    updateContent: (collectionId: string, content: string, rawContent?: string) => {
        const state = get();
        set({
            collections: state.collections.map((c) =>
                c.id === collectionId ? { ...c, content, ...(rawContent !== undefined ? { rawContent } : {}) } : c
            ),
        });
    },

    updateSummary: (collectionId: string, collection: Collection | undefined) => {
        if (!collection) return;
        const normalized = normalizeCollection(collection);
        set({
            collections: get().collections.map((c) =>
                c.id === collectionId ? { ...c, ...normalized } : c
            ),
        });
    },
}));