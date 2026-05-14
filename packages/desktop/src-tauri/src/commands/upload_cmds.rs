use crate::db::{models::*, get_db};
use rusqlite::params;
use uuid::Uuid;
use chrono::Utc;

#[tauri::command]
pub fn upload_file(file_name: String, file_data: Vec<u8>, mime_type: String, file_size: i64, folder_id: Option<String>) -> Result<UploadResult, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    // MIME 类型白名单校验
    let allowed_mime_types = [
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain", "text/markdown", "application/json",
        "application/zip", "application/x-rar-compressed", "application/x-7z-compressed",
    ];

    if !allowed_mime_types.contains(&mime_type.as_str()) {
        return Err(format!("不支持的文件类型: {}", mime_type));
    }

    // 按日期生成子目录
    let now = Utc::now();
    let date_sub_dir = format!("{}/{}/{}",
        now.format("%Y"),
        now.format("%m"),
        now.format("%d"));

    // 获取数据目录
    let app_dir = dirs::data_local_dir()
        .ok_or("无法确定应用数据目录")?
        .join("favorites");
    let upload_dir = app_dir.join("uploads").join(&date_sub_dir);
    std::fs::create_dir_all(&upload_dir).map_err(|e| e.to_string())?;

    // 生成唯一文件名
    let ext = std::path::Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let base_name = std::path::Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let unique_name = format!("{}-{}.{}", Uuid::new_v4(), base_name, ext);

    let full_path = upload_dir.join(&unique_name);
    std::fs::write(&full_path, &file_data).map_err(|e| e.to_string())?;

    // 构建相对路径
    let relative_path = format!("/uploads/{}/{}", date_sub_dir, unique_name);

    // 创建数据库记录
    let id = Uuid::new_v4().to_string();
    let now_str = now.to_rfc3339();

    db.prepare(
        "INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at) \
         VALUES (?, ?, NULL, 'file', NULL, NULL, NULL, ?, 0, ?, ?)"
    ).map_err(|e| e.to_string())?
    .execute(params![id, file_name, folder_id, now_str, now_str])
    .map_err(|e| {
        // 写入失败时清理文件
        let _ = std::fs::remove_file(&full_path);
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