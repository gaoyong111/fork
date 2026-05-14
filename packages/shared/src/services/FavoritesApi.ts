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
    abstract moveCollection(id: string, folderId: string): Promise<{ id: string; folderId: string }>;

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

    // ==================== 回收站 ====================

    abstract getTrashCollections(params?: { page?: number; pageSize?: number }): Promise<PaginatedData<Collection>>;
    abstract restoreCollection(id: string): Promise<void>;
    abstract restoreAllCollections(): Promise<void>;
    abstract permanentDeleteCollection(id: string): Promise<void>;
    abstract emptyTrash(): Promise<void>;

    // ==================== 元数据 ====================

    abstract fetchMetadata(url: string): Promise<MetadataResult>;

    // ==================== AI ====================

    abstract extractSummary(url: string): Promise<{ summary: string }>;

    // ==================== 导入/导出 ====================

    abstract exportJSON(): Promise<void>;
    abstract exportHTML(): Promise<void>;
    abstract importJSON(file: File): Promise<ImportResult>;
    abstract importHTML(file: File): Promise<ImportResult>;

    // ==================== 数据管理 ====================

    abstract getStorageInfo(): Promise<{ dataDir: string; dbSize: number; uploadsSize: number }>;
    abstract backupDatabase(): Promise<string>;
    abstract restoreDatabase(backupPath: string): Promise<void>;
    abstract listBackups(): Promise<Array<{ name: string; path: string; size: number; modifiedAt: string }>>;
    abstract deleteBackup(path: string): Promise<void>;
    abstract getDataDir(): Promise<string>;
}