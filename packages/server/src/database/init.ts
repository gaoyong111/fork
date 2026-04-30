import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/** 数据库实例类型 */
type DatabaseInstance = Database.Database;

/** 全局数据库实例 */
let db: DatabaseInstance | null = null;

/**
 * 获取数据库实例（单例模式）
 * @returns 数据库实例
 * @throws {Error} 数据库未初始化时抛出
 */
export function getDb(): DatabaseInstance {
    if (!db) {
        throw new Error('数据库未初始化，请先调用 initDatabase()');
    }
    return db;
}

/**
 * 初始化数据库，创建表结构和索引
 * @param dbPath - 数据库文件路径，默认为项目根目录下的 data/favorites.db
 * @returns 初始化后的数据库实例
 */
export function initDatabase(dbPath?: string): DatabaseInstance {
    // 确保数据目录存在
    const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'favorites.db');
    const dir = path.dirname(resolvedPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // 创建或打开数据库连接
    db = new Database(resolvedPath);

    // 启用 WAL 模式提升并发性能
    db.pragma('journal_mode = WAL');
    // 开启外键约束
    db.pragma('foreign_keys = ON');

    // 创建表结构
    createTables(db);

    console.log(`[数据库] 初始化完成: ${resolvedPath}`);
    return db;
}

/**
 * 创建数据库表结构
 * @param database - 数据库实例
 */
function createTables(database: DatabaseInstance): void {
    database.exec(`
        -- 收藏项表
        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            url TEXT,
            type TEXT NOT NULL DEFAULT 'link',
            content TEXT,
            summary TEXT,
            cover_url TEXT,
            folder_id TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );

        -- 文件夹表
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        -- 标签表
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#6366f1',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 收藏项-标签关联表
        CREATE TABLE IF NOT EXISTS collection_tags (
            collection_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (collection_id, tag_id),
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        -- 创建索引
        CREATE INDEX IF NOT EXISTS idx_collections_folder_id ON collections(folder_id);
        CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(type);
        CREATE INDEX IF NOT EXISTS idx_collections_is_deleted ON collections(is_deleted);
        CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at);
        CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_collection_tags_tag_id ON collection_tags(tag_id);
    `);

    // 创建 FTS5 全文搜索虚拟表
    createFtsTable(database);
}

/**
 * 创建 FTS5 全文搜索虚拟表及同步触发器
 * @param database - 数据库实例
 */
function createFtsTable(database: DatabaseInstance): void {
    database.exec(`
        -- 创建全文搜索虚拟表
        CREATE VIRTUAL TABLE IF NOT EXISTS collections_fts
        USING fts5(
            title,
            content,
            summary,
            content='collections',
            content_rowid='rowid',
            tokenize='unicode61'
        );

        -- 触发器：收藏项插入时同步到 FTS
        CREATE TRIGGER IF NOT EXISTS collections_fts_insert
        AFTER INSERT ON collections BEGIN
            INSERT INTO collections_fts(rowid, title, content, summary)
            VALUES (new.rowid, new.title, new.content, new.summary);
        END;

        -- 触发器：收藏项更新时同步到 FTS
        CREATE TRIGGER IF NOT EXISTS collections_fts_update
        AFTER UPDATE ON collections BEGIN
            INSERT INTO collections_fts(collections_fts, rowid, title, content, summary)
            VALUES ('delete', old.rowid, old.title, old.content, old.summary);
            INSERT INTO collections_fts(rowid, title, content, summary)
            VALUES (new.rowid, new.title, new.content, new.summary);
        END;

        -- 触发器：收藏项删除时同步到 FTS
        CREATE TRIGGER IF NOT EXISTS collections_fts_delete
        AFTER DELETE ON collections BEGIN
            INSERT INTO collections_fts(collections_fts, rowid, title, content, summary)
            VALUES ('delete', old.rowid, old.title, old.content, old.summary);
        END;
    `);
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        console.log('[数据库] 连接已关闭');
    }
}
