pub mod models;
pub mod error;
pub mod queries;
pub mod settings;
pub mod ai_config;

use rusqlite::Connection;
use once_cell::sync::OnceCell;
use std::path::PathBuf;
use std::sync::Mutex;

/// 共享 schema（packages/shared/db/）
const SCHEMA_SQL: &str = concat!(
    include_str!("../../../../shared/db/schema.sql"),
    include_str!("../../../../shared/db/schema-desktop.sql"),
);

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

/// 获取数据库连接（单例模式）
pub fn get_db() -> &'static Mutex<Connection> {
    DB.get().expect("数据库未初始化，请先调用 init_db()")
}

/// 初始化数据库，创建表结构和索引
pub fn init_db(db_path: Option<&str>) -> &'static Mutex<Connection> {
    DB.get_or_init(|| {
        let path = db_path
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let app_dir = dirs::data_local_dir()
                    .expect("无法确定应用数据目录")
                    .join("favorites");
                std::fs::create_dir_all(&app_dir).expect("无法创建数据目录");
                app_dir.join("favorites.db")
            });

        // 确保上传目录存在
        let uploads_dir = path.parent().unwrap().join("uploads");
        std::fs::create_dir_all(&uploads_dir).expect("无法创建上传目录");

        let conn = Connection::open(&path).expect("无法打开数据库");

        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
            .expect("PRAGMA 设置失败");

        create_tables(&conn);

        println!("[数据库] 初始化完成: {}", path.display());
        Mutex::new(conn)
    })
}

/// 执行建表 SQL（先迁移旧库缺列，再跑 schema）
fn create_tables(conn: &Connection) {
    migrate_columns(conn);
    conn.execute_batch(SCHEMA_SQL).expect("建表 SQL 执行失败");
    // schema 使用 CREATE TRIGGER IF NOT EXISTS，旧库错误触发器需在 schema 之后强制替换
    migrate_fts_update_trigger(conn);
}

/// 兼容已有数据库：检测并补充新列
fn migrate_columns(conn: &Connection) {
    let table_exists: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='collections'")
        .ok()
        .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, i64>(0)).ok())
        .map(|c| c > 0)
        .unwrap_or(false);

    if !table_exists {
        return;
    }

    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(collections)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .filter_map(|c| c.ok())
        .collect();

    let existing: std::collections::HashSet<String> = columns.into_iter().collect();

    if !existing.contains("is_archived") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0")
            .expect("迁移 is_archived 列失败");
        println!("[数据库] 迁移：新增 is_archived 列");
    }

    if !existing.contains("read_count") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN read_count INTEGER NOT NULL DEFAULT 0")
            .expect("迁移 read_count 列失败");
        println!("[数据库] 迁移：新增 read_count 列");
    }

    if !existing.contains("raw_content") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN raw_content TEXT DEFAULT NULL")
            .expect("迁移 raw_content 列失败");
        println!("[数据库] 迁移：新增 raw_content 列");
    }

    if !existing.contains("file_path") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN file_path TEXT DEFAULT NULL")
            .expect("迁移 file_path 列失败");
        println!("[数据库] 迁移：新增 file_path 列");
    }

    if !existing.contains("content_brief") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN content_brief TEXT DEFAULT NULL")
            .expect("迁移 content_brief 列失败");
        println!("[数据库] 迁移：新增 content_brief 列");
    }

    if !existing.contains("content_detailed") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN content_detailed TEXT DEFAULT NULL")
            .expect("迁移 content_detailed 列失败");
        println!("[数据库] 迁移：新增 content_detailed 列");
    }

    if !existing.contains("summary_mode") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN summary_mode TEXT DEFAULT 'detailed'")
            .expect("迁移 summary_mode 列失败");
        println!("[数据库] 迁移：新增 summary_mode 列");
    }

    if !existing.contains("images") {
        conn.execute_batch("ALTER TABLE collections ADD COLUMN images TEXT DEFAULT NULL")
            .expect("迁移 images 列失败");
        println!("[数据库] 迁移：新增 images 列");
    }

    // 重建 FTS5 表以包含 raw_content 列
    rebuild_fts_if_needed(conn);
}

/// 替换 FTS update 触发器（CREATE IF NOT EXISTS 无法更新已有错误触发器）
fn migrate_fts_update_trigger(conn: &Connection) {
    let fts_exists: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='collections_fts'")
        .ok()
        .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, i64>(0)).ok())
        .map(|c| c > 0)
        .unwrap_or(false);

    if !fts_exists {
        return;
    }

    conn.execute_batch(
        "DROP TRIGGER IF EXISTS collections_fts_update;
         CREATE TRIGGER collections_fts_update AFTER UPDATE ON collections BEGIN
             INSERT INTO collections_fts(collections_fts, rowid, title, content, summary, raw_content)
             VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.raw_content);
             INSERT INTO collections_fts(rowid, title, content, summary, raw_content)
             VALUES (new.rowid, new.title, new.content, new.summary, new.raw_content);
         END;",
    )
    .expect("迁移 FTS update 触发器失败");
}

/// 重建 FTS5 虚拟表以包含 raw_content 列
fn rebuild_fts_if_needed(conn: &Connection) {
    let fts_columns: Vec<String> = conn
        .prepare("PRAGMA table_info(collections_fts)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default();

    let has_raw_content = fts_columns.iter().any(|c| c == "raw_content");

    if !has_raw_content {
        conn.execute_batch("DROP TABLE IF EXISTS collections_fts").ok();
        println!("[数据库] 重建 FTS5 表：包含 raw_content 列");
        conn.execute_batch(SCHEMA_SQL).expect("重建 FTS5 表失败");
    }
}

#[cfg(test)]
mod ai_config_tests {
    use super::ai_config;

    #[test]
    fn loads_shared_deep_read_config() {
        assert_eq!(ai_config::chunk_threshold(), 12000);
        assert_eq!(ai_config::chunk_size(), 10000);
        assert!(ai_config::template_prompt("general", "full").contains("深度阅读助手"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_legacy_collections_table(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE collections (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT,
                type TEXT NOT NULL DEFAULT 'link',
                content TEXT,
                summary TEXT,
                cover_url TEXT,
                folder_id TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                read_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .unwrap();
    }

    fn table_columns(conn: &Connection, table: &str) -> Vec<String> {
        conn.prepare(&format!("PRAGMA table_info({table})"))
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|c| c.ok())
            .collect()
    }

    #[test]
    fn migrate_columns_adds_file_path() {
        let conn = Connection::open_in_memory().unwrap();
        create_legacy_collections_table(&conn);

        let columns_before = table_columns(&conn, "collections");
        assert!(!columns_before.contains(&"file_path".to_string()));

        migrate_columns(&conn);

        let columns_after = table_columns(&conn, "collections");
        assert!(columns_after.contains(&"file_path".to_string()));
    }

    #[test]
    fn migrate_columns_idempotent_for_file_path() {
        let conn = Connection::open_in_memory().unwrap();
        create_legacy_collections_table(&conn);

        migrate_columns(&conn);
        migrate_columns(&conn);

        let columns = table_columns(&conn, "collections");
        assert_eq!(columns.iter().filter(|c| *c == "file_path").count(), 1);
    }

    #[test]
    fn create_tables_fresh_db_has_file_path_and_fts_delete_trigger() {
        let conn = Connection::open_in_memory().unwrap();
        create_tables(&conn);

        let columns = table_columns(&conn, "collections");
        assert!(columns.contains(&"file_path".to_string()));

        let trigger_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='collections_fts_update'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(trigger_sql.contains("'delete'"));
    }
}