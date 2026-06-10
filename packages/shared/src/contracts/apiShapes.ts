/**
 * API 响应结构契约校验
 * 用于 contract tests，确保 HTTP 返回与 shared 类型一致
 */

const COLLECTION_KEYS = [
    'id', 'title', 'description', 'url', 'type', 'content', 'rawContent',
    'thumbnailUrl', 'filePath', 'folderId', 'isFavorite', 'isArchived',
    'readCount', 'createdAt', 'updatedAt', 'tags',
] as const;

const TAG_KEYS = ['id', 'name', 'color', 'createdAt'] as const;

const PAGINATION_KEYS = ['page', 'pageSize', 'total', 'totalPages'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(obj: Record<string, unknown>, keys: readonly string[]): string[] {
    return keys.filter((k) => !(k in obj));
}

/**
 * 校验 Collection 对象是否包含所有必需字段
 * @returns 缺失字段列表，空数组表示通过
 */
export function validateCollectionShape(obj: unknown): string[] {
    if (!isObject(obj)) return ['<root>: not an object'];
    const missing = hasKeys(obj, COLLECTION_KEYS);
    if (!Array.isArray(obj.tags)) return [...missing, 'tags: not an array'];
    return missing;
}

/**
 * 校验 Tag 对象
 */
export function validateTagShape(obj: unknown): string[] {
    if (!isObject(obj)) return ['<root>: not an object'];
    return hasKeys(obj, TAG_KEYS);
}

/**
 * 校验分页数据结构
 */
export function validatePaginatedCollections(body: unknown): string[] {
    if (!isObject(body)) return ['<root>: not an object'];
    const errors: string[] = [];
    if (body.code !== 0) errors.push(`code: expected 0, got ${body.code}`);
    if (!isObject(body.data)) {
        errors.push('data: not an object');
        return errors;
    }
    if (!Array.isArray(body.data.items)) errors.push('data.items: not an array');
    if (!isObject(body.data.pagination)) {
        errors.push('data.pagination: not an object');
    } else {
        errors.push(...hasKeys(body.data.pagination, PAGINATION_KEYS).map((k) => `pagination.${k}`));
    }
    if (Array.isArray(body.data.items)) {
        for (let i = 0; i < body.data.items.length; i++) {
            const itemErrors = validateCollectionShape(body.data.items[i]);
            errors.push(...itemErrors.map((e) => `items[${i}].${e}`));
        }
    }
    return errors;
}

/**
 * 校验 HTTP 详情接口返回（server 原生 snake_case + 部分 camelCase 混用）
 */
export function validateServerCollectionDetail(obj: unknown): string[] {
    if (!isObject(obj)) return ['<root>: not an object'];
    const required = ['id', 'title', 'type', 'tags', 'created_at', 'updated_at'];
    return required.filter((k) => !(k in obj)).map((k) => `${k}: missing`);
}

/**
 * 校验 moveCollection 响应
 */
export function validateMoveCollectionResult(obj: unknown): string[] {
    if (!isObject(obj)) return ['<root>: not an object'];
    const errors: string[] = [];
    if (typeof obj.id !== 'string') errors.push('id: not string');
    const folderId = obj.folderId ?? obj.folder_id;
    if (folderId !== null && typeof folderId !== 'string') {
        errors.push('folderId: invalid type');
    }
    return errors;
}
