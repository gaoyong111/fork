import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/init';

const router = Router();

/**
 * 创建标签请求体接口
 */
interface CreateTagBody {
    name: string;
    color?: string;
}

/**
 * 更新标签请求体接口
 */
interface UpdateTagBody {
    name?: string;
    color?: string;
}

/**
 * 获取标签列表（按使用数量排序）
 * GET /api/tags
 */
router.get('/', (_req: Request, res: Response) => {
    try {
        const db = getDb();

        const tags = db.prepare(`
            SELECT t.*,
                (SELECT COUNT(*) FROM collection_tags ct WHERE ct.tag_id = t.id) as collection_count
            FROM tags t
            ORDER BY collection_count DESC, t.created_at DESC
        `).all() as Record<string, unknown>[];

        res.json({
            code: 0,
            message: 'success',
            data: tags,
        });
    } catch (error) {
        console.error('[标签] 查询列表失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 创建标签
 * POST /api/tags
 */
router.post('/', (req: Request<{}, {}, CreateTagBody>, res: Response) => {
    try {
        const db = getDb();
        const { name, color = '#6366f1' } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({
                code: 40001,
                message: '标签名称不能为空',
            });
            return;
        }

        // 检查标签名是否已存在
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name.trim()) as Record<string, unknown> | undefined;

        if (existing) {
            res.status(409).json({
                code: 40901,
                message: '标签名称已存在',
            });
            return;
        }

        const id = uuidv4();
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO tags (id, name, color, created_at)
            VALUES (?, ?, ?, ?)
        `).run(id, name.trim(), color, now);

        const tag = db.prepare(`
            SELECT t.*,
                (SELECT COUNT(*) FROM collection_tags ct WHERE ct.tag_id = t.id) as collection_count
            FROM tags t
            WHERE t.id = ?
        `).get(id) as Record<string, unknown>;

        res.status(201).json({
            code: 0,
            message: 'success',
            data: tag,
        });
    } catch (error) {
        console.error('[标签] 创建失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 更新标签
 * PUT /api/tags/:id
 */
router.put('/:id', (req: Request<{ id: string }, {}, UpdateTagBody>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const existing = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '标签不存在',
            });
            return;
        }

        const { name, color } = req.body;

        // 如果更新名称，检查是否与其他标签重名
        if (name !== undefined && name.trim()) {
            const duplicate = db.prepare(
                'SELECT id FROM tags WHERE name = ? AND id != ?'
            ).get(name.trim(), id) as Record<string, unknown> | undefined;

            if (duplicate) {
                res.status(409).json({
                    code: 40901,
                    message: '标签名称已存在',
                });
                return;
            }
        }

        const fields: string[] = [];
        const values: unknown[] = [];

        if (name !== undefined) {
            if (!name.trim()) {
                res.status(400).json({ code: 40001, message: '标签名称不能为空' });
                return;
            }
            fields.push('name = ?');
            values.push(name.trim());
        }
        if (color !== undefined) {
            fields.push('color = ?');
            values.push(color);
        }

        if (fields.length === 0) {
            res.status(400).json({ code: 40001, message: '没有需要更新的字段' });
            return;
        }

        values.push(id);
        db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);

        const tag = db.prepare(`
            SELECT t.*,
                (SELECT COUNT(*) FROM collection_tags ct WHERE ct.tag_id = t.id) as collection_count
            FROM tags t
            WHERE t.id = ?
        `).get(id) as Record<string, unknown>;

        res.json({
            code: 0,
            message: 'success',
            data: tag,
        });
    } catch (error) {
        console.error('[标签] 更新失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 删除标签（同时移除所有收藏项与该标签的关联）
 * DELETE /api/tags/:id
 */
router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const existing = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '标签不存在',
            });
            return;
        }

        // 删除标签（外键级联会自动删除 collection_tags 中的关联记录）
        db.prepare('DELETE FROM tags WHERE id = ?').run(id);

        res.json({
            code: 0,
            message: 'success',
            data: null,
        });
    } catch (error) {
        console.error('[标签] 删除失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

export default router;
