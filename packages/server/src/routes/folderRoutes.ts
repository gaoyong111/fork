import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/init';

const router = Router();

/**
 * 文件夹树节点接口
 */
interface FolderTreeNode {
    id: string;
    name: string;
    parent_id: string | null;
    sort_order: number;
    collection_count: number;
    created_at: string;
    updated_at: string;
    children: FolderTreeNode[];
}

/**
 * 创建文件夹请求体接口
 * 同时兼容 camelCase 和 snake_case 字段命名
 */
interface CreateFolderBody {
    name: string;
    parent_id?: string;
    parentId?: string;
    sort_order?: number;
    sortOrder?: number;
}

/**
 * 更新文件夹请求体接口
 * 同时兼容 camelCase 和 snake_case 字段命名
 */
interface UpdateFolderBody {
    name?: string;
    parent_id?: string | null;
    parentId?: string | null;
    sort_order?: number;
    sortOrder?: number;
}

/**
 * 获取文件夹树形结构
 * GET /api/folders
 */
router.get('/', (_req: Request, res: Response) => {
    try {
        const db = getDb();

        // 查询所有文件夹
        const folders = db.prepare(`
            SELECT f.*,
                (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id AND c.is_deleted = 0) as collection_count
            FROM folders f
            ORDER BY f.sort_order ASC, f.created_at ASC
        `).all() as Record<string, unknown>[];

        // 构建树形结构
        const tree = buildFolderTree(folders as unknown as FolderTreeNode[]);

        res.json({
            code: 0,
            message: 'success',
            data: tree,
        });
    } catch (error) {
        console.error('[文件夹] 查询树形结构失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 将扁平文件夹列表构建为树形结构
 * @param folders - 扁平文件夹列表
 * @param parentId - 父文件夹 ID，默认 null 表示根节点
 * @returns 树形结构的文件夹列表
 */
function buildFolderTree(folders: FolderTreeNode[], parentId: string | null = null): FolderTreeNode[] {
    return folders
        .filter((f) => f.parent_id === parentId)
        .map((f) => ({
            ...f,
            children: buildFolderTree(folders, f.id),
        }));
}

/**
 * 创建文件夹
 * POST /api/folders
 */
router.post('/', (req: Request<{}, {}, CreateFolderBody>, res: Response) => {
    try {
        const db = getDb();
        const { name, parent_id, parentId, sort_order, sortOrder = 0 } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({
                code: 40001,
                message: '文件夹名称不能为空',
            });
            return;
        }

        const resolvedParentId = parent_id || parentId;
        const resolvedSortOrder = sort_order ?? sortOrder ?? 0;

        const id = uuidv4();
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, name.trim(), resolvedParentId || null, resolvedSortOrder, now, now);

        const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Record<string, unknown>;

        res.status(201).json({
            code: 0,
            message: 'success',
            data: folder,
        });
    } catch (error) {
        console.error('[文件夹] 创建失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 更新文件夹
 * PUT /api/folders/:id
 */
router.put('/:id', (req: Request<{ id: string }, {}, UpdateFolderBody>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const now = new Date().toISOString();

        const existing = db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '文件夹不存在',
            });
            return;
        }

        const { name, parent_id, parentId, sort_order, sortOrder } = req.body;

        const fields: string[] = ['updated_at = ?'];
        const values: unknown[] = [now];

        if (name !== undefined) {
            if (!name.trim()) {
                res.status(400).json({ code: 40001, message: '文件夹名称不能为空' });
                return;
            }
            fields.push('name = ?');
            values.push(name.trim());
        }
        const resolvedParentId = parent_id !== undefined ? parent_id : parentId;
        if (resolvedParentId !== undefined) {
            // 防止将文件夹设为自己的子文件夹
            if (resolvedParentId === id) {
                res.status(400).json({ code: 40001, message: '不能将文件夹设为自己的子文件夹' });
                return;
            }
            fields.push('parent_id = ?');
            values.push(resolvedParentId || null);
        }
        const resolvedSortOrder = sort_order !== undefined ? sort_order : sortOrder;
        if (resolvedSortOrder !== undefined) {
            fields.push('sort_order = ?');
            values.push(resolvedSortOrder);
        }

        values.push(id);
        db.prepare(`UPDATE folders SET ${fields.join(', ')} WHERE id = ?`).run(...values);

        const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Record<string, unknown>;

        res.json({
            code: 0,
            message: 'success',
            data: folder,
        });
    } catch (error) {
        console.error('[文件夹] 更新失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 删除文件夹
 * DELETE /api/folders/:id
 * 级联删除子文件夹，子文件夹内的收藏项移至未分类
 */
router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const existing = db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Record<string, unknown> | undefined;

        if (!existing) {
            res.status(404).json({
                code: 40401,
                message: '文件夹不存在',
            });
            return;
        }

        // 收集所有子文件夹 ID（包括自身）
        const allFolderIds = getAllDescendantFolderIds(db, id);
        allFolderIds.push(id);

        // 将这些文件夹下的收藏项移至未分类
        const placeholders = allFolderIds.map(() => '?').join(', ');
        db.prepare(
            `UPDATE collections SET folder_id = NULL WHERE folder_id IN (${placeholders})`
        ).run(...allFolderIds);

        // 删除所有子文件夹（外键级联会自动处理）
        db.prepare(
            `DELETE FROM folders WHERE id IN (${placeholders})`
        ).run(...allFolderIds);

        res.json({
            code: 0,
            message: 'success',
            data: null,
        });
    } catch (error) {
        console.error('[文件夹] 删除失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

/**
 * 递归获取所有后代文件夹 ID
 * @param database - 数据库实例
 * @param parentId - 父文件夹 ID
 * @returns 后代文件夹 ID 列表
 */
function getAllDescendantFolderIds(database: ReturnType<typeof getDb>, parentId: string): string[] {
    const children = database.prepare(
        'SELECT id FROM folders WHERE parent_id = ?'
    ).all(parentId) as { id: string }[];

    const ids: string[] = [];
    for (const child of children) {
        ids.push(child.id);
        ids.push(...getAllDescendantFolderIds(database, child.id));
    }
    return ids;
}

export default router;
