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

/**
 * API 适配器抽象接口
 * 定义所有数据操作方法，HttpApi 和 TauriApi 分别实现
 */
export abstract class FavoritesApi {
    // ==================== 收藏项 ====================

    abstract getCollections(params?: GetCollectionsParams): Promise<PaginatedData<Collection>>;
    abstract getCollectionById(id: string): Promise<Collection>;
    abstract createCollection(data: CreateCollectionParams): Promise<Collection>;
    abstract updateCollection(id: string, data: UpdateCollectionParams): Promise<Collection>;
    abstract deleteCollection(id: string): Promise<void>;
    abstract batchDeleteCollections(ids: string[]): Promise<{ deletedCount: number }>;
    abstract batchMoveCollections(ids: string[], folderId: string | null): Promise<{ movedCount: number }>;
    abstract batchAddTags(ids: string[], tagIds: string[], action?: 'add' | 'replace'): Promise<{ updatedCount: number }>;
    abstract toggleFavorite(id: string): Promise<{ id: string; isFavorite: boolean }>;
    abstract moveCollection(id: string, folderId: string | null): Promise<MoveCollectionResult>;
    abstract toggleArchive(id: string): Promise<{ id: string; isArchived: boolean }>;
    abstract incrementReadCount(id: string): Promise<{ id: string; readCount: number }>;

    // ==================== 文件夹 ====================

    abstract getFolderTree(): Promise<Folder[]>;
    abstract createFolder(data: CreateFolderParams): Promise<Folder>;
    abstract updateFolder(id: string, data: UpdateFolderParams): Promise<Folder>;
    abstract deleteFolder(id: string): Promise<void>;

    // ==================== 标签 ====================

    abstract getTags(): Promise<Tag[]>;
    abstract createTag(data: CreateTagParams): Promise<Tag>;
    abstract updateTag(id: string, data: UpdateTagParams): Promise<Tag>;
    abstract deleteTag(id: string): Promise<void>;

    // ==================== 搜索 ====================

    abstract searchCollections(params: SearchParams): Promise<PaginatedData<SearchResultItem>>;

    // ==================== 文件上传 ====================

    abstract uploadFile(file: File, folderId?: string): Promise<UploadResult>;
    abstract openFile(collectionId: string): Promise<void>;

    // ==================== 回收站 ====================

    abstract getTrashCollections(params?: { page?: number; pageSize?: number }): Promise<PaginatedData<Collection>>;
    abstract restoreCollection(id: string): Promise<void>;
    abstract restoreAllCollections(): Promise<void>;
    abstract permanentDeleteCollection(id: string): Promise<void>;
    abstract emptyTrash(): Promise<void>;

    // ==================== 元数据 ====================

    abstract fetchMetadata(url: string): Promise<MetadataResult>;

    // ==================== AI ====================

    abstract deepRead(url: string, options?: DeepReadOptions): Promise<DeepReadResult>;

    /** 取消桌面端正在执行的 deep_read（Web 端无操作） */
    cancelDeepRead(): Promise<void> {
        return Promise.resolve();
    }

    // ==================== 导入/导出 ====================

    abstract exportJSON(): Promise<string>;
    abstract exportHTML(): Promise<string>;
    abstract importJSON(file: File): Promise<ImportResult>;
    abstract importHTML(file: File): Promise<ImportResult>;

    /** 桌面端原生文件选择器上传（Web 不可用） */
    abstract uploadFileFromDialog(folderId?: string): Promise<UploadResult>;

    /** 桌面端从本地路径上传（Web 不可用） */
    uploadFileFromPath(_path: string, _folderId?: string | null): Promise<UploadResult> {
        return Promise.reject(new Error('uploadFileFromPath is desktop-only'));
    }

    // ==================== 数据管理 ====================

    abstract getStorageInfo(): Promise<StorageInfo>;
    abstract backupDatabase(): Promise<string>;
    abstract restoreDatabase(backupPath: string): Promise<void>;
    abstract listBackups(): Promise<BackupRecord[]>;
    abstract deleteBackup(path: string): Promise<void>;
    abstract getDataDir(): Promise<string>;

    // ==================== AI 设置 ====================

    abstract getAiConfig(): Promise<AiConfig>;
    abstract setAiConfig(config: AiConfig): Promise<AiConfig>;
    abstract testAiConnection(config?: AiConfig): Promise<{ success: boolean; model: string; message: string }>;

    // ==================== 应用偏好 ====================

    abstract getAppPreferences(): Promise<AppPreferences>;
    abstract setAppPreferences(preferences: AppPreferences): Promise<AppPreferences>;
}