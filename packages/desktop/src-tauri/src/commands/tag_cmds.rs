use crate::db::{models::*, get_db};
use rusqlite::params;
use uuid::Uuid;
use chrono::Utc;

#[tauri::command]
pub fn get_tags() -> Result<Vec<Tag>, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT t.id, t.name, t.color, \
         (SELECT COUNT(*) FROM collection_tags ct JOIN collections c ON ct.collection_id = c.id WHERE ct.tag_id = t.id AND c.is_deleted = 0) as collection_count, \
         t.created_at \
         FROM tags t ORDER BY collection_count DESC, t.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let tags = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            collection_count: Some(row.get(3)?),
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<Tag>, _>>().map_err(|e| e.to_string())?;

    Ok(tags)
}

#[tauri::command]
pub fn create_tag(data: CreateTagParams) -> Result<Tag, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let color = data.color.unwrap_or("#6366f1".to_string());

    let exists: bool = db.prepare("SELECT COUNT(*) FROM tags WHERE name = ?")
        .map_err(|e| e.to_string())?
        .query_row(params![data.name], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if exists {
        return Err("标签名称已存在".to_string());
    }

    db.prepare("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)")
        .map_err(|e| e.to_string())?
        .execute(params![id, data.name, color, now])
        .map_err(|e| e.to_string())?;

    Ok(Tag { id, name: data.name, color, collection_count: Some(0), created_at: now })
}

#[tauri::command]
pub fn update_tag(id: String, data: UpdateTagParams) -> Result<Tag, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    let exists: bool = db.prepare("SELECT COUNT(*) FROM tags WHERE id = ?")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("标签不存在".to_string());
    }

    if let Some(ref name) = data.name {
        let name_exists: bool = db.prepare("SELECT COUNT(*) FROM tags WHERE name = ? AND id != ?")
            .map_err(|e| e.to_string())?
            .query_row(params![name, id], |row| row.get::<_, i64>(0).map(|c| c > 0))
            .map_err(|e| e.to_string())?;
        if name_exists {
            return Err("标签名称已存在".to_string());
        }
    }

    let mut updates = vec![];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(ref name) = data.name {
        updates.push("name = ?".to_string());
        param_values.push(Box::new(name.clone()));
    }
    if let Some(ref color) = data.color {
        updates.push("color = ?".to_string());
        param_values.push(Box::new(color.clone()));
    }

    if !updates.is_empty() {
        let update_sql = format!("UPDATE tags SET {} WHERE id = ?", updates.join(", "));
        param_values.push(Box::new(id.clone()));
        db.prepare(&update_sql).map_err(|e| e.to_string())?
            .execute(rusqlite::params_from_iter(param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql)))
            .map_err(|e| e.to_string())?;
    }

    let mut stmt = db.prepare(
        "SELECT t.id, t.name, t.color, \
         (SELECT COUNT(*) FROM collection_tags ct JOIN collections c ON ct.collection_id = c.id WHERE ct.tag_id = t.id AND c.is_deleted = 0) as collection_count, \
         t.created_at \
         FROM tags t WHERE t.id = ?"
    ).map_err(|e| e.to_string())?;

    let tag = stmt.query_row(params![id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            collection_count: Some(row.get(3)?),
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(tag)
}

#[tauri::command]
pub fn delete_tag(id: String) -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    let exists: bool = db.prepare("SELECT COUNT(*) FROM tags WHERE id = ?")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("标签不存在".to_string());
    }

    db.prepare("DELETE FROM tags WHERE id = ?")
        .map_err(|e| e.to_string())?
        .execute(params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}