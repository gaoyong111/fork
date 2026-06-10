use rusqlite::{Connection, Error as SqliteError};
use std::sync::PoisonError;
use std::sync::MutexGuard;

use super::get_db;

/// 应用层错误（IPC 边界统一转为用户可读中文消息）
#[derive(Debug)]
pub enum AppError {
    Db(SqliteError),
    NotFound(String),
    Validation(String),
    Io(std::io::Error),
    Poisoned,
}

impl AppError {
    pub fn into_ipc(self) -> String {
        match self {
            AppError::NotFound(msg) => msg,
            AppError::Validation(msg) => msg,
            AppError::Poisoned => "数据库锁异常，请重启应用".to_string(),
            AppError::Db(e) => format!("数据库错误: {}", e),
            AppError::Io(e) => format!("文件操作失败: {}", e),
        }
    }
}

impl From<SqliteError> for AppError {
    fn from(value: SqliteError) -> Self {
        AppError::Db(value)
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value)
    }
}

impl<T> From<PoisonError<T>> for AppError {
    fn from(_: PoisonError<T>) -> Self {
        AppError::Poisoned
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// 获取数据库锁（统一错误处理）
pub fn lock_db() -> AppResult<MutexGuard<'static, Connection>> {
    Ok(get_db().lock()?)
}

/// 将 AppResult 转为 Tauri command 的 Result<T, String>
pub fn map_ipc<T>(result: AppResult<T>) -> Result<T, String> {
    result.map_err(|e| e.into_ipc())
}
