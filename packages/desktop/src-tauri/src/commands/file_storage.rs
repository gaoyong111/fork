use rusqlite::{Connection, params};
use std::path::{Path, PathBuf};

pub const MAX_UPLOAD_BYTES: u64 = 50 * 1024 * 1024;

pub fn app_data_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|d| d.join("favorites"))
        .ok_or_else(|| "无法确定应用数据目录".to_string())
}

pub fn resolve_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let clean = relative_path.trim_start_matches('/');
    Ok(app_data_dir()?.join(clean))
}

pub fn delete_file_at_relative_path(relative_path: &str) {
    if let Ok(absolute) = resolve_relative_path(relative_path) {
        let _ = std::fs::remove_file(absolute);
    }
}

pub fn delete_collection_upload_file(db: &Connection, collection_id: &str) {
    let file_path: Option<String> = db
        .prepare("SELECT file_path FROM collections WHERE id = ?")
        .ok()
        .and_then(|mut stmt| stmt.query_row(params![collection_id], |row| row.get(0)).ok());

    if let Some(path) = file_path {
        delete_file_at_relative_path(&path);
    }
}

pub fn delete_upload_files_for_trash(db: &Connection) {
    let mut stmt = match db.prepare("SELECT file_path FROM collections WHERE is_deleted = 1 AND file_path IS NOT NULL") {
        Ok(s) => s,
        Err(_) => return,
    };

    let paths = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .ok()
        .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        .unwrap_or_default();

    for path in paths {
        delete_file_at_relative_path(&path);
    }
}

pub fn infer_mime_type(file_name: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "zip" => "application/zip",
        "rar" => "application/x-rar-compressed",
        "7z" => "application/x-7z-compressed",
        _ => "application/octet-stream",
    }
    .to_string()
}

pub fn is_allowed_mime(mime_type: &str) -> bool {
    [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
        "text/markdown",
        "application/json",
        "application/zip",
        "application/x-rar-compressed",
        "application/x-7z-compressed",
        "application/octet-stream",
    ]
    .contains(&mime_type)
}
