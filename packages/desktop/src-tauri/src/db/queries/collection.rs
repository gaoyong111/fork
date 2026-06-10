use crate::db::models::*;
use rusqlite::{Connection, Result as SqliteResult};

pub const COLLECTION_SELECT_FIELDS: &str =
    "id, title, url, type, content, content_brief, content_detailed, summary_mode, raw_content, summary, cover_url, file_path, folder_id, is_favorite, is_archived, read_count, created_at, updated_at";

pub fn collection_from_row(row: &rusqlite::Row<'_>) -> SqliteResult<Collection> {
    Ok(Collection {
        id: row.get(0)?,
        title: row.get(1)?,
        url: row.get(2)?,
        rtype: row.get(3)?,
        content: row.get(4)?,
        content_brief: row.get(5)?,
        content_detailed: row.get(6)?,
        summary_mode: row.get(7)?,
        raw_content: row.get(8)?,
        summary: row.get(9)?,
        cover_url: row.get(10)?,
        file_path: row.get(11)?,
        folder_id: row.get(12)?,
        is_favorite: row.get::<_, i64>(13)? != 0,
        is_archived: row.get::<_, i64>(14)? != 0,
        read_count: row.get::<_, i64>(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
        tags: vec![],
        folder: None,
    })
}

pub fn batch_load_tags(db: &Connection, collections: &[Collection]) -> SqliteResult<Vec<Collection>> {
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

    let mut stmt = db.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    let tag_rows: Vec<(String, Tag)> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                Tag {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                    collection_count: None,
                    created_at: row.get(4)?,
                },
            ))
        })?
        .collect::<SqliteResult<Vec<_>>>()?;

    let mut tag_map: std::collections::HashMap<String, Vec<Tag>> = std::collections::HashMap::new();
    for (col_id, tag) in tag_rows {
        tag_map.entry(col_id).or_default().push(tag);
    }

    Ok(collections
        .iter()
        .map(|c| {
            let mut col = c.clone();
            col.tags = tag_map.get(&c.id).cloned().unwrap_or_default();
            col
        })
        .collect())
}

pub fn batch_load_folder_brief(db: &Connection, collections: &[Collection]) -> SqliteResult<Vec<Collection>> {
    let folder_ids: Vec<String> = collections.iter().filter_map(|c| c.folder_id.clone()).collect();

    if folder_ids.is_empty() {
        return Ok(collections.to_vec());
    }

    let placeholders = folder_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT id, name FROM folders WHERE id IN ({})", placeholders);

    let mut stmt = db.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::types::ToSql> = folder_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    let folder_map: std::collections::HashMap<String, FolderBrief> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            Ok(FolderBrief {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<SqliteResult<Vec<FolderBrief>>>()?
        .into_iter()
        .map(|f| (f.id.clone(), f))
        .collect();

    Ok(collections
        .iter()
        .map(|c| {
            let mut col = c.clone();
            if let Some(ref fid) = c.folder_id {
                col.folder = folder_map.get(fid).cloned();
            }
            col
        })
        .collect())
}
