import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/init';

const router: Router = Router();

/** 文件上传配置：内存存储，限制 50MB */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
});

/** 导入结果统计接口 */
interface ImportResult {
    foldersCreated: number;
    tagsCreated: number;
    collectionsCreated: number;
    collectionsSkipped: number;
}

/**
 * JSON 导入数据格式接口
 */
interface ImportJsonData {
    version?: number;
    folders?: Record<string, unknown>[];
    tags?: Record<string, unknown>[];
    collections?: (Record<string, unknown> & { tags?: Record<string, unknown>[] })[];
}

/**
 * HTML 书签项接口
 */
interface BookmarkItem {
    title: string;
    url: string;
    addDate?: number;
}

/**
 * HTML 书签文件夹接口
 */
interface BookmarkFolder {
    name: string;
    bookmarks: BookmarkItem[];
    children: BookmarkFolder[];
}

/**
 * 导入 JSON 备份文件
 * POST /api/import/json
 * - 验证 JSON 格式和版本号
 * - 导入文件夹（按名称去重）
 * - 导入标签（按名称去重）
 * - 导入收藏项（按 URL 去重）
 */
router.post('/json', upload.single('file'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ code: 40001, message: '请上传文件' });
            return;
        }

        // 验证文件类型
        if (!req.file.originalname.endsWith('.json')) {
            res.status(400).json({ code: 40001, message: '请上传 JSON 格式文件' });
            return;
        }

        let data: ImportJsonData;
        try {
            const raw = req.file.buffer.toString('utf-8');
            data = JSON.parse(raw);
        } catch {
            res.status(400).json({ code: 40001, message: 'JSON 文件格式错误，无法解析' });
            return;
        }

        // 验证必要字段
        if (typeof data !== 'object' || data === null) {
            res.status(400).json({ code: 40001, message: 'JSON 格式不正确' });
            return;
        }

        // 版本兼容性检查
        if (data.version !== undefined && typeof data.version !== 'number') {
            res.status(400).json({ code: 40001, message: '版本号格式不正确' });
            return;
        }

        const db = getDb();
        const result: ImportResult = {
            foldersCreated: 0,
            tagsCreated: 0,
            collectionsCreated: 0,
            collectionsSkipped: 0,
        };

        // 导入文件夹（按名称去重）
        if (Array.isArray(data.folders)) {
            for (const folder of data.folders) {
                const name = folder.name as string;
                if (!name || typeof name !== 'string' || !name.trim()) continue;

                const existing = db.prepare('SELECT id FROM folders WHERE name = ?')
                    .get(name.trim()) as Record<string, unknown> | undefined;

                if (!existing) {
                    const id = uuidv4();
                    const now = new Date().toISOString();
                    db.prepare(
                        'INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
                    ).run(
                        id,
                        name.trim(),
                        (folder.parent_id as string) || null,
                        (folder.sort_order as number) ?? 0,
                        now,
                        now,
                    );
                    result.foldersCreated++;
                }
            }
        }

        // 导入标签（按名称去重）
        if (Array.isArray(data.tags)) {
            for (const tag of data.tags) {
                const name = tag.name as string;
                if (!name || typeof name !== 'string' || !name.trim()) continue;

                const existing = db.prepare('SELECT id FROM tags WHERE name = ?')
                    .get(name.trim()) as Record<string, unknown> | undefined;

                if (!existing) {
                    const id = uuidv4();
                    const now = new Date().toISOString();
                    db.prepare(
                        'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)'
                    ).run(id, name.trim(), (tag.color as string) || '#6366f1', now);
                    result.tagsCreated++;
                }
            }
        }

        // 导入收藏项（按 URL 去重）
        if (Array.isArray(data.collections)) {
            for (const col of data.collections) {
                const title = col.title as string;
                if (!title || typeof title !== 'string' || !title.trim()) continue;

                const url = (col.url as string) || null;

                // 如果有 URL，按 URL 去重
                if (url) {
                    const existing = db.prepare(
                        'SELECT id FROM collections WHERE url = ? AND is_deleted = 0'
                    ).get(url) as Record<string, unknown> | undefined;

                    if (existing) {
                        result.collectionsSkipped++;
                        continue;
                    }
                }

                const id = uuidv4();
                const now = new Date().toISOString();

                // 解析文件夹 ID（按名称匹配）
                let folderId: string | null = null;
                if (col.folder_id) {
                    // 尝试直接匹配 ID
                    const folderById = db.prepare('SELECT id FROM folders WHERE id = ?')
                        .get(col.folder_id) as Record<string, unknown> | undefined;
                    if (folderById) {
                        folderId = col.folder_id as string;
                    }
                }

                db.prepare(`
                    INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    id,
                    title.trim(),
                    url,
                    (col.type as string) || 'link',
                    (col.content as string) || null,
                    (col.summary as string) || null,
                    (col.cover_url as string) || null,
                    folderId,
                    (col.is_favorite as number) ? 1 : 0,
                    now,
                    now,
                );

                // 关联标签（按名称匹配）
                if (Array.isArray(col.tags)) {
                    const insertTagRel = db.prepare(
                        'INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)'
                    );
                    for (const tag of col.tags) {
                        const tagName = tag.name as string;
                        if (!tagName) continue;

                        const existingTag = db.prepare('SELECT id FROM tags WHERE name = ?')
                            .get(tagName) as Record<string, unknown> | undefined;

                        if (existingTag) {
                            insertTagRel.run(id, existingTag.id);
                        }
                    }
                }

                result.collectionsCreated++;
            }
        }

        res.json({
            code: 0,
            message: '导入成功',
            data: result,
        });
    } catch (error) {
        console.error('[导入] JSON 导入失败:', error);
        res.status(500).json({
            code: 50001,
            message: '导入失败',
        });
    }
});

/**
 * 导入浏览器书签 HTML 文件
 * POST /api/import/html
 * - 解析 Netscape Bookmark File 格式
 * - 递归提取文件夹结构和书签链接
 * - 创建文件夹（按名称去重）
 * - 创建收藏项（type=link，按 URL 去重）
 */
router.post('/html', upload.single('file'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ code: 40001, message: '请上传文件' });
            return;
        }

        // 验证文件类型
        if (!req.file.originalname.endsWith('.html') && !req.file.originalname.endsWith('.htm')) {
            res.status(400).json({ code: 40001, message: '请上传 HTML 格式书签文件' });
            return;
        }

        const html = req.file.buffer.toString('utf-8');
        const $ = cheerio.load(html);

        const db = getDb();
        const result: ImportResult = {
            foldersCreated: 0,
            tagsCreated: 0,
            collectionsCreated: 0,
            collectionsSkipped: 0,
        };

        /**
         * 递归解析书签文件夹结构
         * @param dlElement - DL DOM 元素
         * @param parentId - 父文件夹 ID，null 表示根级别
         * @returns 解析出的书签文件夹列表
         */
        function parseBookmarkDl(dlElement: cheerio.Cheerio<any>, parentId: string | null): BookmarkFolder[] {
            const folders: BookmarkFolder[] = [];

            // 遍历 DT 子元素
            dlElement.children('dt').each((_i, dtEl) => {
                const dt = $(dtEl);
                const h3 = dt.children('h3').first();

                if (h3.length) {
                    // 这是一个文件夹
                    const folderName = h3.text().trim();
                    if (!folderName) return;

                    const subDl = dt.children('dl').first();
                    const folder: BookmarkFolder = {
                        name: folderName,
                        bookmarks: [],
                        children: [],
                    };

                    // 提取文件夹内的书签链接
                    subDl.children('dt').each((_j, subDtEl) => {
                        const subDt = $(subDtEl);
                        const a = subDt.children('a').first();

                        if (a.length) {
                            const href = a.attr('href');
                            const title = a.text().trim();
                            if (href && title) {
                                folder.bookmarks.push({
                                    title,
                                    url: href,
                                    addDate: parseInt(a.attr('add_date') || '0', 10) || undefined,
                                });
                            }
                        }
                    });

                    // 递归解析子文件夹
                    if (subDl.length) {
                        folder.children = parseBookmarkDl(subDl, null);
                    }

                    folders.push(folder);
                } else {
                    // 根级别的书签链接（不在文件夹内）
                    const a = dt.children('a').first();
                    if (a.length) {
                        const href = a.attr('href');
                        const title = a.text().trim();
                        if (href && title) {
                            // 根级别书签放到一个虚拟文件夹中，后续统一处理
                            // 这里暂不处理，因为根级别书签较少
                        }
                    }
                }
            });

            return folders;
        }

        // 解析最外层的 DL
        const rootDl = $('dl').first();
        const bookmarkFolders = parseBookmarkDl(rootDl, null);

        /**
         * 递归创建文件夹并导入书签
         * @param folders - 书签文件夹列表
         * @param parentFolderId - 父文件夹数据库 ID
         */
        function importBookmarkFolders(folders: BookmarkFolder[], parentFolderId: string | null): void {
            for (const folder of folders) {
                // 按名称查找或创建文件夹
                let folderId: string | null = null;
                const existing = db.prepare('SELECT id FROM folders WHERE name = ?')
                    .get(folder.name) as Record<string, unknown> | undefined;

                if (existing) {
                    folderId = existing.id as string;
                } else {
                    folderId = uuidv4();
                    const now = new Date().toISOString();
                    db.prepare(
                        'INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
                    ).run(folderId, folder.name, parentFolderId, 0, now, now);
                    result.foldersCreated++;
                }

                // 导入书签
                for (const bookmark of folder.bookmarks) {
                    // 按 URL 去重
                    const existingCol = db.prepare(
                        'SELECT id FROM collections WHERE url = ? AND is_deleted = 0'
                    ).get(bookmark.url) as Record<string, unknown> | undefined;

                    if (existingCol) {
                        result.collectionsSkipped++;
                        continue;
                    }

                    const id = uuidv4();
                    const now = new Date().toISOString();

                    db.prepare(`
                        INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        id,
                        bookmark.title,
                        bookmark.url,
                        'link',
                        null,
                        null,
                        null,
                        folderId,
                        0,
                        now,
                        now,
                    );

                    result.collectionsCreated++;
                }

                // 递归处理子文件夹
                if (folder.children.length > 0) {
                    importBookmarkFolders(folder.children, folderId);
                }
            }
        }

        importBookmarkFolders(bookmarkFolders, null);

        res.json({
            code: 0,
            message: '导入成功',
            data: result,
        });
    } catch (error) {
        console.error('[导入] HTML 导入失败:', error);
        res.status(500).json({
            code: 50001,
            message: '导入失败',
        });
    }
});

export default router;
