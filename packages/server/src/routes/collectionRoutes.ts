import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/init';

const router = Router();

/**
 * 收藏项查询参数接口
 */
interface CollectionQueryParams {
    folder_id?: string;
    tag_id?: string;
    type?: string;
    keyword?: string;
    is_favorite?: string;
    page?: string;
    limit?: string;
    sort_by?: string;
    sort_order?: string;
}

/**
 * 创建收藏项请求体接口
 * 同时兼容 camelCase 和 snake_case 字段命名
 */
interface CreateCollectionBody {
    title: string;
    url?: string;
    type?: string;
    content?: string;
    summary?: string;
    description?: string;
    cover_url?: string;
    coverUrl?: string;
    folder_id?: string;
    folderId?: string;
    tag_ids?: string[];
    tagIds?: string[];
    is_favorite?: boolean;
    isFavorite?: boolean;
}

/**
 * 更新收藏项请求体接口
 * 同时兼容 camelCase 和 snake_case 字段命名
 */
interface UpdateCollectionBody {
    title?: string;
    url?: string;
    type?: string;
    content?: string;
    summary?: string;
    description?: string;
    cover_url?: string;
    coverUrl?: string;
    folder_id?: string | null;
    folderId?: string | null;
    tag_ids?: string[];
    tagIds?: string[];
    is_favorite?: boolean;
    isFavorite?: boolean;
}

/**
 * 获取收藏列表
 * GET /api/collections
 */
router.get('/', (req: Request<{}, {}, {}, CollectionQueryParams>, res: Response) => {
    try {
        const db = getDb();
        const {
            folder_id,
            tag_id,
            type,
            keyword,
            is_favorite,
            page = '1',
            limit = '20',
            sort_by,
            sort_order,
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        // 构建 WHERE 条件
        const conditions: string[] = ['c.is_deleted = 0'];
        const params: unknown[] = [];

        if (folder_id) {
            conditions.push('c.folder_id = ?');
            params.push(folder_id);
        }

        if (type) {
            conditions.push('c.type = ?');
            params.push(type);
        }

        if (is_favorite === '1' || is_favorite === 'true') {
            conditions.push('c.is_favorite = 1');
        }

        if (keyword) {
            conditions.push('(c.title LIKE ? OR c.summary LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        // 按标签筛选需要 JOIN
        let joinClause = '';
        if (tag_id) {
            joinClause = `
                INNER JOIN collection_tags ct ON c.id = ct.collection_id
                INNER JOIN tags t ON ct.tag_id = t.id
            `;
            conditions.push('t.id = ?');
            params.push(tag_id);
        }

        const whereClause = conditions.join(' AND ');

        // 排序参数处理：白名单校验，防止 SQL 注入
        const sortMap: Record<string, string> = {
            created_at: 'c.created_at',
            updated_at: 'c.updated_at',
            title: 'c.title',
        };
        const sortBy = sortMap[sort_by || ''] || 'c.created_at';
        const sortOrder = sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // 查询总数
        const countSql = `SELECT COUNT(DISTINCT c.id) as total FROM collections c ${joinClause} WHERE ${whereClause}`;
        const { total } = db.prepare(countSql).get(...params) as { total: number };

        // 查询列表
        const listSql = `
            SELECT c.* FROM collections c ${joinClause}
            WHERE ${whereClause}
            GROUP BY c.id
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT ? OFFSET ?
        `;
        const items = db.prepare(listSql).all(...params, limitNum, offset) as Record<string, unknown>[];

        // 批量查询所有收藏项的标签（避免 N+1 查询）
        let tagsMap: Record<string, Record<string, unknown>[]> = {};
        if (items.length > 0) {
            const itemIds = items.map((item) => item.id);
            const placeholders = itemIds.map(() => '?').join(', ');
            const allTags = db.prepare(`
                SELECT ct.collection_id, t.id, t.name, t.color
                FROM collection_tags ct
                JOIN tags t ON ct.tag_id = t.id
                WHERE ct.collection_id IN (${placeholders})
            `).all(...itemIds) as (Record<string, unknown> & { collection_id: string })[];

            tagsMap = {};
            for (const tag of allTags) {
                const cid = tag.collection_id;
                if (!tagsMap[cid]) {
                    tagsMap[cid] = [];
                }
                tagsMap[cid].push({
                    id: tag.id,
                    name: tag.name,
                    color: tag.color,
                });
            }
        }

        const result = items.map((item) => {
            return { ...item, tags: tagsMap[item.id as string] || [] };
        });

        res.json({
            code: 0,
            message: 'success',
            data: {
                items: result,
                pagination: {
                    page: pageNum,
                    pageSize: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    } catch (error) {
        console.error('[收藏列表] 查询失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 创建收藏项
 * POST /api/collections
 */
router.post('/', (req: Request<{}, {}, CreateCollectionBody>, res: Response) => {
    try {
        const db = getDb();
        const {
            title,
            url,
            type = 'link',
            content,
            summary,
            description,
            cover_url,
            coverUrl,
            folder_id,
            folderId,
            tag_ids,
            tagIds,
            is_favorite,
            isFavorite = false,
        } = req.body;

        // 兼容 camelCase 和 snake_case 字段
        const resolvedSummary = summary || description;
        const resolvedCoverUrl = cover_url || coverUrl;
        const resolvedFolderId = folder_id || folderId;
        const resolvedTagIds = tag_ids || tagIds || [];
        const resolvedIsFavorite = is_favorite !== undefined ? is_favorite : isFavorite;

        if (!title || !title.trim()) {
            res.status(400).json({
                code: 40001,
                message: '标题不能为空',
            });
            return;
        }

        // type 字段白名单校验
        const ALLOWED_TYPES = ['link', 'file', 'note'];
        if (!ALLOWED_TYPES.includes(type)) {
            res.status(400).json({
                code: 40001,
                message: `类型不合法，只允许: ${ALLOWED_TYPES.join('/')}`,
            });
            return;
        }

        const id = uuidv4();
        const now = new Date().toISOString();

        // 插入收藏项
        db.prepare(`
            INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, title.trim(), url || null, type, content || null, resolvedSummary || null, resolvedCoverUrl || null, resolvedFolderId || null, resolvedIsFavorite ? 1 : 0, now, now);

        // 关联标签
        const insertTag = db.prepare(
            'INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)'
        );
        for (const tagId of resolvedTagIds) {
            insertTag.run(id, tagId);
        }

        // 查询创建结果（含标签）
        const item = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as Record<string, unknown>;
        const tags = db.prepare(`
            SELECT t.id, t.name, t.color
            FROM tags t
            INNER JOIN collection_tags ct ON t.id = ct.tag_id
            WHERE ct.collection_id = ?
        `).all(id) as Record<string, unknown>[];

        res.status(201).json({
            code: 0,
            message: 'success',
            data: { ...item, tags },
        });
    } catch (error) {
        console.error('[收藏项] 创建失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 批量删除请求体接口
 */
interface BatchDeleteBody {
    ids: string[];
}

/**
 * 移动收藏项请求体接口
 * 同时兼容 camelCase 和 snake_case 字段命名
 */
interface MoveCollectionBody {
    folder_id?: string | null;
    folderId?: string | null;
}

/**
 * 批量删除收藏项（软删除）
 * POST /api/collections/batch-delete
 */
router.post('/batch-delete', (req: Request<{}, {}, BatchDeleteBody>, res: Response) => {
    try {
        const db = getDb();
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({
                code: 40001,
                message: '请提供要删除的 ID 列表',
            });
            return;
        }

        const now = new Date().toISOString();
        const stmt = db.prepare(
            'UPDATE collections SET is_deleted = 1, updated_at = ? WHERE id = ? AND is_deleted = 0'
        );

        let deletedCount = 0;
        for (const id of ids) {
            const result = stmt.run(now, id);
            if (result.changes > 0) {
                deletedCount++;
            }
        }

        res.json({
            code: 0,
            message: 'success',
            data: { deletedCount },
        });
    } catch (error) {
        console.error('[收藏项] 批量删除失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 批量移动请求体接口
 * 同时兼容 camelCase 和 snake_case 字段命名
 */
interface BatchMoveBody {
    ids: string[];
    folder_id?: string | null;
    folderId?: string | null;
}

/**
 * 批量打标签请求体接口
 * 同时兼容 camelCase 和 snake_case 字段命名
 */
interface BatchTagsBody {
    ids: string[];
    tag_ids?: string[];
    tagIds?: string[];
    action: 'add' | 'replace';
}

/**
 * 批量移动收藏项到指定文件夹
 * POST /api/collections/batch-move
 */
router.post('/batch-move', (req: Request<{}, {}, BatchMoveBody>, res: Response) => {
    try {
        const db = getDb();
        const { ids, folder_id, folderId } = req.body;
        const resolvedFolderId = folder_id !== undefined ? folder_id : folderId;
        const now = new Date().toISOString();

        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({
                code: 40001,
                message: '请提供要移动的 ID 列表',
            });
            return;
        }

        // 如果指定了目标文件夹，检查文件夹是否存在
        if (resolvedFolderId) {
            const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(resolvedFolderId);
            if (!folder) {
                res.status(400).json({
                    code: 40001,
                    message: '目标文件夹不存在',
                });
                return;
            }
        }

        const stmt = db.prepare(
            'UPDATE collections SET folder_id = ?, updated_at = ? WHERE id = ? AND is_deleted = 0'
        );

        let movedCount = 0;
        for (const id of ids) {
            const result = stmt.run(resolvedFolderId || null, now, id);
            if (result.changes > 0) {
                movedCount++;
            }
        }

        res.json({
            code: 0,
            message: 'success',
            data: { movedCount },
        });
    } catch (error) {
        console.error('[收藏项] 批量移动失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 批量打标签
 * POST /api/collections/batch-tags
 * action: "add" = 追加标签（保留已有标签），"replace" = 替换标签（清除已有标签）
 */
router.post('/batch-tags', (req: Request<{}, {}, BatchTagsBody>, res: Response) => {
    try {
        const db = getDb();
        const { ids, tag_ids, tagIds, action } = req.body;
        const resolvedTagIds = tag_ids || tagIds || [];

        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({
                code: 40001,
                message: '请提供要操作的 ID 列表',
            });
            return;
        }

        if (!Array.isArray(resolvedTagIds) || resolvedTagIds.length === 0) {
            res.status(400).json({
                code: 40001,
                message: '请提供标签 ID 列表',
            });
            return;
        }

        if (action !== 'add' && action !== 'replace') {
            res.status(400).json({
                code: 40001,
                message: 'action 参数只允许 "add" 或 "replace"',
            });
            return;
        }

        const now = new Date().toISOString();
        let updatedCount = 0;

        for (const id of ids) {
            // 检查收藏项是否存在
            const existing = db.prepare(
                'SELECT id FROM collections WHERE id = ? AND is_deleted = 0'
            ).get(id);
            if (!existing) continue;

            if (action === 'replace') {
                // 清除已有标签
                db.prepare('DELETE FROM collection_tags WHERE collection_id = ?').run(id);
            }

            // 插入新标签关联
            const insertTag = db.prepare(
                'INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)'
            );
            for (const tagId of resolvedTagIds) {
                insertTag.run(id, tagId);
            }

            // 更新时间戳
            db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now, id);
            updatedCount++;
        }

        res.json({
            code: 0,
            message: 'success',
            data: { updatedCount },
        });
    } catch (error) {
        console.error('[收藏项] 批量打标签失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 获取收藏项详情
 * GET /api/collections/:id
 */
router.get('/:id', (req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const item = db.prepare(
            'SELECT * FROM collections WHERE id = ? AND is_deleted = 0'
        ).get(id) as Record<string, unknown> | undefined;

        if (!item) {
            res.status(404).json({
                code: 40401,
                message: '收藏项不存在',
            });
            return;
        }

        // 查询标签
        const tags = db.prepare(`
            SELECT t.id, t.name, t.color
            FROM tags t
            INNER JOIN collection_tags ct ON t.id = ct.tag_id
            WHERE ct.collection_id = ?
        `).all(id) as Record<string, unknown>[];

        // 查询所属文件夹
        let folder = null;
        if (item.folder_id) {
            folder = db.prepare('SELECT id, name FROM folders WHERE id = ?').get(item.folder_id) as Record<string, unknown> | undefined;
        }

        res.json({
            code: 0,
            message: 'success',
            data: { ...item, tags, folder },
        });
    } catch (error) {
        console.error('[收藏项] 查询详情失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 更新收藏项
 * PUT /api/collections/:id
 */
router.put('/:id', (req: Request<{ id: string }, {}, UpdateCollectionBody>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const now = new Date().toISOString();

        // 检查收藏项是否存在
        const existing = db.prepare(
            'SELECT * FROM collections WHERE id = ? AND is_deleted = 0'
        ).get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '收藏项不存在',
            });
            return;
        }

        const {
            title,
            url,
            type,
            content,
            summary,
            description,
            cover_url,
            coverUrl,
            folder_id,
            folderId,
            tag_ids,
            tagIds,
            is_favorite,
            isFavorite,
        } = req.body;

        // 兼容 camelCase 和 snake_case 字段
        const resolvedSummary = summary !== undefined ? summary : description;
        const resolvedCoverUrl = cover_url !== undefined ? cover_url : coverUrl;
        const resolvedFolderId = folder_id !== undefined ? folder_id : folderId;
        const resolvedTagIds = tag_ids !== undefined ? tag_ids : tagIds;
        const resolvedIsFavorite = is_favorite !== undefined ? is_favorite : isFavorite;

        // 构建更新字段
        const fields: string[] = ['updated_at = ?'];
        const values: unknown[] = [now];

        if (title !== undefined) {
            if (!title.trim()) {
                res.status(400).json({ code: 40001, message: '标题不能为空' });
                return;
            }
            fields.push('title = ?');
            values.push(title.trim());
        }
        if (url !== undefined) {
            fields.push('url = ?');
            values.push(url || null);
        }
        if (type !== undefined) {
            // type 字段白名单校验
            const ALLOWED_TYPES = ['link', 'file', 'note'];
            if (!ALLOWED_TYPES.includes(type)) {
                res.status(400).json({
                    code: 40001,
                    message: `类型不合法，只允许: ${ALLOWED_TYPES.join('/')}`,
                });
                return;
            }
            fields.push('type = ?');
            values.push(type);
        }
        if (content !== undefined) {
            fields.push('content = ?');
            values.push(content || null);
        }
        if (resolvedSummary !== undefined) {
            fields.push('summary = ?');
            values.push(resolvedSummary || null);
        }
        if (resolvedCoverUrl !== undefined) {
            fields.push('cover_url = ?');
            values.push(resolvedCoverUrl || null);
        }
        if (resolvedFolderId !== undefined) {
            fields.push('folder_id = ?');
            values.push(resolvedFolderId || null);
        }
        if (resolvedIsFavorite !== undefined) {
            fields.push('is_favorite = ?');
            values.push(resolvedIsFavorite ? 1 : 0);
        }

        values.push(id);
        db.prepare(`UPDATE collections SET ${fields.join(', ')} WHERE id = ?`).run(...values);

        // 更新标签关联
        if (resolvedTagIds !== undefined) {
            db.prepare('DELETE FROM collection_tags WHERE collection_id = ?').run(id);
            const insertTag = db.prepare(
                'INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)'
            );
            for (const tagId of resolvedTagIds) {
                insertTag.run(id, tagId);
            }
        }

        // 查询更新后的结果
        const item = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as Record<string, unknown>;
        const tags = db.prepare(`
            SELECT t.id, t.name, t.color
            FROM tags t
            INNER JOIN collection_tags ct ON t.id = ct.tag_id
            WHERE ct.collection_id = ?
        `).all(id) as Record<string, unknown>[];

        res.json({
            code: 0,
            message: 'success',
            data: { ...item, tags },
        });
    } catch (error) {
        console.error('[收藏项] 更新失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 删除收藏项（软删除）
 * DELETE /api/collections/:id
 */
router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const now = new Date().toISOString();

        const existing = db.prepare(
            'SELECT * FROM collections WHERE id = ? AND is_deleted = 0'
        ).get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '收藏项不存在',
            });
            return;
        }

        db.prepare(
            'UPDATE collections SET is_deleted = 1, updated_at = ? WHERE id = ?'
        ).run(now, id);

        res.json({
            code: 0,
            message: 'success',
            data: null,
        });
    } catch (error) {
        console.error('[收藏项] 删除失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 切换收藏项星标状态
 * POST /api/collections/:id/favorite
 */
router.post('/:id/favorite', (req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const now = new Date().toISOString();

        // 查询当前状态
        const existing = db.prepare(
            'SELECT * FROM collections WHERE id = ? AND is_deleted = 0'
        ).get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '收藏项不存在',
            });
            return;
        }

        // 取反当前星标状态
        const newFavorite = existing.is_favorite ? 0 : 1;

        db.prepare(
            'UPDATE collections SET is_favorite = ?, updated_at = ? WHERE id = ?'
        ).run(newFavorite, now, id);

        // 查询更新后的结果（含标签）
        const item = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as Record<string, unknown>;
        const tags = db.prepare(`
            SELECT t.id, t.name, t.color
            FROM tags t
            INNER JOIN collection_tags ct ON t.id = ct.tag_id
            WHERE ct.collection_id = ?
        `).all(id) as Record<string, unknown>[];

        res.json({
            code: 0,
            message: 'success',
            data: { ...item, tags },
        });
    } catch (error) {
        console.error('[收藏项] 切换星标失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 移动收藏项到指定文件夹
 * POST /api/collections/:id/move
 */
router.post('/:id/move', (req: Request<{ id: string }, {}, MoveCollectionBody>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { folder_id, folderId } = req.body;
        const resolvedFolderId = folder_id !== undefined ? folder_id : folderId;
        const now = new Date().toISOString();

        // 检查收藏项是否存在
        const existing = db.prepare(
            'SELECT * FROM collections WHERE id = ? AND is_deleted = 0'
        ).get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '收藏项不存在',
            });
            return;
        }

        // 如果指定了目标文件夹，检查文件夹是否存在
        if (resolvedFolderId) {
            const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(resolvedFolderId);
            if (!folder) {
                res.status(400).json({
                    code: 40001,
                    message: '目标文件夹不存在',
                });
                return;
            }
        }

        db.prepare(
            'UPDATE collections SET folder_id = ?, updated_at = ? WHERE id = ?'
        ).run(resolvedFolderId || null, now, id);

        // 查询更新后的结果（含标签）
        const item = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as Record<string, unknown>;
        const tags = db.prepare(`
            SELECT t.id, t.name, t.color
            FROM tags t
            INNER JOIN collection_tags ct ON t.id = ct.tag_id
            WHERE ct.collection_id = ?
        `).all(id) as Record<string, unknown>[];

        res.json({
            code: 0,
            message: 'success',
            data: { ...item, tags },
        });
    } catch (error) {
        console.error('[收藏项] 移动失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

export default router;
