/**
 * 收藏项类型常量
 */
export const CollectionType = {
    Link: 'link',
    File: 'file',
    Note: 'note',
} as const;

/**
 * 收藏项类型
 */
export type CollectionType = (typeof CollectionType)[keyof typeof CollectionType];

/**
 * 标签接口
 */
export interface Tag {
    id: string;
    name: string;
    color: string;
    collectionCount?: number;
    createdAt: string;
}

/**
 * 文件夹接口
 */
export interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    sortOrder: number;
    collectionCount?: number;
    createdAt: string;
    updatedAt: string;
    children?: Folder[];
}

/**
 * 收藏项接口
 */
export interface Collection {
    id: string;
    title: string;
    description: string | null;
    url: string | null;
    type: CollectionType;
    content: string | null;
    thumbnailUrl: string | null;
    filePath: string | null;
    folderId: string | null;
    isFavorite: boolean;
    isArchived: boolean;
    readCount: number;
    createdAt: string;
    updatedAt: string;
    tags: Tag[];
    folder?: {
        id: string;
        name: string;
    };
}

/**
 * 搜索结果项（包含匹配片段）
 */
export interface SearchResultItem {
    id: string;
    title: string;
    description: string | null;
    type: CollectionType;
    url: string | null;
    thumbnailUrl: string | null;
    folderId: string | null;
    isFavorite: boolean;
    createdAt: string;
    tags: Tag[];
    matchSnippet: string;
}

/**
 * 分页信息
 */
export interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

/**
 * 通用 API 响应结构
 */
export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * 分页响应数据结构
 */
export interface PaginatedData<T> {
    items: T[];
    pagination: Pagination;
}

/**
 * 创建收藏项请求参数
 */
export interface CreateCollectionParams {
    title: string;
    description?: string;
    url?: string;
    type: CollectionType;
    content?: string;
    thumbnailUrl?: string;
    folderId?: string;
    tagIds?: string[];
    isFavorite?: boolean;
}

/**
 * 更新收藏项请求参数
 */
export interface UpdateCollectionParams {
    title?: string;
    description?: string;
    url?: string;
    type?: CollectionType;
    content?: string;
    thumbnailUrl?: string;
    folderId?: string | null;
    tagIds?: string[];
    isFavorite?: boolean;
}

/**
 * 获取收藏列表查询参数
 */
export interface GetCollectionsParams {
    page?: number;
    pageSize?: number;
    type?: CollectionType;
    folderId?: string;
    tagId?: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    keyword?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

/**
 * 创建文件夹请求参数
 */
export interface CreateFolderParams {
    name: string;
    parentId?: string;
}

/**
 * 更新文件夹请求参数
 */
export interface UpdateFolderParams {
    name?: string;
    parentId?: string | null;
    sortOrder?: number;
}

/**
 * 创建标签请求参数
 */
export interface CreateTagParams {
    name: string;
    color?: string;
}

/**
 * 更新标签请求参数
 */
export interface UpdateTagParams {
    name?: string;
    color?: string;
}

/**
 * 搜索查询参数
 */
export interface SearchParams {
    q: string;
    type?: CollectionType;
    folderId?: string;
    tagId?: string;
    page?: number;
    pageSize?: number;
}

/**
 * 文件上传响应数据
 */
export interface UploadResult {
    id: string;
    title: string;
    type: 'file';
    filePath: string;
    fileSize: number;
    mimeType: string;
    createdAt: string;
}

/**
 * URL 元数据提取结果
 */
export interface MetadataResult {
    title: string;
    description: string;
    coverUrl: string;
    favicon: string;
}

/**
 * 数据导入结果统计
 */
export interface ImportResult {
    foldersCreated: number;
    tagsCreated: number;
    collectionsCreated: number;
    collectionsSkipped: number;
}

/**
 * AI API 配置
 */
export interface AiConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
}