/**
 * API 服务层 - 封装所有后端 API 调用
 * 基础路径：/api
 * 包含 camelCase（前端）与 snake_case（后端）的自动双向转换
 */

import type {
    ApiResponse,
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

const API_BASE = '/api';

// ==================== 字段名转换工具 ====================

/**
 * 前端 camelCase → 后端 snake_case 的特殊映射
 * 不遵循通用 camelToSnake 转换规则的字段
 */
const CAMEL_TO_SNAKE_SPECIAL: Record<string, string> = {
    description: 'summary',
    thumbnailUrl: 'cover_url',
    pageSize: 'limit',
};

/**
 * 后端 snake_case → 前端 camelCase 的特殊映射
 * 不遵循通用 snakeToCamel 转换规则的字段
 */
const SNAKE_TO_CAMEL_SPECIAL: Record<string, string> = {
    summary: 'description',
    cover_url: 'thumbnailUrl',
    limit: 'pageSize',
};

/**
 * 将单个 camelCase 字符串转为 snake_case
 * @param str - camelCase 格式的字符串
 * @returns snake_case 格式的字符串
 */
function camelToSnakeStr(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * 将单个 snake_case 字符串转为 camelCase
 * @param str - snake_case 格式的字符串
 * @returns camelCase 格式的字符串
 */
function snakeToCamelStr(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 递归转换对象的所有 key
 * @param obj - 要转换的值（对象、数组或原始值）
 * @param transform - key 转换函数
 * @param specialMap - 特殊映射表（优先于通用转换）
 * @returns 转换后的值
 */
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
            // 优先使用特殊映射，否则使用通用转换
            const newKey = specialMap?.[key] ?? transform(key);
            result[newKey] = transformKeys(value, transform, specialMap);
        }
        return result;
    }

    // 原始值直接返回
    return obj;
}

/**
 * 将对象的 key 从 camelCase 转为 snake_case
 * @param obj - 要转换的值
 * @returns 转换后的值
 */
function camelToSnake(obj: unknown): unknown {
    return transformKeys(obj, camelToSnakeStr, CAMEL_TO_SNAKE_SPECIAL);
}

/**
 * 将对象的 key 从 snake_case 转为 camelCase
 * @param obj - 要转换的值
 * @returns 转换后的值
 */
function snakeToCamel(obj: unknown): unknown {
    return transformKeys(obj, snakeToCamelStr, SNAKE_TO_CAMEL_SPECIAL);
}

// ==================== 请求方法 ====================

/**
 * 通用请求方法
 * 自动处理 camelCase/snake_case 双向转换：
 * - 请求体和查询参数：camelCase → snake_case
 * - 响应数据：snake_case → camelCase
 * @param url - 请求路径（不含基础路径），支持 query string
 * @param options - fetch 选项
 * @returns 解析后的 JSON 数据（key 已转为 camelCase）
 * @throws 当响应状态码非 2xx 时抛出错误
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
    // 处理 URL 中的 query params：将 camelCase 转为 snake_case
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

    // 处理请求体：将 camelCase 转为 snake_case
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

    const response = await fetch(`${API_BASE}${processedUrl}`, {
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

    // 将响应数据从 snake_case 转为 camelCase
    return snakeToCamel(result.data) as T;
}

// ==================== 收藏项 API ====================

/**
 * 获取收藏项列表
 * @param params - 查询参数
 * @returns 分页的收藏项列表
 */
export async function getCollections(
    params?: GetCollectionsParams,
): Promise<PaginatedData<Collection>> {
    const searchParams = new URLSearchParams();

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                searchParams.set(key, String(value));
            }
        });
    }

    const query = searchParams.toString();
    const url = `/collections${query ? `?${query}` : ''}`;

    return request<PaginatedData<Collection>>(url);
}

/**
 * 获取单个收藏项详情
 * @param id - 收藏项 ID
 * @returns 收藏项详情
 */
export async function getCollectionById(id: string): Promise<Collection> {
    return request<Collection>(`/collections/${id}`);
}

/**
 * 创建收藏项
 * @param data - 创建参数
 * @returns 新创建的收藏项
 */
export async function createCollection(data: CreateCollectionParams): Promise<Collection> {
    return request<Collection>('/collections', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * 更新收藏项
 * @param id - 收藏项 ID
 * @param data - 更新参数
 * @returns 更新后的收藏项
 */
export async function updateCollection(
    id: string,
    data: UpdateCollectionParams,
): Promise<Collection> {
    return request<Collection>(`/collections/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * 删除收藏项
 * @param id - 收藏项 ID
 */
export async function deleteCollection(id: string): Promise<void> {
    return request<void>(`/collections/${id}`, {
        method: 'DELETE',
    });
}

/**
 * 批量删除收藏项
 * @param ids - 收藏项 ID 列表
 * @returns 删除数量
 */
export async function batchDeleteCollections(ids: string[]): Promise<{ deletedCount: number }> {
    return request<{ deletedCount: number }>('/collections/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
    });
}

/**
 * 批量移动收藏项到指定文件夹
 * @param ids - 收藏项 ID 列表
 * @param folderId - 目标文件夹 ID，null 表示移至未分类
 * @returns 移动数量
 */
export async function batchMoveCollections(
    ids: string[],
    folderId: string | null,
): Promise<{ movedCount: number }> {
    return request<{ movedCount: number }>('/collections/batch-move', {
        method: 'POST',
        body: JSON.stringify({ ids, folderId }),
    });
}

/**
 * 批量打标签
 * @param ids - 收藏项 ID 列表
 * @param tagIds - 标签 ID 列表
 * @param action - 操作类型："add" 追加标签，"replace" 替换标签
 * @returns 更新数量
 */
export async function batchAddTags(
    ids: string[],
    tagIds: string[],
    action: 'add' | 'replace' = 'add',
): Promise<{ updatedCount: number }> {
    return request<{ updatedCount: number }>('/collections/batch-tags', {
        method: 'POST',
        body: JSON.stringify({ ids, tagIds, action }),
    });
}

/**
 * 切换收藏项星标状态
 * @param id - 收藏项 ID
 * @returns 更新后的星标状态
 */
export async function toggleFavorite(id: string): Promise<{ id: string; isFavorite: boolean }> {
    return request<{ id: string; isFavorite: boolean }>(`/collections/${id}/favorite`, {
        method: 'POST',
    });
}

/**
 * 移动收藏项到指定文件夹
 * @param id - 收藏项 ID
 * @param folderId - 目标文件夹 ID
 * @returns 移动结果
 */
export async function moveCollection(
    id: string,
    folderId: string,
): Promise<{ id: string; folderId: string }> {
    return request<{ id: string; folderId: string }>(`/collections/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ folderId }),
    });
}

// ==================== 文件夹 API ====================

/**
 * 获取文件夹树形结构
 * @returns 文件夹树
 */
export async function getFolderTree(): Promise<Folder[]> {
    return request<Folder[]>('/folders');
}

/**
 * 创建文件夹
 * @param data - 创建参数
 * @returns 新创建的文件夹
 */
export async function createFolder(data: CreateFolderParams): Promise<Folder> {
    return request<Folder>('/folders', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * 更新文件夹
 * @param id - 文件夹 ID
 * @param data - 更新参数
 * @returns 更新后的文件夹
 */
export async function updateFolder(id: string, data: UpdateFolderParams): Promise<Folder> {
    return request<Folder>(`/folders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * 删除文件夹
 * @param id - 文件夹 ID
 */
export async function deleteFolder(id: string): Promise<void> {
    return request<void>(`/folders/${id}`, {
        method: 'DELETE',
    });
}

// ==================== 标签 API ====================

/**
 * 获取所有标签列表
 * @returns 标签列表
 */
export async function getTags(): Promise<Tag[]> {
    return request<Tag[]>('/tags');
}

/**
 * 创建标签
 * @param data - 创建参数
 * @returns 新创建的标签
 */
export async function createTag(data: CreateTagParams): Promise<Tag> {
    return request<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * 更新标签
 * @param id - 标签 ID
 * @param data - 更新参数
 * @returns 更新后的标签
 */
export async function updateTag(id: string, data: UpdateTagParams): Promise<Tag> {
    return request<Tag>(`/tags/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * 删除标签
 * @param id - 标签 ID
 */
export async function deleteTag(id: string): Promise<void> {
    return request<void>(`/tags/${id}`, {
        method: 'DELETE',
    });
}

// ==================== 搜索 API ====================

/**
 * 全文搜索收藏项
 * @param params - 搜索参数
 * @returns 搜索结果
 */
export async function searchCollections(
    params: SearchParams,
): Promise<PaginatedData<SearchResultItem>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.set(key, String(value));
        }
    });

    return request<PaginatedData<SearchResultItem>>(`/search?${searchParams.toString()}`);
}

// ==================== 文件上传 API ====================

/**
 * 上传文件
 * FormData 中的字段名会自动从 camelCase 转为 snake_case
 * @param file - 要上传的文件
 * @param folderId - 关联文件夹 ID（可选）
 * @returns 上传结果
 */
export async function uploadFile(
    file: File,
    folderId?: string,
): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) {
        // FormData 字段名也需要转换：folderId → folder_id
        formData.append('folder_id', folderId);
    }

    const response = await fetch(`${API_BASE}/upload`, {
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

    // 将上传响应数据从 snake_case 转为 camelCase
    return snakeToCamel(result.data) as UploadResult;
}

// ==================== 回收站 API ====================

/**
 * 获取回收站列表（已删除的收藏项）
 * @param params - 查询参数（page, pageSize）
 * @returns 分页的已删除收藏项列表
 */
export async function getTrashCollections(
    params?: { page?: number; pageSize?: number },
): Promise<PaginatedData<Collection>> {
    const searchParams = new URLSearchParams();

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                searchParams.set(key, String(value));
            }
        });
    }

    const query = searchParams.toString();
    const url = `/trash${query ? `?${query}` : ''}`;

    return request<PaginatedData<Collection>>(url);
}

/**
 * 恢复单个收藏项
 * @param id - 收藏项 ID
 */
export async function restoreCollection(id: string): Promise<void> {
    return request<void>(`/trash/${id}/restore`, {
        method: 'POST',
    });
}

/**
 * 恢复全部已删除收藏项
 */
export async function restoreAllCollections(): Promise<void> {
    return request<void>('/trash/restore-all', {
        method: 'POST',
    });
}

/**
 * 永久删除单个收藏项
 * @param id - 收藏项 ID
 */
export async function permanentDeleteCollection(id: string): Promise<void> {
    return request<void>(`/trash/${id}`, {
        method: 'DELETE',
    });
}

/**
 * 清空回收站（永久删除所有已删除项）
 */
export async function emptyTrash(): Promise<void> {
    return request<void>('/trash/empty', {
        method: 'DELETE',
    });
}

// ==================== 元数据提取 API ====================

/**
 * 根据 URL 提取页面元数据（标题、描述、封面图、favicon）
 * @param url - 目标页面 URL
 * @returns 提取到的元数据
 */
export async function fetchMetadata(url: string): Promise<MetadataResult> {
    return request<MetadataResult>('/metadata', {
        method: 'POST',
        body: JSON.stringify({ url }),
    });
}

// ==================== AI 服务 API ====================

/**
 * AI 提取文章内容并生成精读摘要
 * @param url - 文章 URL
 * @returns AI 生成的精读摘要（HTML 格式）
 */
export async function extractSummary(url: string): Promise<{ summary: string }> {
    return request<{ summary: string }>('/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ url }),
    });
}

// ==================== 数据导入/导出 API ====================

/**
 * 导出全部数据为 JSON 备份文件
 * 触发浏览器文件下载
 */
export async function exportJSON(): Promise<void> {
    const response = await fetch(`${API_BASE}/export/json`);

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
            errorData?.message || `导出失败: ${response.status}`,
        );
    }

    const blob = await response.blob();
    downloadBlob(blob, getExportFilename('favorites-backup', '.json'));
}

/**
 * 导出为浏览器通用书签 HTML 文件
 * 触发浏览器文件下载
 */
export async function exportHTML(): Promise<void> {
    const response = await fetch(`${API_BASE}/export/html`);

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
            errorData?.message || `导出失败: ${response.status}`,
        );
    }

    const blob = await response.blob();
    downloadBlob(blob, getExportFilename('bookmarks', '.html'));
}

/**
 * 导入 JSON 备份文件
 * @param file - 要导入的 JSON 文件
 * @returns 导入结果统计
 */
export async function importJSON(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/import/json`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
            errorData?.message || `导入失败: ${response.status}`,
        );
    }

    const result: ApiResponse<ImportResult> = await response.json();

    if (result.code !== 0) {
        throw new Error(result.message || '导入失败');
    }

    return snakeToCamel(result.data) as ImportResult;
}

/**
 * 导入浏览器书签 HTML 文件
 * @param file - 要导入的 HTML 书签文件
 * @returns 导入结果统计
 */
export async function importHTML(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/import/html`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
            errorData?.message || `导入失败: ${response.status}`,
        );
    }

    const result: ApiResponse<ImportResult> = await response.json();

    if (result.code !== 0) {
        throw new Error(result.message || '导入失败');
    }

    return snakeToCamel(result.data) as ImportResult;
}

/**
 * 生成导出文件名（带日期）
 * @param prefix - 文件名前缀
 * @param ext - 文件扩展名
 * @returns 完整文件名
 */
function getExportFilename(prefix: string, ext: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${prefix}-${date}${ext}`;
}

/**
 * 通过创建临时 <a> 标签触发文件下载
 * @param blob - 文件内容
 * @param filename - 下载文件名
 */
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
