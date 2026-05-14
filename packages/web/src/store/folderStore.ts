/**
 * Folder store - 文件夹数据集中缓存
 * 避免各组件独立 fetch folder tree 的冗余请求
 * mutation 后调用 invalidate() 触发重取
 */

import { create } from 'zustand';
import type { Folder } from '../types';
import * as api from '../services/api';

export interface FolderState {
    /** 文件夹树数据 */
    folders: Folder[];
    /** 是否正在加载 */
    loading: boolean;
    /** 是否已初始化（首次 fetch 完成） */
    initialized: boolean;
    /** 获取文件夹数据（首次或缓存失效时 fetch） */
    fetchFolders: () => Promise<void>;
    /** 强制刷新（清缓存 + 重新 fetch） */
    invalidate: () => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
    folders: [],
    loading: false,
    initialized: false,

    fetchFolders: async () => {
        const state = get();
        if (state.initialized && state.folders.length > 0) return;

        set({ loading: true });
        try {
            const data = await api.getFolderTree();
            set({ folders: data, initialized: true, loading: false });
        } catch (err) {
            console.error('加载文件夹数据失败:', err);
            set({ loading: false });
        }
    },

    invalidate: async () => {
        set({ loading: true });
        try {
            const data = await api.getFolderTree();
            set({ folders: data, initialized: true, loading: false });
        } catch (err) {
            console.error('刷新文件夹数据失败:', err);
            set({ loading: false });
        }
    },
}));