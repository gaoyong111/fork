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

/// 执行建表 SQL
fn create_tables(conn: &Connection) {
    let schema_sql = include_str!("schema.sql");
    conn.execute_batch(schema_sql).expect("建表 SQL 执行失败");
}