use crate::commands::file_storage;
use crate::db::error::{lock_db, map_ipc, AppError};
use rusqlite::params;
use std::path::Path;

#[cfg(target_os = "macos")]
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "无法确定文件所在目录".to_string())?;
    open::that(parent).map_err(|e| e.to_string())
}

fn get_collection_absolute_path(collection_id: &str) -> Result<std::path::PathBuf, AppError> {
    let db = lock_db()?;

    let relative_path: Option<String> = db
        .prepare("SELECT file_path FROM collections WHERE id = ? AND is_deleted = 0")?
        .query_row(params![collection_id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("收藏项不存在".to_string()))?;

    let relative_path = relative_path.ok_or_else(|| AppError::NotFound("该收藏项没有关联文件".to_string()))?;
    let absolute_path = file_storage::resolve_relative_path(&relative_path)
        .map_err(AppError::Validation)?;

    if !absolute_path.exists() {
        return Err(AppError::NotFound(format!("文件不存在: {}", absolute_path.display())));
    }

    Ok(absolute_path)
}

#[tauri::command]
pub fn open_file(collection_id: String) -> Result<(), String> {
    map_ipc(get_collection_absolute_path(&collection_id).and_then(|path| {
        open::that(&path).map_err(AppError::Io)?;
        Ok(())
    }))
}

#[tauri::command]
pub fn reveal_in_folder(collection_id: String) -> Result<(), String> {
    map_ipc(get_collection_absolute_path(&collection_id).and_then(|path| {
        reveal_in_file_manager(&path).map_err(|e| AppError::Validation(e))?;
        Ok(())
    }))
}
