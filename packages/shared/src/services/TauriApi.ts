import type {
    Collection,
    CreateCollectionParams,
    CreateFolderParams,
    CreateTagParams,
    Folder,
    GetCollectionsParams,
    ImportResult,
    MetadataResult,
    PaginatedData,
    SearchParams,
    SearchResultItem,
    Tag,
    UpdateCollectionParams,
    UpdateFolderParams,
    UpdateTagParams,
    UploadResult,
} from '../types';

import { FavoritesApi } from './FavoritesApi';

// Tauri 2 invoke 函数类型声明
// withGlobalTauri: true 时，invoke 通过 window.__TAURI__.core.invoke 调用
// 但更推荐用 @tauri-apps/api 包的 invoke，方便类型安全

/**
 * 将 File 对象转为可传递给 Tauri invoke 的 Uint8Array 数字数组
 * Tauri invoke 支持 Vec<u8> 参数，前端传 number[] 即可
 */
async function fileToArrayBuffer(file: File): Promise<number[]> {
    const arrayBuffer = await file.arrayBuffer();
    return Array.from(new Uint8Array(arrayBuffer));
}

/**
 * Tauri IPC API 适配器
 * 通过 invoke() 调用 Rust 后端命令，无需 camelCase/snake_case 转换
 * Rust serde 层自动处理 JSON key 映射
 */
export class TauriApi extends FavoritesApi {
    private invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

    constructor() {
        super();
        // 动态获取 invoke 函数，优先使用 @tauri-apps/api 包
        // 如果未安装则使用 window.__TAURI__.core.invoke
        this.invoke = TauriApi.getInvokeFn();
    }

    private static getInvokeFn(): (cmd: string, args?: Record<string, unknown>) => Promise<unknown> {
        // 使用全局 __TAURI__ 对象（withGlobalTauri: true 模式）
        // @tauri-apps/api 包可选安装，这里优先用全局对象避免依赖问题
        const tauriObj = (window as unknown as Record<string, unknown>).__TAURI__ as Record<string, unknown> | undefined;
        if (tauriObj) {
            const core = tauriObj.core as Record<string, unknown>;
            const invokeFn = core?.invoke as ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined;
            if (invokeFn) {
                return invokeFn;
            }
        }

        // 尝试动态 import @tauri-apps/api
        // 这种方式在 Vite 环境下可以正确处理 ESM 模块
        let cachedInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
        return async (cmd: string, args?: Record<string, unknown>) => {
            if (!cachedInvoke) {
                // @ts-expect-error - 动态 import，仅在 Tauri 环境下可用
                const module = await import('@tauri-apps/api/core');
                cachedInvoke = module.invoke as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
            }
            return cachedInvoke(cmd, args);
        };
    }

    private async call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        const result = await this.invoke(cmd, args);
        return result as T;
    }

    // ==================== 收藏项 ====================

    async getCollections(params?: GetCollectionsParams): Promise<PaginatedData<Collection>> {
        return this.call<PaginatedData<Collection>>('get_collections', { params: params ?? null });
    }

    async getCollectionById(id: string): Promise<Collection> {
        return this.call<Collection>('get_collection_by_id', { id });
    }

    async createCollection(data: CreateCollectionParams): Promise<Collection> {
        return this.call<Collection>('create_collection', { data });
    }

    async updateCollection(id: string, data: UpdateCollectionParams): Promise<Collection> {
        return this.call<Collection>('update_collection', { id, data });
    }

    async deleteCollection(id: string): Promise<void> {
        return this.call<void>('delete_collection', { id });
    }

    async batchDeleteCollections(ids: string[]): Promise<{ deletedCount: number }> {
        return this.call<{ deletedCount: number }>('batch_delete_collections', { ids });
    }

    async batchMoveCollections(ids: string[], folderId: string | null): Promise<{ movedCount: number }> {
        return this.call<{ movedCount: number }>('batch_move_collections', { ids, folderId });
    }

    async batchAddTags(ids: string[], tagIds: string[], action: 'add' | 'replace' = 'add'): Promise<{ updatedCount: number }> {
        return this.call<{ updatedCount: number }>('batch_add_tags', { ids, tagIds, action });
    }

    async toggleFavorite(id: string): Promise<{ id: string; isFavorite: boolean }> {
        return this.call<{ id: string; isFavorite: boolean }>('toggle_favorite', { id });
    }

    async moveCollection(id: string, folderId: string): Promise<{ id: string; folderId: string }> {
        return this.call<{ id: string; folderId: string }>('move_collection', { id, folderId });
    }

    // ==================== 文件夹 ====================

    async getFolderTree(): Promise<Folder[]> {
        return this.call<Folder[]>('get_folder_tree');
    }

    async createFolder(data: CreateFolderParams): Promise<Folder> {
        return this.call<Folder>('create_folder', { data });
    }

    async updateFolder(id: string, data: UpdateFolderParams): Promise<Folder> {
        return this.call<Folder>('update_folder', { id, data });
    }

    async deleteFolder(id: string): Promise<void> {
        return this.call<void>('delete_folder', { id });
    }

    // ==================== 标签 ====================

    async getTags(): Promise<Tag[]> {
        return this.call<Tag[]>('get_tags');
    }

    async createTag(data: CreateTagParams): Promise<Tag> {
        return this.call<Tag>('create_tag', { data });
    }

    async updateTag(id: string, data: UpdateTagParams): Promise<Tag> {
        return this.call<Tag>('update_tag', { id, data });
    }

    async deleteTag(id: string): Promise<void> {
        return this.call<void>('delete_tag', { id });
    }

    // ==================== 搜索 ====================

    async searchCollections(params: SearchParams): Promise<PaginatedData<SearchResultItem>> {
        return this.call<PaginatedData<SearchResultItem>>('search_collections', { params });
    }

    // ==================== 文件上传 ====================

    async uploadFile(file: File, folderId?: string): Promise<UploadResult> {
        const fileData = await fileToArrayBuffer(file);
        return this.call<UploadResult>('upload_file', {
            fileName: file.name,
            fileData,
            mimeType: file.type || 'application/octet-stream',
            fileSize: file.size,
            folderId: folderId ?? null,
        });
    }

    // ==================== 回收站 ====================

    async getTrashCollections(params?: { page?: number; pageSize?: number }): Promise<PaginatedData<Collection>> {
        return this.call<PaginatedData<Collection>>('get_trash_collections', { params: params ?? null });
    }

    async restoreCollection(id: string): Promise<void> {
        return this.call<void>('restore_collection', { id });
    }

    async restoreAllCollections(): Promise<void> {
        return this.call<void>('restore_all_collections');
    }

    async permanentDeleteCollection(id: string): Promise<void> {
        return this.call<void>('permanent_delete_collection', { id });
    }

    async emptyTrash(): Promise<void> {
        return this.call<void>('empty_trash');
    }

    // ==================== 元数据 ====================

    async fetchMetadata(url: string): Promise<MetadataResult> {
        return this.call<MetadataResult>('fetch_metadata', { url });
    }

    // ==================== AI ====================

    async extractSummary(url: string): Promise<{ summary: string }> {
        return this.call<{ summary: string }>('extract_summary', { url });
    }

    // ==================== 导入/导出 ====================

    async exportJSON(): Promise<void> {
        // Tauri 模式：Rust 端用原生对话框选保存路径 + 直接写文件
        return this.call<void>('export_json');
    }

    async exportHTML(): Promise<void> {
        return this.call<void>('export_html');
    }

    async importJSON(file: File): Promise<ImportResult> {
        const fileData = await fileToArrayBuffer(file);
        return this.call<ImportResult>('import_json', {
            fileName: file.name,
            fileData,
        });
    }

    async importHTML(file: File): Promise<ImportResult> {
        const fileData = await fileToArrayBuffer(file);
        return this.call<ImportResult>('import_html', {
            fileName: file.name,
            fileData,
        });
    }

    // ==================== 数据管理 ====================

    async getStorageInfo(): Promise<{ dataDir: string; dbSize: number; uploadsSize: number }> {
        return this.call<{ dataDir: string; dbSize: number; uploadsSize: number }>('get_storage_info');
    }

    async backupDatabase(): Promise<string> {
        return this.call<string>('backup_database');
    }

    async restoreDatabase(backupPath: string): Promise<void> {
        return this.call<void>('restore_database', { backupPath });
    }

    async listBackups(): Promise<Array<{ name: string; path: string; size: number; modifiedAt: string }>> {
        return this.call<Array<{ name: string; path: string; size: number; modifiedAt: string }>>('list_backups');
    }

    async deleteBackup(path: string): Promise<void> {
        return this.call<void>('delete_backup', { path });
    }

    async getDataDir(): Promise<string> {
        return this.call<string>('get_data_dir');
    }
}