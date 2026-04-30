import { Router, Request, Response } from 'express';
import { getDb } from '../database/init';

const router: Router = Router();

/**
 * 导出全部数据为 JSON 格式
 * GET /api/export/json
 * 包含：版本号、导出时间、文件夹、标签、收藏项
 */
router.get('/json', (_req: Request, res: Response) => {
    try {
        const db = getDb();

        // 查询所有文件夹
        const folders = db.prepare('SELECT * FROM folders ORDER BY sort_order ASC, created_at ASC')
            .all() as Record<string, unknown>[];

        // 查询所有标签
        const tags = db.prepare('SELECT * FROM tags ORDER BY created_at ASC')
            .all() as Record<string, unknown>[];

        // 查询所有未删除的收藏项
        const collections = db.prepare(
            'SELECT * FROM collections WHERE is_deleted = 0 ORDER BY created_at ASC'
        ).all() as Record<string, unknown>[];

        // 查询收藏项的标签关联
        const collectionTags = db.prepare(`
            SELECT ct.collection_id, t.id as tag_id, t.name, t.color
            FROM collection_tags ct
            JOIN tags t ON ct.tag_id = t.id
        `).all() as { collection_id: string; tag_id: string; name: string; color: string }[];

        // 构建收藏项标签映射
        const tagMap: Record<string, { id: string; name: string; color: string }[]> = {};
        for (const ct of collectionTags) {
            if (!tagMap[ct.collection_id]) {
                tagMap[ct.collection_id] = [];
            }
            tagMap[ct.collection_id].push({
                id: ct.tag_id,
                name: ct.name,
                color: ct.color,
            });
        }

        // 组装收藏项数据（包含标签）
        const collectionsWithTags = collections.map((c) => ({
            ...c,
            tags: tagMap[c.id as string] || [],
        }));

        const exportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            folders,
            tags,
            collections: collectionsWithTags,
        };

        const filename = `favorites-backup-${new Date().toISOString().slice(0, 10)}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.json(exportData);
    } catch (error) {
        console.error('[导出] JSON 导出失败:', error);
        res.status(500).json({
            code: 50001,
            message: '导出失败',
        });
    }
});

/**
 * 导出为浏览器通用书签 HTML 格式
 * GET /api/export/html
 * 格式遵循 Netscape Bookmark File 格式，可被 Chrome/Edge/Safari 直接导入
 */
router.get('/html', (_req: Request, res: Response) => {
    try {
        const db = getDb();

        // 查询所有文件夹
        const folders = db.prepare('SELECT * FROM folders ORDER BY sort_order ASC, created_at ASC')
            .all() as { id: string; name: string; parent_id: string | null }[];

        // 查询所有未删除的 link 类型收藏项
        const collections = db.prepare(
            'SELECT * FROM collections WHERE is_deleted = 0 AND type = ? ORDER BY created_at ASC'
        ).all('link') as { id: string; title: string; url: string; folder_id: string | null; created_at: string }[];

        // 按文件夹分组收藏项
        const collectionsByFolder: Record<string, typeof collections> = {};
        const uncategorized: typeof collections = [];

        for (const c of collections) {
            if (c.folder_id) {
                if (!collectionsByFolder[c.folder_id]) {
                    collectionsByFolder[c.folder_id] = [];
                }
                collectionsByFolder[c.folder_id].push(c);
            } else {
                uncategorized.push(c);
            }
        }

        // 构建文件夹树
        const folderMap = new Map<string, { id: string; name: string; parent_id: string | null }>();
        for (const f of folders) {
            folderMap.set(f.id, f);
        }

        /**
         * 将日期字符串转为 Unix 秒级时间戳
         * @param dateStr - ISO 日期字符串
         * @returns Unix 秒级时间戳
         */
        function toUnixTimestamp(dateStr: string): number {
            return Math.floor(new Date(dateStr).getTime() / 1000);
        }

        /**
         * 递归生成文件夹的 HTML 书签结构
         * @param folderId - 文件夹 ID
         * @param indent - 缩进空格数
         * @returns HTML 字符串
         */
        function buildFolderHtml(folderId: string, indent: number): string {
            const folder = folderMap.get(folderId);
            if (!folder) return '';

            const pad = ' '.repeat(indent);
            const items = collectionsByFolder[folderId] || [];
            let html = `${pad}<DT><H3>${escapeHtml(folder.name)}</H3>\n`;
            html += `${pad}<DL><p>\n`;

            // 查找子文件夹
            const childFolders = folders.filter((f) => f.parent_id === folderId);
            for (const child of childFolders) {
                html += buildFolderHtml(child.id, indent + 4);
            }

            // 添加该文件夹下的书签
            for (const item of items) {
                const timestamp = toUnixTimestamp(item.created_at);
                html += `${pad}    <DT><A HREF="${escapeHtml(item.url)}" ADD_DATE="${timestamp}">${escapeHtml(item.title)}</A>\n`;
            }

            html += `${pad}</DL><p>\n`;
            return html;
        }

        /**
         * 转义 HTML 特殊字符
         * @param str - 原始字符串
         * @returns 转义后的字符串
         */
        function escapeHtml(str: string): string {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // 构建 HTML
        let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
        html += `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
        html += `<TITLE>Bookmarks</TITLE>\n`;
        html += `<H1>Bookmarks</H1>\n`;
        html += `<DL><p>\n`;

        // 根文件夹
        const rootFolders = folders.filter((f) => !f.parent_id);
        for (const rf of rootFolders) {
            html += buildFolderHtml(rf.id, 4);
        }

        // 未分类书签
        if (uncategorized.length > 0) {
            html += `    <DT><H3>未分类书签</H3>\n`;
            html += `    <DL><p>\n`;
            for (const item of uncategorized) {
                const timestamp = toUnixTimestamp(item.created_at);
                html += `        <DT><A HREF="${escapeHtml(item.url)}" ADD_DATE="${timestamp}">${escapeHtml(item.title)}</A>\n`;
            }
            html += `    </DL><p>\n`;
        }

        html += `</DL><p>\n`;

        const filename = `bookmarks-${new Date().toISOString().slice(0, 10)}.html`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(html);
    } catch (error) {
        console.error('[导出] HTML 导出失败:', error);
        res.status(500).json({
            code: 50001,
            message: '导出失败',
        });
    }
});

export default router;
