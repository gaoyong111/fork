use crate::db::{models::*, get_db};
use crate::db::queries::folder::get_folder_scope_ids;
use rusqlite::params;
use uuid::Uuid;
use chrono::Utc;

fn build_folder_tree(folders: &mut Vec<Folder>) -> Vec<Folder> {
    let mut folder_map: std::collections::HashMap<String, Vec<usize>> = std::collections::HashMap::new();

    for (i, f) in folders.iter().enumerate() {
        let parent = f.parent_id.clone().unwrap_or_default();
        folder_map.entry(parent).or_default().push(i);
    }

    let root_indices: Vec<usize> = folders.iter().enumerate()
        .filter(|(_, f)| f.parent_id.is_none())
        .map(|(i, _)| i)
        .collect();

    let mut root_folders: Vec<Folder> = Vec::new();
    for idx in root_indices {
        let mut folder = folders[idx].clone();
        folder.children = Some(build_children(&folder.id, folders, &folder_map));
        root_folders.push(folder);
    }

    root_folders
}

fn build_children(parent_id: &str, folders: &[Folder], folder_map: &std::collections::HashMap<String, Vec<usize>>) -> Vec<Folder> {
    let indices = folder_map.get(parent_id).cloned().unwrap_or_default();
    indices.iter().map(|idx| {
        let mut folder = folders[*idx].clone();
        folder.children = Some(build_children(&folder.id, folders, folder_map));
        folder
    }).collect()
}

#[tauri::command]
pub fn get_folder_tree() -> Result<Vec<Folder>, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT f.id, f.name, f.parent_id, f.sort_order, \
         (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id AND c.is_deleted = 0) as collection_count, \
         f.created_at, f.updated_at \
         FROM folders f ORDER BY f.sort_order ASC, f.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let mut folders: Vec<Folder> = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            sort_order: row.get(3)?,
            collection_count: Some(row.get(4)?),
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            children: None,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<Folder>, _>>().map_err(|e| e.to_string())?;

    Ok(build_folder_tree(&mut folders))
}

#[tauri::command]
pub fn create_folder(data: CreateFolderParams) -> Result<Folder, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    db.prepare(
        "INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)"
    ).map_err(|e| e.to_string())?
    .execute(params![id, data.name, data.parent_id, now, now])
    .map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, name, parent_id, sort_order, \
         (SELECT COUNT(*) FROM collections c WHERE c.folder_id = ? AND c.is_deleted = 0) as collection_count, \
         created_at, updated_at \
         FROM folders WHERE id = ?"
    ).map_err(|e| e.to_string())?;

    let folder = stmt.query_row(params![id, id], |row| {
        Ok(Folder {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            sort_order: row.get(3)?,
            collection_count: Some(row.get(4)?),
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            children: None,
        })
    }).map_err(|e| e.to_string())?;

    Ok(folder)
}

#[tauri::command]
pub fn update_folder(id: String, data: UpdateFolderParams) -> Result<Folder, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let exists: bool = db.prepare("SELECT COUNT(*) FROM folders WHERE id = ?")
        .map_err(|e| e.to_string())?
        .query_row(params![id], |row| row.get::<_, i64>(0).map(|c| c > 0))
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("文件夹不存在".to_string());
    }

    let mut updates = vec!["updated_at = ?".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];

    if let Some(ref name) = data.name {
        updates.push("name = ?".to_string());
        param_values.push(Box::new(name.clone()));
    }
    if let Some(ref parent_id) = data.parent_id {
        updates.push("parent_id = ?".to_string());
        param_values.push(Box::new(parent_id.clone()));
    }
    if let Some(sort_order) = data.sort_order {
        updates.push("sort_order = ?".to_string());
        param_values.push(Box::new(sort_order));
    }

    let update_sql = format!("UPDATE folders SET {} WHERE id = ?", updates.join(", "));
    param_values.push(Box::new(id.clone()));

    db.prepare(&update_sql).map_err(|e| e.to_string())?
        .execute(rusqlite::params_from_iter(param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql)))
        .map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, name, parent_id, sort_order, \
         (SELECT COUNT(*) FROM collections c WHERE c.folder_id = ? AND c.is_deleted = 0) as collection_count, \
         created_at, updated_at \
         FROM folders WHERE id = ?"
    ).map_err(|e| e.to_string())?;

    let folder = stmt.query_row(params![id, id], |row| {
        Ok(Folder {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            sort_order: row.get(3)?,
            collection_count: Some(row.get(4)?),
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            children: None,
        })
    }).map_err(|e| e.to_string())?;

    Ok(folder)
}

#[tauri::command]
pub fn delete_folder(id: String) -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    let all_ids = get_folder_scope_ids(&db, &id).map_err(|e| e.to_string())?;
    let ids_str = all_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    db.prepare(&format!("UPDATE collections SET folder_id = NULL WHERE folder_id IN ({})", ids_str))
        .map_err(|e| e.to_string())?
        .execute(rusqlite::params_from_iter(all_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql)))
        .map_err(|e| e.to_string())?;

    db.prepare(&format!("DELETE FROM folders WHERE id IN ({})", ids_str))
        .map_err(|e| e.to_string())?
        .execute(rusqlite::params_from_iter(all_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql)))
        .map_err(|e| e.to_string())?;

    Ok(())
}
