/// 存储信息
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_dir: String,
    pub db_size: u64,
    pub uploads_size: u64,
}

#[tauri::command]
pub fn get_storage_info() -> Result<StorageInfo, String> {
    let app_dir = dirs::data_local_dir()
        .ok_or("无法确定应用数据目录")?
        .join("favorites");

    let db_path = app_dir.join("favorites.db");
    let uploads_dir = app_dir.join("uploads");

    let db_size = std::fs::metadata(&db_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let uploads_size = calculate_dir_size(&uploads_dir);

    Ok(StorageInfo {
        data_dir: app_dir.to_string_lossy().to_string(),
        db_size,
        uploads_size,
    })
}

/// 计算目录总大小
fn calculate_dir_size(path: &std::path::Path) -> u64 {
    std::fs::read_dir(path)
        .ok()
        .map(|entries| {
            entries.filter_map(|e| e.ok()).map(|e| {
                let meta = e.metadata().ok();
                if let Some(m) = meta {
                    if m.is_dir() {
                        calculate_dir_size(&e.path())
                    } else {
                        m.len()
                    }
                } else {
                    0
                }
            }).sum()
        })
        .unwrap_or(0)
}

#[tauri::command]
pub fn backup_database() -> Result<String, String> {
    let app_dir = dirs::data_local_dir()
        .ok_or("无法确定应用数据目录")?
        .join("favorites");

    let db_path = app_dir.join("favorites.db");
    let backups_dir = app_dir.join("backups");
    std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_filename = format!("favorites-backup-{}.db", timestamp);
    let backup_path = backups_dir.join(&backup_filename);

    std::fs::copy(&db_path, &backup_path).map_err(|e| format!("备份失败: {}", e))?;

    // 保留最近 5 个备份，清理旧备份
    cleanup_old_backups(&backups_dir, 5);

    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn restore_database(backup_path: String) -> Result<(), String> {
    let app_dir = dirs::data_local_dir()
        .ok_or("无法确定应用数据目录")?
        .join("favorites");

    let db_path = app_dir.join("favorites.db");
    let backup = std::path::Path::new(&backup_path);

    // 验证备份文件存在
    if !backup.exists() {
        return Err("备份文件不存在".to_string());
    }

    // 验证是合法 SQLite 文件（头部检查）
    let header = std::fs::read(backup)
        .map_err(|e| format!("读取备份文件失败: {}", e))?;
    if header.len() < 16 || &header[0..16] != "SQLite format 3\0".as_bytes() {
        return Err("备份文件不是有效的 SQLite 数据库".to_string());
    }

    // 先备份当前数据库（以防恢复失败）
    let current_backup = app_dir.join("favorites-pre-restore.db");
    std::fs::copy(&db_path, &current_backup).map_err(|e| format!("保存当前数据失败: {}", e))?;

    // 恢复备份
    std::fs::copy(backup, &db_path).map_err(|e| {
        // 恢复失败，回滚到之前的状态
        let _ = std::fs::copy(&current_backup, &db_path);
        format!("恢复失败: {}", e)
    })?;

    // 清理临时文件
    let _ = std::fs::remove_file(&current_backup);

    Ok(())
}

#[tauri::command]
pub fn list_backups() -> Result<Vec<serde_json::Value>, String> {
    let app_dir = dirs::data_local_dir()
        .ok_or("无法确定应用数据目录")?
        .join("favorites");

    let backups_dir = app_dir.join("backups");
    if !backups_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups: Vec<serde_json::Value> = std::fs::read_dir(&backups_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("db") {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let modified = std::fs::metadata(&path)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                    .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
                    .flatten()
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default();
                Some(serde_json::json!({
                    "name": name,
                    "path": path.to_string_lossy().to_string(),
                    "size": size,
                    "modifiedAt": modified,
                }))
            } else {
                None
            }
        })
        .collect();

    // 按修改时间降序排列
    backups.sort_by(|a, b| {
        b.get("modifiedAt").and_then(|v| v.as_str()).unwrap_or("")
            .cmp(a.get("modifiedAt").and_then(|v| v.as_str()).unwrap_or(""))
    });

    Ok(backups)
}

#[tauri::command]
pub fn delete_backup(path: String) -> Result<(), String> {
    std::fs::remove_file(std::path::Path::new(&path))
        .map_err(|e| format!("删除备份失败: {}", e))?;
    Ok(())
}

/// 清理旧备份，保留最近 N 个
fn cleanup_old_backups(backups_dir: &std::path::Path, keep_count: usize) {
    let mut backups: Vec<std::path::PathBuf> = std::fs::read_dir(backups_dir)
        .ok()
        .map(|entries| {
            entries.filter_map(|e| e.ok())
                .filter(|e| e.path().extension().and_then(|ext| ext.to_str()) == Some("db"))
                .map(|e| e.path())
                .collect()
        })
        .unwrap_or_default();

    // 按修改时间排序（最新的在前）
    backups.sort_by(|a, b| {
        let a_time = std::fs::metadata(a).and_then(|m| m.modified()).ok();
        let b_time = std::fs::metadata(b).and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    // 删除超出保留数量的旧备份
    for old_backup in backups.iter().skip(keep_count) {
        let _ = std::fs::remove_file(old_backup);
    }
}

#[tauri::command]
pub fn get_data_dir() -> Result<String, String> {
    let app_dir = dirs::data_local_dir()
        .ok_or("无法确定应用数据目录")?
        .join("favorites");
    Ok(app_dir.to_string_lossy().to_string())
}