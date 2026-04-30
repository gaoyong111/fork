/**
 * 回收站路由
 * 提供已删除收藏项的查看、恢复和永久删除功能
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../database/init';

const router = Router();

/**
 * 回收站查询参数接口
 */
interface TrashQueryParams {
    page?: string;
    limit?: string;
}

/**
 * 获取回收站列表（已删除的收藏项）
 * GET /api/trash
 * 按删除时间（updated_at）倒序排列
 */
router.get('/', (req: Request<{}, {}, {}, TrashQueryParams>, res: Response) => {
    try {
        const db = getDb();
        const { page = '1', limit = '20' } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        // 查询总数
        const { total } = db.prepare(
            'SELECT COUNT(*) as total FROM collections WHERE is_deleted = 1'
        ).get() as { total: number };

        // 查询列表，按 updated_at 倒序（删除时间）
        const items = db.prepare(
            'SELECT * FROM collections WHERE is_deleted = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?'
        ).all(limitNum, offset) as Record<string, unknown>[];

        // 批量查询标签
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

        const result = items.map((item) => ({
            ...item,
            tags: tagsMap[item.id as string] || [],
        }));

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
        console.error('[回收站] 查询失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 恢复单个收藏项
 * POST /api/trash/:id/restore
 */
router.post('/:id/restore', (req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const now = new Date().toISOString();

        const existing = db.prepare(
            'SELECT id FROM collections WHERE id = ? AND is_deleted = 1'
        ).get(id);

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '回收站中不存在该收藏项',
            });
            return;
        }

        db.prepare(
            'UPDATE collections SET is_deleted = 0, updated_at = ? WHERE id = ?'
        ).run(now, id);

        res.json({
            code: 0,
            message: 'success',
            data: null,
        });
    } catch (error) {
        console.error('[回收站] 恢复失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 恢复全部已删除项
 * POST /api/trash/restore-all
 * 使用事务确保原子性
 */
router.post('/restore-all', (req: Request, res: Response) => {
    try {
        const db = getDb();
        const now = new Date().toISOString();

        const restoreMany = db.transaction(() => {
            const result = db.prepare(
                'UPDATE collections SET is_deleted = 0, updated_at = ? WHERE is_deleted = 1'
            ).run(now);
            return result.changes;
        });

        const restoredCount = restoreMany();

        res.json({
            code: 0,
            message: 'success',
            data: { restoredCount },
        });
    } catch (error) {
        console.error('[回收站] 恢复全部失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 清空回收站（永久删除所有已删除项）
 * DELETE /api/trash/empty
 * 使用事务确保原子性
 * 注意：此路由必须在 /:id 之前定义，避免 "empty" 被当作 :id 参数匹配
 */
router.delete('/empty', (req: Request, res: Response) => {
    try {
        const db = getDb();

        const emptyTrash = db.transaction(() => {
            // 先删除所有已删除项的标签关联
            db.prepare(`
                DELETE FROM collection_tags WHERE collection_id IN (
                    SELECT id FROM collections WHERE is_deleted = 1
                )
            `).run();
            // 再删除所有已删除项
            const result = db.prepare('DELETE FROM collections WHERE is_deleted = 1').run();
            return result.changes;
        });

        const deletedCount = emptyTrash();

        res.json({
            code: 0,
            message: 'success',
            data: { deletedCount },
        });
    } catch (error) {
        console.error('[回收站] 清空失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 永久删除单个收藏项
 * DELETE /api/trash/:id
 * 同时删除关联的 collection_tags 记录
 */
router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const existing = db.prepare(
            'SELECT id FROM collections WHERE id = ? AND is_deleted = 1'
        ).get(id);

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '回收站中不存在该收藏项',
            });
            return;
        }

        const deleteItem = db.transaction(() => {
            db.prepare('DELETE FROM collection_tags WHERE collection_id = ?').run(id);
            db.prepare('DELETE FROM collections WHERE id = ?').run(id);
        });

        deleteItem();

        res.json({
            code: 0,
            message: 'success',
            data: null,
        });
    } catch (error) {
        console.error('[回收站] 永久删除失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

export default router;
