use crate::db::{models::ImportResult, get_db};
use rusqlite::params;
use uuid::Uuid;
use chrono::Utc;

#[tauri::command]
pub fn import_json(_file_name: String, file_data: Vec<u8>) -> Result<ImportResult, String> {
    let raw = String::from_utf8(file_data).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("JSON 文件格式错误: {}", e))?;

    let db = get_db().lock().map_err(|e| e.to_string())?;
    let mut result = ImportResult { folders_created: 0, tags_created: 0, collections_created: 0, collections_skipped: 0 };
    let now = Utc::now().to_rfc3339();

    // 导入文件夹
    if let Some(folders) = data.get("folders").and_then(|f| f.as_array()) {
        for folder in folders {
            let name = folder.get("name").and_then(|n| n.as_str()).unwrap_or("").trim();
            if name.is_empty() { continue; }

            let exists: bool = db.prepare("SELECT COUNT(*) FROM folders WHERE name = ?")
                .map_err(|e| e.to_string())?
                .query_row(params![name], |row| row.get::<_, i64>(0).map(|c| c > 0))
                .map_err(|e| e.to_string())?;

            if !exists {
                let id = Uuid::new_v4().to_string();
                let parent_id = folder.get("parent_id").and_then(|p| p.as_str());
                let sort_order = folder.get("sort_order").and_then(|s| s.as_i64()).unwrap_or(0);

                db.prepare("INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
                    .map_err(|e| e.to_string())?
                    .execute(params![id, name, parent_id, sort_order, now, now])
                    .map_err(|e| e.to_string())?;
                result.folders_created += 1;
            }
        }
    }

    // 导入标签
    if let Some(tags) = data.get("tags").and_then(|t| t.as_array()) {
        for tag in tags {
            let name = tag.get("name").and_then(|n| n.as_str()).unwrap_or("").trim();
            if name.is_empty() { continue; }

            let exists: bool = db.prepare("SELECT COUNT(*) FROM tags WHERE name = ?")
                .map_err(|e| e.to_string())?
                .query_row(params![name], |row| row.get::<_, i64>(0).map(|c| c > 0))
                .map_err(|e| e.to_string())?;

            if !exists {
                let id = Uuid::new_v4().to_string();
                let color = tag.get("color").and_then(|c| c.as_str()).unwrap_or("#6366f1");

                db.prepare("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)")
                    .map_err(|e| e.to_string())?
                    .execute(params![id, name, color, now])
                    .map_err(|e| e.to_string())?;
                result.tags_created += 1;
            }
        }
    }

    // 导入收藏项
    if let Some(collections) = data.get("collections").and_then(|c| c.as_array()) {
        for col in collections {
            let title = col.get("title").and_then(|t| t.as_str()).unwrap_or("").trim();
            if title.is_empty() { continue; }

            let url = col.get("url").and_then(|u| u.as_str());

            // 按 URL 去重
            if let Some(url_str) = url {
                let exists: bool = db.prepare("SELECT COUNT(*) FROM collections WHERE url = ? AND is_deleted = 0")
                    .map_err(|e| e.to_string())?
                    .query_row(params![url_str], |row| row.get::<_, i64>(0).map(|c| c > 0))
                    .map_err(|e| e.to_string())?;
                if exists {
                    result.collections_skipped += 1;
                    continue;
                }
            }

            let id = Uuid::new_v4().to_string();
            let rtype = col.get("type").and_then(|t| t.as_str()).unwrap_or("link");
            let content = col.get("content").and_then(|c| c.as_str());
            let summary = col.get("summary").and_then(|s| s.as_str());
            let cover_url = col.get("cover_url").and_then(|c| c.as_str());
            let folder_id = col.get("folder_id").and_then(|f| f.as_str());
            let is_favorite = col.get("is_favorite").and_then(|f| f.as_i64()).unwrap_or(0);

            db.prepare(
                "INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, is_archived, read_count, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).map_err(|e| e.to_string())?
            .execute(params![id, title, url, rtype, content, summary, cover_url, folder_id, is_favorite, 0, 0, now, now])
            .map_err(|e| e.to_string())?;

            // 关联标签
            if let Some(tags) = col.get("tags").and_then(|t| t.as_array()) {
                for tag in tags {
                    let tag_name = tag.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    if tag_name.is_empty() { continue; }

                    let tag_id: Option<String> = db.prepare("SELECT id FROM tags WHERE name = ?")
                        .map_err(|e| e.to_string())?
                        .query_row(params![tag_name], |row| row.get::<_, String>(0))
                        .ok();

                    if let Some(tid) = tag_id {
                        db.prepare("INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)")
                            .map_err(|e| e.to_string())?
                            .execute(params![id, tid]).map_err(|e| e.to_string())?;
                    }
                }
            }

            result.collections_created += 1;
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn import_html(_file_name: String, file_data: Vec<u8>) -> Result<ImportResult, String> {
    let html = String::from_utf8(file_data).map_err(|e| e.to_string())?;
    let db = get_db().lock().map_err(|e| e.to_string())?;
    let mut result = ImportResult { folders_created: 0, tags_created: 0, collections_created: 0, collections_skipped: 0 };
    let now = Utc::now().to_rfc3339();

    let document = scraper::Html::parse_document(&html);

    // 解析书签文件夹结构
    import_bookmark_folders(&db, &document, None, &mut result, &now);

    Ok(result)
}

struct BookmarkFolder {
    name: String,
    bookmarks: Vec<(String, String)>, // (title, url)
    children: Vec<BookmarkFolder>,
}

fn parse_bookmark_dl(document: &scraper::Html, dl_element: &scraper::ElementRef, _parent_id: Option<&str>) -> Vec<BookmarkFolder> {
    let mut folders = Vec::new();

    let dt_sel = scraper::Selector::parse("dt").unwrap();
    let h3_sel = scraper::Selector::parse("h3").unwrap();
    let a_sel = scraper::Selector::parse("a").unwrap();
    let dl_sel = scraper::Selector::parse("dl").unwrap();

    for dt in dl_element.select(&dt_sel) {
        if let Some(h3) = dt.select(&h3_sel).next() {
            let folder_name = h3.text().collect::<String>().trim().to_string();
            if folder_name.is_empty() { continue; }

            let sub_dl = dt.select(&dl_sel).next();

            let mut folder = BookmarkFolder {
                name: folder_name,
                bookmarks: Vec::new(),
                children: Vec::new(),
            };

            // 提取书签链接
            if let Some(sub_dl_el) = sub_dl {
                for sub_dt in sub_dl_el.select(&dt_sel) {
                    if let Some(a) = sub_dt.select(&a_sel).next() {
                        let href = a.value().attr("href").unwrap_or("").to_string();
                        let title = a.text().collect::<String>().trim().to_string();
                        if !href.is_empty() && !title.is_empty() {
                            folder.bookmarks.push((title, href));
                        }
                    }
                }

                // 递归解析子文件夹
                folder.children = parse_bookmark_dl(document, &sub_dl_el, None);
            }

            folders.push(folder);
        }
    }

    folders
}

fn import_bookmark_folders(db: &rusqlite::Connection, document: &scraper::Html, parent_id: Option<&str>, result: &mut ImportResult, now: &str) {
    let dl_sel = scraper::Selector::parse("dl").unwrap();
    let root_dl = document.select(&dl_sel).next();

    if let Some(dl) = root_dl {
        let bookmark_folders = parse_bookmark_dl(document, &dl, parent_id);
        import_folders_recursive(db, &bookmark_folders, parent_id, result, now);
    }
}

fn import_folders_recursive(db: &rusqlite::Connection, folders: &[BookmarkFolder], parent_id: Option<&str>, result: &mut ImportResult, now: &str) {
    for folder in folders {
        // 按名称查找或创建文件夹
        let existing_id: Option<String> = db.prepare("SELECT id FROM folders WHERE name = ?")
            .ok()
            .and_then(|mut stmt| stmt.query_row(rusqlite::params![folder.name], |row| row.get::<_, String>(0)).ok());

        let folder_id = existing_id.unwrap_or_else(|| {
            let id = Uuid::new_v4().to_string();
            db.prepare("INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
                .map_err(|e| e.to_string()).unwrap();
            // 简化：直接执行
            let _ = db.execute("INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
                rusqlite::params![id, folder.name, parent_id, now, now]);
            result.folders_created += 1;
            id
        });

        // 导入书签
        for (title, url) in &folder.bookmarks {
            let exists: bool = db.prepare("SELECT COUNT(*) FROM collections WHERE url = ? AND is_deleted = 0")
                .ok()
                .and_then(|mut stmt| stmt.query_row(rusqlite::params![url], |row| row.get::<_, i64>(0)).ok())
                .map(|c| c > 0)
                .unwrap_or(false);

            if exists {
                result.collections_skipped += 1;
                continue;
            }

            let id = Uuid::new_v4().to_string();
            let _ = db.execute(
                "INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, is_archived, read_count, created_at, updated_at) \
                 VALUES (?, ?, ?, 'link', NULL, NULL, NULL, ?, 0, 0, 0, ?, ?)",
                rusqlite::params![id, title, url, folder_id, now, now]
            );
            result.collections_created += 1;
        }

        // 递归处理子文件夹
        import_folders_recursive(db, &folder.children, Some(&folder_id), result, now);
    }
}