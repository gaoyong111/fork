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
    optimisticToggleFavorite: (id: string) => Promise<void>;
    optimisticMove: (id: string, folderId: string | null) => Promise<void>;
    undo: (undoId: string) => void;
    updateContent: (collectionId: string, content: string) => void;
}

/**
 * 将 API 返回的数据与 pendingUndos 合并，保留乐观变更
 * 过滤掉待删除的项，恢复已切换的 favorite 状态
 */
function applyOptimisticOverrides(items: Collection[], pendingUndos: UndoAction[]): Collection[] {
    const deletedIds = new Set(
        pendingUndos.filter((u) => u.type === 'delete').map((u) => u.targetId)
    );
    return items
        .filter((c) => !deletedIds.has(c.id));
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
    collections: [],
    total: 0,
    filters: {
        folderId: null,
        tagId: null,
        keyword: '',
        isFavorite: null,
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
        const merged: GetCollectionsParams = {
            page: state.page,
            pageSize: state.pageSize,
            sortBy: state.filters.sortBy,
            sortOrder: state.filters.sortOrder,
            folderId: state.filters.folderId || undefined,
            tagId: state.filters.tagId || undefined,
            isFavorite: state.filters.isFavorite || undefined,
            keyword: state.filters.keyword || undefined,
            ...params,
        };

        set({ loading: true });
        try {
            const data = await api.getCollections(merged);
            const collections = applyOptimisticOverrides(data.items, get().pendingUndos);
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
            const data = await api.getCollections({
                page: get().page,
                pageSize: get().pageSize,
                sortBy: get().filters.sortBy,
                sortOrder: get().filters.sortOrder,
                folderId: get().filters.folderId || undefined,
                tagId: get().filters.tagId || undefined,
                isFavorite: get().filters.isFavorite || undefined,
                keyword: get().filters.keyword || undefined,
            });
            const collections = applyOptimisticOverrides(data.items, get().pendingUndos);
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
        if (!target) return;

        const newFavorite = !target.isFavorite;

        set({
            collections: state.collections.map((c) =>
                c.id === id ? { ...c, isFavorite: newFavorite } : c
            ),
        });

        try {
            await api.toggleFavorite(id);
        } catch (err) {
            console.error('收藏切换失败:', err);
            set({
                collections: get().collections.map((c) =>
                    c.id === id ? { ...c, isFavorite: !newFavorite } : c
                ),
            });
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
            await api.moveCollection(id, folderId ?? '');
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

    updateContent: (collectionId: string, content: string) => {
        const state = get();
        set({
            collections: state.collections.map((c) =>
                c.id === collectionId ? { ...c, content } : c
            ),
        });
    },
}));