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

/** 精读摘要模式：简略 / 详细 */
export type SummaryMode = 'brief' | 'detailed';

/** 分离后的图片信息 */
export interface ArticleImage {
    id: number;
    src: string;
    alt: string;
    /** 本地存储路径（抓取时下载），渲染优先使用 */
    localPath?: string;
}

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
    contentBrief: string | null;
    contentDetailed: string | null;
    summaryMode: SummaryMode | null;
    rawContent: string | null;
    images: string | null;
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
    contentBrief?: string | null;
    contentDetailed?: string | null;
    summaryMode?: SummaryMode;
    rawContent?: string;
    images?: string;
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

import type { DeepReadTemplateType } from '../ai/deepReadTemplates';

/**
 * AI 精读选项
 */
export interface DeepReadOptions {
    signal?: AbortSignal;
    /** 已有原文时跳过重抓，仅重新生成摘要 */
    rawContent?: string;
    /** 已有图文分离数据（JSON），配合 rawContent 使用 */
    images?: string;
    /** 强制重新抓取（忽略 rawContent） */
    refetch?: boolean;
    /** 文章类型模板，不传则自动检测 */
    templateType?: DeepReadTemplateType;
    /** 再次精读时的用户诉求/问题 */
    userDirection?: string;
    /** 再次精读时的先前摘要 */
    previousSummary?: string;
    /** 摘要模式：简略 / 详细 */
    summaryMode?: SummaryMode;
    /** 从已有摘要压缩而非从原文精读（切换简略时使用） */
    sourceMode?: 'compress';
}

/**
 * 应用偏好设置（精读相关）
 */
export interface AppPreferences {
    /** 收藏链接后是否自动排队精读 */
    autoDeepRead: boolean;
    /** 自动精读与手动精读默认使用的摘要模式 */
    defaultSummaryMode: SummaryMode;
}

/** AI 精读结果 */
export interface DeepReadResult {
    rawContent: string;
    summary: string;
    templateType?: DeepReadTemplateType;
    /** 图片元数据 JSON 字符串（与 Collection.images 存储格式一致） */
    images?: string;
    /** 页面抓取时解析到的标题，用于回填占位标题 */
    pageTitle?: string;
}

/**
 * AI API 配置
 */
export interface AiConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
}

/**
 * 移动收藏项请求参数
 */
export interface MoveCollectionParams {
    folderId: string | null;
}

/**
 * 移动收藏项响应
 */
export interface MoveCollectionResult {
    id: string;
    folderId: string | null;
}

/**
 * 本地存储信息（桌面端）
 */
export interface StorageInfo {
    dataDir: string;
    dbSize: number;
    uploadsSize: number;
}

/**
 * 数据库备份记录（桌面端）
 */
export interface BackupRecord {
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
}