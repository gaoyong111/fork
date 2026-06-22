import type {
    AiConfig,
    AppPreferences,
    ApiResponse,
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

/**
 * 前端 camelCase → 后端 snake_case 的特殊映射
 */
const CAMEL_TO_SNAKE_SPECIAL: Record<string, string> = {
    description: 'summary',
    thumbnailUrl: 'cover_url',
    pageSize: 'limit',
    rawContent: 'raw_content',
};

/**
 * 后端 snake_case → 前端 camelCase 的特殊映射
 */
const SNAKE_TO_CAMEL_SPECIAL: Record<string, string> = {
    summary: 'description',
    cover_url: 'thumbnailUrl',
    limit: 'pageSize',
    raw_content: 'rawContent',
};

function camelToSnakeStr(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamelStr(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformKeys(
    obj: unknown,
    transform: (key: string) => string,
    specialMap?: Record<string, string>,
): unknown {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => transformKeys(item, transform, specialMap));
    }

    if (typeof obj === 'object' && obj.constructor === Object) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            const newKey = specialMap?.[key] ?? transform(key);
            result[newKey] = transformKeys(value, transform, specialMap);
        }
        return result;
    }

    return obj;
}

function camelToSnake(obj: unknown): unknown {
    return transformKeys(obj, camelToSnakeStr, CAMEL_TO_SNAKE_SPECIAL);
}

function snakeToCamel(obj: unknown): unknown {
    return transformKeys(obj, snakeToCamelStr, SNAKE_TO_CAMEL_SPECIAL);
}

function getExportFilename(prefix: string, ext: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${prefix}-${date}${ext}`;
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * HTTP API 适配器
 * 通过 fetch 调用 Express Server，保留 camelCase/snake_case 自动转换
 */
export class HttpApi extends FavoritesApi {
    private apiBase: string;

    constructor(apiBase: string = '/api') {
        super();
        this.apiBase = apiBase;
    }

    private async request<T>(url: string, options?: RequestInit): Promise<T> {
        let processedUrl = url;
        if (url.includes('?')) {
            const [basePath, queryString] = url.split('?');
            const params = new URLSearchParams(queryString);
            const transformedParams = new URLSearchParams();

            for (const [key, value] of params.entries()) {
                const snakeKey = CAMEL_TO_SNAKE_SPECIAL[key] ?? camelToSnakeStr(key);
                transformedParams.set(snakeKey, value);
            }

            processedUrl = `${basePath}?${transformedParams.toString()}`;
        }

        let processedOptions = options;
        if (options?.body && typeof options.body === 'string') {
            try {
                const parsed = JSON.parse(options.body);
                const transformed = camelToSnake(parsed);
                processedOptions = {
                    ...options,
                    body: JSON.stringify(transformed),
                };
            } catch {
                // 非 JSON 格式的 body 不做转换
            }
        }

        const response = await fetch(`${this.apiBase}${processedUrl}`, {
            headers: {
                'Content-Type': 'application/json',
                ...processedOptions?.headers,
            },
            ...processedOptions,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(
                errorData?.message || `请求失败: ${response.status} ${response.statusText}`,
            );
        }

        const result: ApiResponse<T> = await response.json();

        if (result.code !== 0) {
            throw new Error(result.message || '请求失败');
        }

        return snakeToCamel(result.data) as T;
    }

    // ==================== 收藏项 ====================

    async getCollections(params?: GetCollectionsParams): Promise<PaginatedData<Collection>> {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && String(value) !== '') {
                    const serialized = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
                    searchParams.set(key, serialized);
                }
            });
        }
        const query = searchParams.toString();
        return this.request<PaginatedData<Collection>>(`/collections${query ? `?${query}` : ''}`);
    }

    async getCollectionById(id: string): Promise<Collection> {
        return this.request<Collection>(`/collections/${id}`);
    }

    async createCollection(data: CreateCollectionParams): Promise<Collection> {
        return this.request<Collection>('/collections', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateCollection(id: string, data: UpdateCollectionParams): Promise<Collection> {
        return this.request<Collection>(`/collections/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteCollection(id: string): Promise<void> {
        return this.request<void>(`/collections/${id}`, { method: 'DELETE' });
    }

    async batchDeleteCollections(ids: string[]): Promise<{ deletedCount: number }> {
        return this.request<{ deletedCount: number }>('/collections/batch-delete', {
            method: 'POST',
            body: JSON.stringify({ ids }),
        });
    }

    async batchMoveCollections(ids: string[], folderId: string | null): Promise<{ movedCount: number }> {
        return this.request<{ movedCount: number }>('/collections/batch-move', {
            method: 'POST',
            body: JSON.stringify({ ids, folderId }),
        });
    }

    async batchAddTags(ids: string[], tagIds: string[], action: 'add' | 'replace' = 'add'): Promise<{ updatedCount: number }> {
        return this.request<{ updatedCount: number }>('/collections/batch-tags', {
            method: 'POST',
            body: JSON.stringify({ ids, tagIds, action }),
        });
    }

    async toggleFavorite(id: string): Promise<{ id: string; isFavorite: boolean }> {
        const result = await this.request<{ id: string; isFavorite: number | boolean }>(`/collections/${id}/favorite`, {
            method: 'POST',
        });
        return {
            id: result.id,
            isFavorite: result.isFavorite === true || result.isFavorite === 1,
        };
    }

    async moveCollection(id: string, folderId: string | null): Promise<MoveCollectionResult> {
        return this.request<MoveCollectionResult>(`/collections/${id}/move`, {
            method: 'POST',
            body: JSON.stringify({ folderId }),
        });
    }

    async toggleArchive(id: string): Promise<{ id: string; isArchived: boolean }> {
        const result = await this.request<{ id: string; isArchived: number | boolean }>(`/collections/${id}/archive`, {
            method: 'POST',
        });
        return {
            id: result.id,
            isArchived: result.isArchived === true || result.isArchived === 1,
        };
    }

    async incrementReadCount(id: string): Promise<{ id: string; readCount: number }> {
        return this.request<{ id: string; readCount: number }>(`/collections/${id}/read`, {
            method: 'POST',
        });
    }

    // ==================== 文件夹 ====================

    async getFolderTree(): Promise<Folder[]> {
        return this.request<Folder[]>('/folders');
    }

    async createFolder(data: CreateFolderParams): Promise<Folder> {
        return this.request<Folder>('/folders', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateFolder(id: string, data: UpdateFolderParams): Promise<Folder> {
        return this.request<Folder>(`/folders/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteFolder(id: string): Promise<void> {
        return this.request<void>(`/folders/${id}`, { method: 'DELETE' });
    }

    // ==================== 标签 ====================

    async getTags(): Promise<Tag[]> {
        return this.request<Tag[]>('/tags');
    }

    async createTag(data: CreateTagParams): Promise<Tag> {
        return this.request<Tag>('/tags', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateTag(id: string, data: UpdateTagParams): Promise<Tag> {
        return this.request<Tag>(`/tags/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteTag(id: string): Promise<void> {
        return this.request<void>(`/tags/${id}`, { method: 'DELETE' });
    }

    // ==================== 搜索 ====================

    async searchCollections(params: SearchParams): Promise<PaginatedData<SearchResultItem>> {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && String(value) !== '') {
                searchParams.set(key, String(value));
            }
        });
        return this.request<PaginatedData<SearchResultItem>>(`/search?${searchParams.toString()}`);
    }

    // ==================== 文件上传 ====================

    async uploadFile(file: File, folderId?: string): Promise<UploadResult> {
        const MAX_BYTES = 50 * 1024 * 1024;
        if (file.size > MAX_BYTES) {
            throw new Error('文件大小不能超过 50MB');
        }

        const formData = new FormData();
        formData.append('file', file);
        if (folderId) {
            formData.append('folder_id', folderId);
        }

        const response = await fetch(`${this.apiBase}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(
                errorData?.message || `上传失败: ${response.status} ${response.statusText}`,
            );
        }

        const result: ApiResponse<UploadResult> = await response.json();

        if (result.code !== 0) {
            throw new Error(result.message || '上传失败');
        }

        return snakeToCamel(result.data) as UploadResult;
    }

    async uploadFileFromDialog(_folderId?: string): Promise<UploadResult> {
        throw new Error('仅在桌面端可用');
    }

    async openFile(_collectionId: string): Promise<void> {
        throw new Error('仅在桌面端可用');
    }

    // ==================== 回收站 ====================

    async getTrashCollections(params?: { page?: number; pageSize?: number }): Promise<PaginatedData<Collection>> {
        const searchParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && String(value) !== '') {
                    const serialized = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
                    searchParams.set(key, serialized);
                }
            });
        }
        const query = searchParams.toString();
        return this.request<PaginatedData<Collection>>(`/trash${query ? `?${query}` : ''}`);
    }

    async restoreCollection(id: string): Promise<void> {
        return this.request<void>(`/trash/${id}/restore`, { method: 'POST' });
    }

    async restoreAllCollections(): Promise<void> {
        return this.request<void>('/trash/restore-all', { method: 'POST' });
    }

    async permanentDeleteCollection(id: string): Promise<void> {
        return this.request<void>(`/trash/${id}`, { method: 'DELETE' });
    }

    async emptyTrash(): Promise<void> {
        return this.request<void>('/trash/empty', { method: 'DELETE' });
    }

    // ==================== 元数据 ====================

    async fetchMetadata(url: string): Promise<MetadataResult> {
        return this.request<MetadataResult>('/metadata', {
            method: 'POST',
            body: JSON.stringify({ url }),
        });
    }

    // ==================== AI ====================

    async deepRead(url: string, options?: DeepReadOptions): Promise<DeepReadResult> {
        return this.request<DeepReadResult>('/ai/deep-read', {
            method: 'POST',
            body: JSON.stringify({
                url,
                rawContent: options?.rawContent,
                images: options?.images,
                refetch: options?.refetch,
                templateType: options?.templateType,
                userDirection: options?.userDirection,
                previousSummary: options?.previousSummary,
                summaryMode: options?.summaryMode,
                sourceMode: options?.sourceMode,
            }),
            signal: options?.signal,
        });
    }

    // ==================== 导入/导出 ====================

    async exportJSON(): Promise<string> {
        const response = await fetch(`${this.apiBase}/export/json`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.message || `导出失败: ${response.status}`);
        }
        const blob = await response.blob();
        downloadBlob(blob, getExportFilename('favorites-backup', '.json'));
        return '';
    }

    async exportHTML(): Promise<string> {
        const response = await fetch(`${this.apiBase}/export/html`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.message || `导出失败: ${response.status}`);
        }
        const blob = await response.blob();
        downloadBlob(blob, getExportFilename('bookmarks', '.html'));
        return '';
    }

    async importJSON(file: File): Promise<ImportResult> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.apiBase}/import/json`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.message || `导入失败: ${response.status}`);
        }

        const result: ApiResponse<ImportResult> = await response.json();
        if (result.code !== 0) {
            throw new Error(result.message || '导入失败');
        }

        return snakeToCamel(result.data) as ImportResult;
    }

    async importHTML(file: File): Promise<ImportResult> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.apiBase}/import/html`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.message || `导入失败: ${response.status}`);
        }

        const result: ApiResponse<ImportResult> = await response.json();
        if (result.code !== 0) {
            throw new Error(result.message || '导入失败');
        }

        return snakeToCamel(result.data) as ImportResult;
    }

    // ==================== 数据管理 ====================
    // Web 模式不支持本地备份恢复，这些方法仅在桌面端可用

    async getStorageInfo(): Promise<StorageInfo> {
        throw new Error('数据管理功能仅在桌面端可用');
    }

    async backupDatabase(): Promise<string> {
        throw new Error('备份功能仅在桌面端可用');
    }

    async restoreDatabase(_backupPath: string): Promise<void> {
        throw new Error('恢复功能仅在桌面端可用');
    }

    async listBackups(): Promise<BackupRecord[]> {
        throw new Error('数据管理功能仅在桌面端可用');
    }

    async deleteBackup(_path: string): Promise<void> {
        throw new Error('数据管理功能仅在桌面端可用');
    }

    async getDataDir(): Promise<string> {
        throw new Error('数据管理功能仅在桌面端可用');
    }

    // ==================== AI 设置 ====================

    async getAiConfig(): Promise<AiConfig> {
        throw new Error('AI 设置功能仅在桌面端可用');
    }

    async setAiConfig(_config: AiConfig): Promise<AiConfig> {
        throw new Error('AI 设置功能仅在桌面端可用');
    }

    async testAiConnection(_config?: AiConfig): Promise<{ success: boolean; model: string; message: string }> {
        throw new Error('AI 设置功能仅在桌面端可用');
    }

    // ==================== 应用偏好（Web 端 localStorage） ====================

    private static readonly APP_PREFS_KEY = 'favorites.appPreferences';

    private static defaultAppPreferences(): AppPreferences {
        return { autoDeepRead: true, defaultSummaryMode: 'detailed' };
    }

    async getAppPreferences(): Promise<AppPreferences> {
        const defaults = HttpApi.defaultAppPreferences();
        if (typeof localStorage === 'undefined') return defaults;
        const raw = localStorage.getItem(HttpApi.APP_PREFS_KEY);
        if (!raw) return defaults;
        try {
            const parsed = JSON.parse(raw) as Partial<AppPreferences>;
            return {
                autoDeepRead: parsed.autoDeepRead ?? defaults.autoDeepRead,
                defaultSummaryMode: parsed.defaultSummaryMode === 'brief' ? 'brief' : 'detailed',
            };
        } catch {
            return defaults;
        }
    }

    async setAppPreferences(preferences: AppPreferences): Promise<AppPreferences> {
        const normalized: AppPreferences = {
            autoDeepRead: preferences.autoDeepRead,
            defaultSummaryMode: preferences.defaultSummaryMode === 'brief' ? 'brief' : 'detailed',
        };
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(HttpApi.APP_PREFS_KEY, JSON.stringify(normalized));
        }
        return normalized;
    }
}