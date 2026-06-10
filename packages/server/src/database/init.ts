import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/** 数据库实例类型 */
type DatabaseInstance = Database.Database;

/** 全局数据库实例 */
let db: DatabaseInstance | null = null;

/** 共享 schema 路径（packages/shared/db/schema.sql） */
function getSharedSchemaPath(): string {
    return path.join(__dirname, '../../../shared/db/schema.sql');
}

function loadSharedSchema(): string {
    return fs.readFileSync(getSharedSchemaPath(), 'utf-8');
}

/**
 * 获取数据库实例（单例模式）
 */
export function getDb(): DatabaseInstance {
    if (!db) {
        throw new Error('数据库未初始化，请先调用 initDatabase()');
    }
    return db;
}

/**
 * 初始化数据库，创建表结构和索引
 */
export function initDatabase(dbPath?: string): DatabaseInstance {
    const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'favorites.db');
    const dir = path.dirname(resolvedPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    migrateColumns(db);
    db.exec(loadSharedSchema());
    migrateFtsUpdateTrigger(db);

    console.log(`[数据库] 初始化完成: ${resolvedPath}`);
    return db;
}

function collectionsTableExists(database: DatabaseInstance): boolean {
    const row = database.prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='collections'"
    ).get() as { c: number };
    return row.c > 0;
}

/**
 * 兼容已有数据库：检测并补充新列
 */
function migrateColumns(database: DatabaseInstance): void {
    if (!collectionsTableExists(database)) {
        return;
    }

    const columns = database.prepare('PRAGMA table_info(collections)').all() as { name: string }[];
    const existingNames = new Set(columns.map((c) => c.name));

    if (!existingNames.has('is_archived')) {
        database.exec('ALTER TABLE collections ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0');
        console.log('[数据库] 迁移：新增 is_archived 列');
    }

    if (!existingNames.has('read_count')) {
        database.exec('ALTER TABLE collections ADD COLUMN read_count INTEGER NOT NULL DEFAULT 0');
        console.log('[数据库] 迁移：新增 read_count 列');
    }

    if (!existingNames.has('raw_content')) {
        database.exec('ALTER TABLE collections ADD COLUMN raw_content TEXT DEFAULT NULL');
        console.log('[数据库] 迁移：新增 raw_content 列');
    }

    if (!existingNames.has('file_path')) {
        database.exec('ALTER TABLE collections ADD COLUMN file_path TEXT DEFAULT NULL');
        console.log('[数据库] 迁移：新增 file_path 列');
    }

    if (!existingNames.has('content_brief')) {
        database.exec('ALTER TABLE collections ADD COLUMN content_brief TEXT DEFAULT NULL');
        console.log('[数据库] 迁移：新增 content_brief 列');
    }

    if (!existingNames.has('content_detailed')) {
        database.exec('ALTER TABLE collections ADD COLUMN content_detailed TEXT DEFAULT NULL');
        console.log('[数据库] 迁移：新增 content_detailed 列');
    }

    if (!existingNames.has('summary_mode')) {
        database.exec("ALTER TABLE collections ADD COLUMN summary_mode TEXT DEFAULT 'detailed'");
        console.log('[数据库] 迁移：新增 summary_mode 列');
    }

    rebuildFtsIfNeeded(database);
}

/**
 * 替换 FTS update 触发器（CREATE IF NOT EXISTS 无法更新已有错误触发器）
 */
function migrateFtsUpdateTrigger(database: DatabaseInstance): void {
    const row = database.prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='collections_fts'"
    ).get() as { c: number };
    if (row.c === 0) return;

    database.exec(`
        DROP TRIGGER IF EXISTS collections_fts_update;
        CREATE TRIGGER collections_fts_update AFTER UPDATE ON collections BEGIN
            INSERT INTO collections_fts(collections_fts, rowid, title, content, summary, raw_content)
            VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.raw_content);
            INSERT INTO collections_fts(rowid, title, content, summary, raw_content)
            VALUES (new.rowid, new.title, new.content, new.summary, new.raw_content);
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

/**
 * 重建 FTS5 虚拟表以包含 raw_content 列
 */
function rebuildFtsIfNeeded(database: DatabaseInstance): void {
    try {
        const ftsInfo = database.prepare('PRAGMA table_info(collections_fts)').all() as { name: string }[];
        const ftsColumns = new Set(ftsInfo.map((c) => c.name));

        if (!ftsColumns.has('raw_content')) {
            database.exec('DROP TABLE IF EXISTS collections_fts');
            console.log('[数据库] 重建 FTS5 表：包含 raw_content 列');
            database.exec(loadSharedSchema());
            migrateFtsUpdateTrigger(database);
        }
    } catch (err) {
        console.error('[数据库] FTS5 重建检查失败:', err);
    }
}
