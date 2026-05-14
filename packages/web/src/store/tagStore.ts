/**
 * Tag store - 标签数据集中缓存
 * 避免各组件独立 fetch tags 的冗余请求
 * mutation 后调用 invalidate() 触发重取
 */

import { create } from 'zustand';
import type { Tag } from '../types';
import * as api from '../services/api';

export interface TagState {
    /** 标签列表数据 */
    tags: Tag[];
    /** 是否正在加载 */
    loading: boolean;
    /** 是否已初始化 */
    initialized: boolean;
    /** 获取标签数据（首次或缓存失效时 fetch） */
    fetchTags: () => Promise<void>;
    /** 强制刷新（清缓存 + 重新 fetch） */
    invalidate: () => Promise<void>;
}

export const useTagStore = create<TagState>((set, get) => ({
    tags: [],
    loading: false,
    initialized: false,

    fetchTags: async () => {
        const state = get();
        if (state.initialized && state.tags.length > 0) return;

        set({ loading: true });
        try {
            const data = await api.getTags();
            set({ tags: data, initialized: true, loading: false });
        } catch (err) {
            console.error('加载标签数据失败:', err);
            set({ loading: false });
        }
    },

    invalidate: async () => {
        set({ loading: true });
        try {
            const data = await api.getTags();
            set({ tags: data, initialized: true, loading: false });
        } catch (err) {
            console.error('刷新标签数据失败:', err);
            set({ loading: false });
        }
    },
}));