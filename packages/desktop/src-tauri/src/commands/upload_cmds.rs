use crate::commands::file_storage::{self, is_allowed_mime, infer_mime_type, MAX_UPLOAD_BYTES};
use crate::db::{models::*, get_db};
use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use chrono::Utc;

fn persist_upload(
    file_name: String,
    mime_type: String,
    file_size: i64,
    folder_id: Option<String>,
    write_to: &Path,
) -> Result<UploadResult, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    if !is_allowed_mime(&mime_type) {
        return Err(format!("不支持的文件类型: {}", mime_type));
    }

    let now = Utc::now();
    let date_sub_dir = format!(
        "{}/{}/{}",
        now.format("%Y"),
        now.format("%m"),
        now.format("%d")
    );

    let app_dir = file_storage::app_data_dir()?;
    let upload_dir = app_dir.join("uploads").join(&date_sub_dir);
    fs::create_dir_all(&upload_dir).map_err(|e| e.to_string())?;

    let ext = Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let base_name = Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let unique_name = format!("{}-{}.{}", Uuid::new_v4(), base_name, ext);

    let full_path = upload_dir.join(&unique_name);
    fs::copy(write_to, &full_path).map_err(|e| e.to_string())?;

    let relative_path = format!("/uploads/{}/{}", date_sub_dir, unique_name);
    let id = Uuid::new_v4().to_string();
    let now_str = now.to_rfc3339();

    db.prepare(
        "INSERT INTO collections (id, title, url, type, content, summary, cover_url, file_path, folder_id, is_favorite, created_at, updated_at) \
         VALUES (?, ?, NULL, 'file', NULL, NULL, NULL, ?, ?, 0, ?, ?)"
    ).map_err(|e| e.to_string())?
    .execute(params![id, file_name, relative_path, folder_id, now_str, now_str])
    .map_err(|e| {
        let _ = fs::remove_file(&full_path);
        e.to_string()
    })?;

    Ok(UploadResult {
        id,
        title: file_name,
        rtype: "file".to_string(),
        file_path: relative_path,
        file_size,
        mime_type,
        created_at: now_str,
    })
}

#[tauri::command]
pub fn upload_file(
    file_name: String,
    file_data: Vec<u8>,
    mime_type: String,
    file_size: i64,
    folder_id: Option<String>,
) -> Result<UploadResult, String> {
    if file_data.len() as u64 > MAX_UPLOAD_BYTES {
        return Err("文件大小不能超过 50MB".to_string());
    }

    let temp_dir = file_storage::app_data_dir()?.join("temp");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_path = temp_dir.join(format!("upload-{}", Uuid::new_v4()));
    fs::write(&temp_path, &file_data).map_err(|e| e.to_string())?;

    let result = persist_upload(file_name, mime_type, file_size, folder_id, &temp_path);
    let _ = fs::remove_file(&temp_path);
    result
}

#[tauri::command]
pub fn upload_file_from_path(
    source_path: String,
    folder_id: Option<String>,
) -> Result<UploadResult, String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("源文件不存在: {}", source_path));
    }

    let meta = fs::metadata(&source).map_err(|e| e.to_string())?;
    if meta.len() > MAX_UPLOAD_BYTES {
        return Err("文件大小不能超过 50MB".to_string());
    }

    let file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let mime_type = infer_mime_type(&file_name);
    let file_size = meta.len() as i64;

    persist_upload(file_name, mime_type, file_size, folder_id, &source)
}

#[tauri::command]
pub async fn upload_file_dialog(
    app: tauri::AppHandle,
    folder_id: Option<String>,
) -> Result<UploadResult, String> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app
        .dialog()
        .file()
        .add_filter("支持的文件", &["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "md", "json", "doc", "docx", "xls", "xlsx", "zip"])
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Err("用户取消了选择".to_string());
    };

    let path_str = file_path.to_string();
    upload_file_from_path(path_str, folder_id)
}
