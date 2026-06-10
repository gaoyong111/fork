import type {
    AiConfig,
    AppPreferences,
    BackupRecord,
    Collection,
    CreateCollectionParams,
    CreateFolderParams,
    CreateTagParams,
    DeepReadOptions,
    DeepReadResult,
    Folder,
    GetCollectionsParams,
    ImportResult,
    MetadataResult,
    MoveCollectionResult,
    PaginatedData,
    SearchParams,
    SearchResultItem,
    StorageInfo,
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
        // withGlobalTauri: true 模式下，Tauri API 已注入到 window.__TAURI__
        // 不需要 @tauri-apps/api npm 包
        const tauriObj = (window as unknown as Record<string, unknown>).__TAURI__ as Record<string, unknown> | undefined;
        if (tauriObj) {
            const core = tauriObj.core as Record<string, unknown>;
            const invokeFn = core?.invoke as ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined;
            if (invokeFn) {
                return invokeFn;
            }
        }

        // 不在 Tauri 环境 → createApi 会返回 HttpApi，此处不应走到
        throw new Error('Tauri 环境未检测到，无法获取 invoke 函数');
    }

    private async call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        try {
            const result = await this.invoke(cmd, args);
            return result as T;
        } catch (err) {
            // Tauri invoke 错误可能是字符串或对象，统一提取消息
            const message = typeof err === 'string' ? err
                : (err as Record<string, unknown>)?.message as string
                ?? (err as Record<string, unknown>)?.error as string
                ?? String(err);
            throw new Error(message);
        }
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
        const result = await this.call<{ id: string; isFavorite: boolean }>('toggle_favorite', { id });
        return {
            id: result.id,
            isFavorite: result.isFavorite === true || (result.isFavorite as unknown) === 1,
        };
    }

    async moveCollection(id: string, folderId: string | null): Promise<MoveCollectionResult> {
        return this.call<MoveCollectionResult>('move_collection', { id, folderId });
    }

    async toggleArchive(id: string): Promise<{ id: string; isArchived: boolean }> {
        const result = await this.call<{ id: string; isArchived: boolean }>('toggle_archive', { id });
        return {
            id: result.id,
            isArchived: result.isArchived === true || (result.isArchived as unknown) === 1,
        };
    }

    async incrementReadCount(id: string): Promise<{ id: string; readCount: number }> {
        return this.call<{ id: string; readCount: number }>('increment_read_count', { id });
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
        const MAX_BYTES = 50 * 1024 * 1024;
        if (file.size > MAX_BYTES) {
            throw new Error('文件大小不能超过 50MB');
        }
        const fileData = await fileToArrayBuffer(file);
        return this.call<UploadResult>('upload_file', {
            fileName: file.name,
            fileData,
            mimeType: file.type || 'application/octet-stream',
            fileSize: file.size,
            folderId: folderId ?? null,
        });
    }

    async uploadFileFromDialog(folderId?: string): Promise<UploadResult> {
        return this.call<UploadResult>('upload_file_dialog', {
            folderId: folderId ?? null,
        });
    }

    async uploadFileFromPath(path: string, folderId?: string | null): Promise<UploadResult> {
        return this.call<UploadResult>('upload_file_from_path', {
            sourcePath: path,
            folderId: folderId ?? null,
        });
    }

    async openFile(collectionId: string): Promise<void> {
        return this.call<void>('open_file', { collectionId });
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

    async deepRead(url: string, options?: DeepReadOptions): Promise<DeepReadResult> {
        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted', 'AbortError');
        }

        const invokePromise = this.call<DeepReadResult>('deep_read', {
            url,
            rawContent: options?.rawContent ?? null,
            refetch: options?.refetch ?? null,
            templateType: options?.templateType ?? null,
            userDirection: options?.userDirection ?? null,
            previousSummary: options?.previousSummary ?? null,
            summaryMode: options?.summaryMode ?? null,
        });

        if (!options?.signal) {
            return invokePromise;
        }

        return new Promise<DeepReadResult>((resolve, reject) => {
            const onAbort = () => {
                void this.cancelDeepRead();
                reject(new DOMException('The operation was aborted', 'AbortError'));
            };
            options.signal!.addEventListener('abort', onAbort, { once: true });

            invokePromise
                .then((result) => {
                    options.signal!.removeEventListener('abort', onAbort);
                    if (options.signal!.aborted) {
                        reject(new DOMException('The operation was aborted', 'AbortError'));
                        return;
                    }
                    resolve(result);
                })
                .catch((err) => {
                    options.signal!.removeEventListener('abort', onAbort);
                    reject(err);
                });
        });
    }

    async cancelDeepRead(): Promise<void> {
        return this.call<void>('cancel_deep_read');
    }

    // ==================== 导入/导出 ====================

    async exportJSON(): Promise<string> {
        return this.call<string>('export_json');
    }

    async exportHTML(): Promise<string> {
        return this.call<string>('export_html');
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

    async getStorageInfo(): Promise<StorageInfo> {
        return this.call<StorageInfo>('get_storage_info');
    }

    async backupDatabase(): Promise<string> {
        return this.call<string>('backup_database');
    }

    async restoreDatabase(backupPath: string): Promise<void> {
        return this.call<void>('restore_database', { backupPath });
    }

    async listBackups(): Promise<BackupRecord[]> {
        return this.call<BackupRecord[]>('list_backups');
    }

    async deleteBackup(path: string): Promise<void> {
        return this.call<void>('delete_backup', { path });
    }

    async getDataDir(): Promise<string> {
        return this.call<string>('get_data_dir');
    }

    // ==================== AI 设置 ====================

    async getAiConfig(): Promise<AiConfig> {
        return this.call<AiConfig>('get_ai_config');
    }

    async setAiConfig(config: AiConfig): Promise<AiConfig> {
        return this.call<AiConfig>('set_ai_config', { config });
    }

    async testAiConnection(config?: AiConfig): Promise<{ success: boolean; model: string; message: string }> {
        return this.call<{ success: boolean; model: string; message: string }>('test_ai_connection', { config: config ?? null });
    }

    async getAppPreferences(): Promise<AppPreferences> {
        return this.call<AppPreferences>('get_app_preferences');
    }

    async setAppPreferences(preferences: AppPreferences): Promise<AppPreferences> {
        return this.call<AppPreferences>('set_app_preferences', { preferences });
    }
}