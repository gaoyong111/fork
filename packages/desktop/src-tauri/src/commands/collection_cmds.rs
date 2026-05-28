use crate::db::{models::*, get_db};
use rusqlite::params;
use uuid::Uuid;
use chrono::Utc;

/**
 * 读取单个收藏项（不加锁版本，供已持有锁的函数内部调用）
 * 与 get_collection_by_id 逻辑相同，但接受 &Connection 参数避免二次加锁死锁
 */
fn read_collection_by_id(db: &rusqlite::Connection, id: &str) -> Result<Collection, String> {
    let mut col = db.prepare(
        "SELECT id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at \
         FROM collections WHERE id = ? AND is_deleted = 0"
    ).map_err(|e| e.to_string())?
    .query_row(params![id], |row| {
        Ok(Collection {
            id: row.get(0)?,
            title: row.get(1)?,
            url: row.get(2)?,
            rtype: row.get(3)?,
            content: row.get(4)?,
            summary: row.get(5)?,
            cover_url: row.get(6)?,
            folder_id: row.get(7)?,
            is_favorite: row.get::<_, i64>(8)? != 0,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            file_path: None,
            tags: vec![],
            folder: None,
        })
    }).map_err(|e| e.to_string())?;

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
        conditions.push("folder_id = ?".to_string());
        param_values.push(Box::new(folder_id.clone()));
    }
    if let Some(ref tag_id) = p.tag_id {
        conditions.push("id IN (SELECT collection_id FROM collection_tags WHERE tag_id = ?)".to_string());
        param_values.push(Box::new(tag_id.clone()));
    }
    if let Some(is_favorite) = p.is_favorite {
        conditions.push("is_favorite = ?".to_string());
        param_values.push(Box::new(if is_favorite { 1 } else { 0 }));
    }
    if let Some(ref keyword) = p.keyword {
        conditions.push("(title LIKE ? OR content LIKE ? OR summary LIKE ?)".to_string());
        let kw = format!("%{}%", keyword);
        param_values.push(Box::new(kw.clone()));
        param_values.push(Box::new(kw.clone()));
        param_values.push(Box::new(kw));
    }

    let where_clause = conditions.join(" AND ");

    // 排序
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

    // 计数
    let count_sql = format!("SELECT COUNT(*) as total FROM collections WHERE {}", where_clause);
    let total: i64 = db.prepare(&count_sql)
        .map_err(|e| e.to_string())?
        .query_row(rusqlite::params_from_iter(param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql)), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // 查询列表
    let list_sql = format!(
        "SELECT id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at \
         FROM collections WHERE {} ORDER BY {} {} LIMIT ? OFFSET ?",
        where_clause, sort_by, sort_order
    );

    let mut stmt = db.prepare(&list_sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .chain(std::iter::once(&limit as &dyn rusqlite::types::ToSql))
        .chain(std::iter::once(&offset as &dyn rusqlite::types::ToSql))
        .collect();

    let collections = stmt.query_map(rusqlite::params_from_iter(param_refs.iter()), |row| {
        Ok(Collection {
            id: row.get(0)?,
            title: row.get(1)?,
            url: row.get(2)?,
            rtype: row.get(3)?,
            content: row.get(4)?,
            summary: row.get(5)?,
            cover_url: row.get(6)?,
            folder_id: row.get(7)?,
            is_favorite: row.get::<_, i64>(8)? != 0,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            file_path: None,
            tags: vec![],
            folder: None,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<Collection>, _>>().map_err(|e| e.to_string())?;

    // 批量获取标签
    let items_with_tags = batch_load_tags(&db, &collections)?;

    // 获取文件夹信息
    let items_with_folder = batch_load_folder_brief(&db, &items_with_tags)?;

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

pub fn batch_load_tags(db: &rusqlite::Connection, collections: &[Collection]) -> Result<Vec<Collection>, String> {
    if collections.is_empty() {
        return Ok(collections.to_vec());
    }

    let ids: Vec<&str> = collections.iter().map(|c| c.id.as_str()).collect();
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT ct.collection_id, t.id, t.name, t.color, t.created_at \
         FROM collection_tags ct JOIN tags t ON ct.tag_id = t.id \
         WHERE ct.collection_id IN ({})",
        placeholders
    );

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    // 构建 collection_id -> tags 映射
    let tag_rows: Vec<(String, Tag)> = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok((
            row.get::<_, String>(0)?,
            Tag {
                id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                collection_count: None,
                created_at: row.get(4)?,
            }
        ))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    let mut tag_map: std::collections::HashMap<String, Vec<Tag>> = std::collections::HashMap::new();
    for (col_id, tag) in tag_rows {
        tag_map.entry(col_id).or_default().push(tag);
    }

    Ok(collections.iter().map(|c| {
        let mut col = c.clone();
        col.tags = tag_map.get(&c.id).cloned().unwrap_or_default();
        col
    }).collect())
}

pub fn batch_load_folder_brief(db: &rusqlite::Connection, collections: &[Collection]) -> Result<Vec<Collection>, String> {
    let folder_ids: Vec<String> = collections.iter()
        .filter_map(|c| c.folder_id.clone())
        .collect();

    if folder_ids.is_empty() {
        return Ok(collections.to_vec());
    }

    let placeholders = folder_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT id, name FROM folders WHERE id IN ({})", placeholders);

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<&dyn rusqlite::types::ToSql> = folder_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    let folder_map: std::collections::HashMap<String, FolderBrief> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            Ok(FolderBrief { id: row.get(0)?, name: row.get(1)? })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<FolderBrief>, _>>().map_err(|e| e.to_string())?
        .into_iter()
        .map(|f| (f.id.clone(), f))
        .collect();

    Ok(collections.iter().map(|c| {
        let mut col = c.clone();
        if let Some(ref fid) = c.folder_id {
            col.folder = folder_map.get(fid).cloned();
        }
        col
    }).collect())
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
pub fn move_collection(id: String, folder_id: String) -> Result<serde_json::Value, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    // 验证收藏项存在
    let col_exists: bool = db.prepare("SELECT COUNT(*) FROM collections WHERE id = ? AND is_deleted = 0")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if !col_exists {
        return Err("收藏项不存在".to_string());
    }

    // 验证文件夹存在
    let folder_exists: bool = db.prepare("SELECT COUNT(*) FROM folders WHERE id = ?")
        .map_err(|e| e.to_string())?
        .query_row(params![folder_id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if !folder_exists {
        return Err("文件夹不存在".to_string());
    }

    db.prepare("UPDATE collections SET folder_id = ?, updated_at = ? WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![folder_id, now, id])
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "id": id, "folderId": folder_id }))
}