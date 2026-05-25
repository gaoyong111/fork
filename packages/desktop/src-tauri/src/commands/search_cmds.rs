use crate::db::{models::*, get_db};
use crate::commands::collection_cmds::{batch_load_tags, batch_load_folder_brief};
use rusqlite::params;

/// 转义 FTS5 特殊字符并包装为安全 MATCH 查询
fn escape_fts_query(query: &str) -> String {
    let special_chars = ['"', '*', '(', ')', '{', '}', ':', '+', '~', '^', '/', '\\'];
    let cleaned = query.chars()
        .filter(|c| !special_chars.contains(c) && !c.is_whitespace())
        .collect::<String>();

    if cleaned.is_empty() {
        return "".to_string();
    }

    cleaned.split_whitespace()
        .map(|word| format!("\"{}\"", word))
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn search_collections(params: SearchParams) -> Result<PaginatedData<SearchResultItem>, String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let page = params.page.unwrap_or(1).max(1);
    let limit = params.page_size.unwrap_or(20).min(100).max(1);
    let offset = (page - 1) * limit;

    let fts_query = escape_fts_query(&params.q);
    if fts_query.is_empty() {
        return Ok(PaginatedData {
            items: vec![],
            pagination: Pagination { page, page_size: limit, total: 0, total_pages: 0 },
        });
    }

    // Step 1: FTS5 搜索获取 rowid 和 snippet
    let fts_results: Vec<(i64, Option<String>)> = db.prepare(
        "SELECT rowid, snippet(collections_fts, -1, '<mark>', '</mark>', '...', 32) as match_snippet FROM collections_fts WHERE collections_fts MATCH ?"
    ).map_err(|e| e.to_string())?
    .query_map(params![fts_query], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    if fts_results.is_empty() {
        return Ok(PaginatedData {
            items: vec![],
            pagination: Pagination { page, page_size: limit, total: 0, total_pages: 0 },
        });
    }

    // 构建 rowid -> snippet 映射
    let snippet_map: std::collections::HashMap<i64, Option<String>> = fts_results.iter()
        .map(|(rid, snip)| (*rid, snip.clone()))
        .collect();

    let rowids: Vec<i64> = fts_results.iter().map(|(rid, _)| *rid).collect();
    let rowid_placeholders = rowids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    // Step 2: 构建 WHERE 条件
    let mut conditions = vec!["is_deleted = 0".to_string()];
    if let Some(ref rtype) = params.rtype {
        conditions.push(format!("type = '{}'", rtype));
    }
    if let Some(ref folder_id) = params.folder_id {
        conditions.push(format!("folder_id = '{}'", folder_id));
    }
    if let Some(ref tag_id) = params.tag_id {
        conditions.push(format!("id IN (SELECT collection_id FROM collection_tags WHERE tag_id = '{}'", tag_id));
    }

    let where_clause = conditions.join(" AND ");

    // Step 3: 计数
    let count_sql = format!(
        "SELECT COUNT(*) FROM collections WHERE rowid IN ({}) AND {}",
        rowid_placeholders, where_clause
    );
    let total: i64 = db.prepare(&count_sql).map_err(|e| e.to_string())?
        .query_row(rusqlite::params_from_iter(rowids.iter().map(|rid| rid as &dyn rusqlite::types::ToSql)), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Step 4: 查询列表
    let list_sql = format!(
        "SELECT id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at \
         FROM collections WHERE rowid IN ({}) AND {} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        rowid_placeholders, where_clause
    );

    let list_param_refs: Vec<&dyn rusqlite::types::ToSql> = rowids.iter()
        .map(|rid| rid as &dyn rusqlite::types::ToSql)
        .chain(std::iter::once(&limit as &dyn rusqlite::types::ToSql))
        .chain(std::iter::once(&offset as &dyn rusqlite::types::ToSql))
        .collect();

    let collections: Vec<Collection> = db.prepare(&list_sql).map_err(|e| e.to_string())?
        .query_map(rusqlite::params_from_iter(list_param_refs.iter()), |row| {
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

    // 批量获取标签和文件夹信息
    let with_tags = batch_load_tags(&db, &collections)?;
    let with_folder = batch_load_folder_brief(&db, &with_tags)?;

    // 转换为 SearchResultItem，附带 snippet
    let items: Vec<SearchResultItem> = with_folder.iter().map(|c| {
        let rowid: i64 = db.prepare("SELECT rowid FROM collections WHERE id = ?")
            .ok()
            .and_then(|mut stmt| stmt.query_row(params![c.id], |row| row.get::<_, i64>(0)).ok())
            .unwrap_or(0);

        let snippet = snippet_map.get(&rowid).cloned().flatten();

        SearchResultItem {
            id: c.id.clone(),
            title: c.title.clone(),
            summary: c.summary.clone(),
            rtype: c.rtype.clone(),
            url: c.url.clone(),
            cover_url: c.cover_url.clone(),
            folder_id: c.folder_id.clone(),
            is_favorite: c.is_favorite,
            created_at: c.created_at.clone(),
            tags: c.tags.clone(),
            match_snippet: snippet,
        }
    }).collect();

    Ok(PaginatedData {
        items,
        pagination: Pagination { page, page_size: limit, total, total_pages: (total + limit - 1) / limit },
    })
}