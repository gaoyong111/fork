import { Router, Request, Response } from 'express';
import { getDb } from '../database/init';

const router = Router();

/**
 * 搜索查询参数接口
 */
interface SearchQueryParams {
    q?: string;
    type?: string;
    folder_id?: string;
    tag_id?: string;
    page?: string;
    limit?: string;
}

/**
 * 全文搜索
 * GET /api/search?q=keyword
 */
router.get('/', (req: Request<{}, {}, {}, SearchQueryParams>, res: Response) => {
    try {
        const db = getDb();
        const { q, type, folder_id, tag_id, page = '1', limit = '20' } = req.query;

        if (!q || !q.trim()) {
            res.status(400).json({
                code: 40001,
                message: '搜索关键词不能为空',
            });
            return;
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        // 使用 FTS5 进行全文搜索
        // 对搜索关键词进行转义，防止 FTS5 语法注入
        const escapedQuery = escapeFtsQuery(q.trim());

        // 先从 FTS 获取匹配的 rowid
        const ftsSql = `
            SELECT rowid, rank, snippet(collections_fts, -1, '<mark>', '</mark>', '...', 32) as match_snippet
            FROM collections_fts
            WHERE collections_fts MATCH ?
            ORDER BY rank
            LIMIT ? OFFSET ?
        `;
        const ftsResults = db.prepare(ftsSql).all(escapedQuery, limitNum, offset) as {
            rowid: number;
            rank: number;
            match_snippet: string;
        }[];

        // 获取匹配的 rowid 列表
        const rowids = ftsResults.map((r) => r.rowid);
        const rowidToSnippet = new Map(ftsResults.map((r) => [r.rowid, r.match_snippet]));

        if (rowids.length === 0) {
            res.json({
                code: 0,
                message: 'success',
                data: {
                    items: [],
                    pagination: {
                        page: pageNum,
                        pageSize: limitNum,
                        total: 0,
                        totalPages: 0,
                    },
                },
            });
            return;
        }

        // 根据 rowid 查询完整的收藏项数据
        const placeholders = rowids.map(() => '?').join(', ');

        // 构建额外的筛选条件
        const conditions: string[] = [`c.rowid IN (${placeholders})`, 'c.is_deleted = 0'];
        const params: unknown[] = [...rowids];

        if (type) {
            conditions.push('c.type = ?');
            params.push(type);
        }
        if (folder_id) {
            conditions.push('c.folder_id = ?');
            params.push(folder_id);
        }

        let joinClause = '';
        if (tag_id) {
            joinClause = `
                INNER JOIN collection_tags ct ON c.id = ct.collection_id
            `;
            conditions.push('ct.tag_id = ?');
            params.push(tag_id);
        }

        const whereClause = conditions.join(' AND ');

        const items = db.prepare(`
            SELECT c.* FROM collections c ${joinClause}
            WHERE ${whereClause}
            ORDER BY c.created_at DESC
        `).all(...params) as Record<string, unknown>[];

        // 查询总数（排除已删除记录）
        // FTS5 虚拟表不支持 JOIN，使用子查询方式
        const countResult = db.prepare(`
            SELECT COUNT(*) as total FROM collections
            WHERE rowid IN (SELECT rowid FROM collections_fts WHERE collections_fts MATCH ?)
            AND is_deleted = 0
        `).get(escapedQuery) as { total: number };

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

        // 为每个收藏项附加标签和匹配片段
        const result = items.map((item) => {
            const tags = tagsMap[item.id as string] || [];
            const snippet = rowidToSnippet.get(item.rowid as number) || '';

            return {
                id: item.id,
                title: item.title,
                summary: item.summary,
                type: item.type,
                url: item.url,
                cover_url: item.cover_url,
                folderId: item.folder_id,
                isFavorite: item.is_favorite,
                created_at: item.created_at,
                updated_at: item.updated_at,
                tags,
                matchSnippet: snippet,
            };
        });

        res.json({
            code: 0,
            message: 'success',
            data: {
                items: result,
                pagination: {
                    page: pageNum,
                    pageSize: limitNum,
                    total: countResult.total,
                    totalPages: Math.ceil(countResult.total / limitNum),
                },
            },
        });
    } catch (error) {
        console.error('[搜索] 查询失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 转义 FTS5 查询关键词，防止语法注入
 * @param query - 原始搜索关键词
 * @returns 转义后的安全查询字符串
 */
function escapeFtsQuery(query: string): string {
    // 移除 FTS5 特殊字符，并用 AND 连接各词
    const specialChars = /["*(){}:+~^\/\\]/g;
    const escaped = query.replace(specialChars, ' ');
    // 将多个空格合并为一个，然后按空格分割并用 AND 连接
    const terms = escaped.split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) {
        return '';
    }
    // 对每个词用双引号包裹，防止被解析为操作符
    return terms.map((t) => `"${t}"`).join(' ');
}

export default router;
