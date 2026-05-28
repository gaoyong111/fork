use crate::db::{models::*, get_db};
use crate::commands::collection_cmds::{batch_load_tags};
use rusqlite::params;

#[tauri::command]
pub fn get_trash_collections(params: Option<TrashParams>) -> Result<PaginatedData<Collection>, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let p = params.unwrap_or_default();
    let page = p.page.unwrap_or(1).max(1);
    let limit = p.page_size.unwrap_or(20).min(100).max(1);
    let offset = (page - 1) * limit;

    let total: i64 = db.prepare("SELECT COUNT(*) FROM collections WHERE is_deleted = 1")
        .map_err(|e| e.to_string())?
        .query_row([], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let collections: Vec<Collection> = db.prepare(
        "SELECT id, title, url, type, content, summary, cover_url, folder_id, is_favorite, is_archived, read_count, created_at, updated_at \
         FROM collections WHERE is_deleted = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    ).map_err(|e| e.to_string())?
    .query_map(params![limit, offset], |row| {
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
            is_archived: row.get::<_, i64>(9)? != 0,
            read_count: row.get::<_, i64>(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            file_path: None,
            tags: vec![],
            folder: None,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<Collection>, _>>().map_err(|e| e.to_string())?;

    let items = batch_load_tags(&db, &collections)?;

    Ok(PaginatedData {
        items,
        pagination: Pagination { page, page_size: limit, total, total_pages: (total + limit - 1) / limit },
    })
}

#[tauri::command]
pub fn restore_collection(id: String) -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    db.prepare("UPDATE collections SET is_deleted = 0, updated_at = ? WHERE id = ? AND is_deleted = 1")
        .map_err(|e| e.to_string())?
        .execute(params![chrono::Utc::now().to_rfc3339(), id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_all_collections() -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    db.prepare("UPDATE collections SET is_deleted = 0, updated_at = ? WHERE is_deleted = 1")
        .map_err(|e| e.to_string())?
        .execute(params![chrono::Utc::now().to_rfc3339()])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn permanent_delete_collection(id: String) -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;

    // 验证是已删除状态
    let is_deleted: bool = tx.prepare("SELECT is_deleted FROM collections WHERE id = ?")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|v| v != 0))
        .map_err(|_| "收藏项不存在".to_string())?;
    if !is_deleted {
        return Err("收藏项不在回收站中".to_string());
    }

    tx.prepare("DELETE FROM collection_tags WHERE collection_id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![id]).map_err(|e| e.to_string())?;
    tx.prepare("DELETE FROM collections WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![id]).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn empty_trash() -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.prepare("DELETE FROM collection_tags WHERE collection_id IN (SELECT id FROM collections WHERE is_deleted = 1)")
        .map_err(|e| e.to_string())?
        .execute([]).map_err(|e| e.to_string())?;
    tx.prepare("DELETE FROM collections WHERE is_deleted = 1")
        .map_err(|e| e.to_string())?
        .execute([]).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}