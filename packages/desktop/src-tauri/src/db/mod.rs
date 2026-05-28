pub mod models;

use rusqlite::Connection;
use once_cell::sync::OnceCell;
use std::path::PathBuf;
use std::sync::Mutex;

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
    let schema_sql = include_str!("schema.sql");
    conn.execute_batch(schema_sql).expect("建表 SQL 执行失败");
}

/// 兼容已有数据库：检测并补充新列
fn migrate_columns(conn: &Connection) {
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
}