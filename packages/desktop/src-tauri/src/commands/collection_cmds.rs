use crate::db::{models::*, get_db};
use crate::db::queries::folder::get_folder_scope_ids;
use rusqlite::params;
use uuid::Uuid;
use chrono::Utc;

pub use crate::db::queries::collection::{
    batch_load_tags, batch_load_folder_brief, collection_from_row, COLLECTION_SELECT_FIELDS,
};

/**
 * 读取单个收藏项（不加锁版本，供已持有锁的函数内部调用）
 * 与 get_collection_by_id 逻辑相同，但接受 &Connection 参数避免二次加锁死锁
 */
fn read_collection_by_id(db: &rusqlite::Connection, id: &str) -> Result<Collection, String> {
    let mut col = db.prepare(
        &format!("SELECT {COLLECTION_SELECT_FIELDS} FROM collections WHERE id = ? AND is_deleted = 0")
    ).map_err(|e| e.to_string())?
    .query_row(params![id], collection_from_row).map_err(|e| e.to_string())?;

    col.tags = db.prepare(
        "SELECT t.id, t.name, t.color, t.created_at \
         FROM collection_tags ct JOIN tags t ON ct.tag_id = t.id \
         WHERE ct.collection_id = ?"
    ).map_err(|e| e.to_string())?
    .query_map(params![id], |row| {
        Ok(Tag { id: row.get(0)?, name: row.get(1)?, color: row.get(2)?, collection_count: None, created_at: row.get(3)? })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<Tag>, _>>().map_err(|e| e.to_string())?;

    if let Some(ref fid) = col.folder_id {
        col.folder = db.prepare("SELECT id, name FROM folders WHERE id = ?")
            .map_err(|e| e.to_string())?
            .query_row(params![fid], |row| Ok(FolderBrief { id: row.get(0)?, name: row.get(1)? }))
            .ok();
    }

    Ok(col)
}

#[tauri::command]
pub fn get_collections(params: Option<GetCollectionsParams>) -> Result<PaginatedData<Collection>, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let p = params.unwrap_or_default();
    let page = p.page.unwrap_or(1).max(1);
    let limit = p.page_size.unwrap_or(20).min(100).max(1);
    let offset = (page - 1) * limit;

    // 构建 WHERE 条件
    let mut conditions = vec!["is_deleted = 0".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref rtype) = p.rtype {
        conditions.push("type = ?".to_string());
        param_values.push(Box::new(rtype.clone()));
    }
    if let Some(ref folder_id) = p.folder_id {
        let scope_ids = get_folder_scope_ids(&db, folder_id).map_err(|e| e.to_string())?;
        let placeholders = scope_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        conditions.push(format!("folder_id IN ({})", placeholders));
        for id in scope_ids {
            param_values.push(Box::new(id));
        }
    }
    if let Some(ref tag_id) = p.tag_id {
        conditions.push("id IN (SELECT collection_id FROM collection_tags WHERE tag_id = ?)".to_string());
        param_values.push(Box::new(tag_id.clone()));
    }
    if let Some(is_favorite) = p.is_favorite {
        conditions.push("is_favorite = ?".to_string());
        param_values.push(Box::new(if is_favorite { 1 } else { 0 }));
    }
    if let Some(is_archived) = p.is_archived {
        conditions.push("is_archived = ?".to_string());
        param_values.push(Box::new(if is_archived { 1 } else { 0 }));
    }
    if let Some(ref keyword) = p.keyword {
        conditions.push("(title LIKE ? OR content LIKE ? OR summary LIKE ?)".to_string());
        let kw = format!("%{}%", keyword);
        param_values.push(Box::new(kw.clone()));
        param_values.push(Box::new(kw.clone()));
        param_values.push(Box::new(kw));
    }

    let where_clause = conditions.join(" AND ");

    // 排序：归档项始终排最后，同组内按用户选择的排序
    let sort_map: std::collections::HashMap<&str, &str> = std::collections::HashMap::from([
        ("created_at", "created_at"),
        ("updated_at", "updated_at"),
        ("title", "title"),
    ]);
    let sort_by = p.sort_by.as_deref().and_then(|s| sort_map.get(s)).map_or("created_at", |v| *v);
    let sort_order = match p.sort_order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };
    let order_clause = format!("is_archived ASC, {} {}", sort_by, sort_order);

    // 计数
    let count_sql = format!("SELECT COUNT(*) as total FROM collections WHERE {}", where_clause);
    let total: i64 = db.prepare(&count_sql)
        .map_err(|e| e.to_string())?
        .query_row(rusqlite::params_from_iter(param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql)), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // 查询列表
    let list_sql = format!(
        "SELECT {COLLECTION_SELECT_FIELDS} FROM collections WHERE {} ORDER BY {} LIMIT ? OFFSET ?",
        where_clause, order_clause
    );

    let mut stmt = db.prepare(&list_sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .chain(std::iter::once(&limit as &dyn rusqlite::types::ToSql))
        .chain(std::iter::once(&offset as &dyn rusqlite::types::ToSql))
        .collect();

    let collections = stmt.query_map(rusqlite::params_from_iter(param_refs.iter()), collection_from_row).map_err(|e| e.to_string())?
    .collect::<Result<Vec<Collection>, _>>().map_err(|e| e.to_string())?;

    // 批量获取标签
    let items_with_tags = batch_load_tags(&db, &collections).map_err(|e| e.to_string())?;

    // 获取文件夹信息
    let items_with_folder = batch_load_folder_brief(&db, &items_with_tags).map_err(|e| e.to_string())?;

    Ok(PaginatedData {
        items: items_with_folder,
        pagination: Pagination {
            page,
            page_size: limit,
            total,
            total_pages: (total + limit - 1) / limit,
        },
    })
}

#[tauri::command]
pub fn get_collection_by_id(id: String) -> Result<Collection, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    read_collection_by_id(&db, &id)
}

#[tauri::command]
pub fn create_collection(data: CreateCollectionParams) -> Result<Collection, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let rtype = data.rtype.unwrap_or("link".to_string());
    let is_favorite_int = if data.is_favorite.unwrap_or(false) { 1 } else { 0 };

    db.prepare(
        "INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).map_err(|e| e.to_string())?
    .execute(params![
        id, data.title, data.url, rtype, data.content,
        data.description, data.thumbnail_url, data.folder_id,
        is_favorite_int, now, now
    ]).map_err(|e| e.to_string())?;

    // 关联标签
    if let Some(tag_ids) = data.tag_ids {
        for tag_id in &tag_ids {
            db.prepare("INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)")
                .map_err(|e| e.to_string())?
                .execute(params![id, tag_id]).map_err(|e| e.to_string())?;
        }
    }

    read_collection_by_id(&db, &id)
}

#[tauri::command]
pub fn update_collection(id: String, data: UpdateCollectionParams) -> Result<Collection, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // 验证存在
    let exists: bool = db.prepare("SELECT COUNT(*) FROM collections WHERE id = ? AND is_deleted = 0")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err("收藏项不存在".to_string());
    }

    // 动态构建 UPDATE
    let mut updates = vec!["updated_at = ?".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];

    if let Some(ref title) = data.title {
        updates.push("title = ?".to_string());
        param_values.push(Box::new(title.clone()));
    }
    if let Some(ref url) = data.url {
        updates.push("url = ?".to_string());
        param_values.push(Box::new(url.clone()));
    }
    if let Some(ref rtype) = data.rtype {
        updates.push("type = ?".to_string());
        param_values.push(Box::new(rtype.clone()));
    }
    if let Some(ref content) = data.content {
        updates.push("content = ?".to_string());
        param_values.push(Box::new(content.clone()));
    }
    if let Some(ref raw_content) = data.raw_content {
        updates.push("raw_content = ?".to_string());
        param_values.push(Box::new(raw_content.clone()));
    }
    if let Some(ref images) = data.images {
        updates.push("images = ?".to_string());
        param_values.push(Box::new(images.clone()));
    }
    if let Some(ref content_brief) = data.content_brief {
        updates.push("content_brief = ?".to_string());
        param_values.push(Box::new(content_brief.clone()));
    }
    if let Some(ref content_detailed) = data.content_detailed {
        updates.push("content_detailed = ?".to_string());
        param_values.push(Box::new(content_detailed.clone()));
    }
    if let Some(ref summary_mode) = data.summary_mode {
        updates.push("summary_mode = ?".to_string());
        param_values.push(Box::new(summary_mode.clone()));
    }
    if let Some(ref desc) = data.description {
        updates.push("summary = ?".to_string());
        param_values.push(Box::new(desc.clone()));
    }
    if let Some(ref thumbnail) = data.thumbnail_url {
        updates.push("cover_url = ?".to_string());
        param_values.push(Box::new(thumbnail.clone()));
    }
    if let Some(ref folder_id) = data.folder_id {
        updates.push("folder_id = ?".to_string());
        param_values.push(Box::new(folder_id.clone()));
    }
    if let Some(is_favorite) = data.is_favorite {
        updates.push("is_favorite = ?".to_string());
        param_values.push(Box::new(if is_favorite { 1 } else { 0 }));
    }

    let update_sql = format!("UPDATE collections SET {} WHERE id = ?", updates.join(", "));
    param_values.push(Box::new(id.clone()));

    db.prepare(&update_sql).map_err(|e| e.to_string())?
        .execute(rusqlite::params_from_iter(param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql)))
        .map_err(|e| e.to_string())?;

    // 更新标签关联
    if let Some(ref tag_ids) = data.tag_ids {
        db.prepare("DELETE FROM collection_tags WHERE collection_id = ?")
            .map_err(|e| e.to_string())?
            .execute(params![id]).map_err(|e| e.to_string())?;

        for tag_id in tag_ids {
            db.prepare("INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)")
                .map_err(|e| e.to_string())?
                .execute(params![id, tag_id]).map_err(|e| e.to_string())?;
        }
    }

    read_collection_by_id(&db, &id)
}

#[tauri::command]
pub fn delete_collection(id: String) -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    db.prepare("UPDATE collections SET is_deleted = 1, updated_at = ? WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![Utc::now().to_rfc3339(), id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn batch_delete_collections(ids: Vec<String>) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let mut deleted = 0;

    for id in &ids {
        db.prepare("UPDATE collections SET is_deleted = 1, updated_at = ? WHERE id = ? AND is_deleted = 0")
            .map_err(|e| e.to_string())?
            .execute(params![now, id])
            .map_err(|e| e.to_string())?;
        deleted += 1;
    }

    Ok(serde_json::json!({ "deletedCount": deleted }))
}

#[tauri::command]
pub fn batch_move_collections(ids: Vec<String>, folder_id: Option<String>) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // 验证文件夹存在
    if let Some(ref fid) = folder_id {
        let exists: bool = db.prepare("SELECT COUNT(*) FROM folders WHERE id = ?")
            .map_err(|e| e.to_string())?
            .query_row(params![fid], |row| row.get::<_, i64>(0).map(|c| c > 0))
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("目标文件夹不存在".to_string());
        }
    }

    let mut moved = 0;
    for id in &ids {
        db.prepare("UPDATE collections SET folder_id = ?, updated_at = ? WHERE id = ? AND is_deleted = 0")
            .map_err(|e| e.to_string())?
            .execute(params![folder_id, now, id])
            .map_err(|e| e.to_string())?;
        moved += 1;
    }

    Ok(serde_json::json!({ "movedCount": moved }))
}

#[tauri::command]
pub fn batch_add_tags(ids: Vec<String>, tag_ids: Vec<String>, action: String) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let mut updated = 0;

    for id in &ids {
        // 验证收藏项存在
        let exists: bool = db.prepare("SELECT COUNT(*) FROM collections WHERE id = ? AND is_deleted = 0")
            .map_err(|e| e.to_string())?
            .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
            .map_err(|e| e.to_string())?;
        if !exists { continue; }

        if action == "replace" {
            db.prepare("DELETE FROM collection_tags WHERE collection_id = ?")
                .map_err(|e| e.to_string())?
                .execute(params![id]).map_err(|e| e.to_string())?;
        }

        for tag_id in &tag_ids {
            db.prepare("INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)")
                .map_err(|e| e.to_string())?
                .execute(params![id, tag_id]).map_err(|e| e.to_string())?;
        }

        db.prepare("UPDATE collections SET updated_at = ? WHERE id = ?")
            .map_err(|e| e.to_string())?
            .execute(params![now, id]).map_err(|e| e.to_string())?;

        updated += 1;
    }

    Ok(serde_json::json!({ "updatedCount": updated }))
}

#[tauri::command]
pub fn toggle_favorite(id: String) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let current: i64 = db.prepare("SELECT is_favorite FROM collections WHERE id = ? AND is_deleted = 0")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let new_val = if current == 1 { 0 } else { 1 };

    db.prepare("UPDATE collections SET is_favorite = ?, updated_at = ? WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![new_val, now, id])
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "id": id, "isFavorite": new_val != 0 }))
}

#[tauri::command]
pub fn move_collection(id: String, folder_id: Option<String>) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let target_folder = folder_id.filter(|s| !s.is_empty());

    // 验证收藏项存在
    let col_exists: bool = db.prepare("SELECT COUNT(*) FROM collections WHERE id = ? AND is_deleted = 0")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if !col_exists {
        return Err("收藏项不存在".to_string());
    }

    if let Some(ref fid) = target_folder {
        let folder_exists: bool = db.prepare("SELECT COUNT(*) FROM folders WHERE id = ?")
            .map_err(|e| e.to_string())?
            .query_row(params![fid], |row| row.get::<_, i64>(0).map(|c| c > 0))
            .map_err(|e| e.to_string())?;
        if !folder_exists {
            return Err("文件夹不存在".to_string());
        }
    }

    db.prepare("UPDATE collections SET folder_id = ?, updated_at = ? WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![target_folder, now, id])
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "id": id, "folderId": target_folder }))
}

#[tauri::command]
pub fn toggle_archive(id: String) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let current: i64 = db.prepare("SELECT is_archived FROM collections WHERE id = ? AND is_deleted = 0")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let new_val = if current == 1 { 0 } else { 1 };

    db.prepare("UPDATE collections SET is_archived = ?, updated_at = ? WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![new_val, now, id])
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "id": id, "isArchived": new_val != 0 }))
}

#[tauri::command]
pub fn increment_read_count(id: String) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // 验证收藏项存在
    let exists: bool = db.prepare("SELECT COUNT(*) FROM collections WHERE id = ? AND is_deleted = 0")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("收藏项不存在".to_string());
    }

    db.prepare("UPDATE collections SET read_count = read_count + 1, updated_at = ? WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![now, id])
        .map_err(|e| e.to_string())?;

    let read_count: i64 = db.prepare("SELECT read_count FROM collections WHERE id = ?")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "id": id, "readCount": read_count }))
}