use crate::db::get_db;

#[tauri::command]
pub fn export_json() -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    // 查询所有文件夹
    let folders: Vec<serde_json::Value> = db.prepare(
        "SELECT id, name, parent_id, sort_order, created_at, updated_at FROM folders ORDER BY sort_order ASC, created_at ASC"
    ).map_err(|e| e.to_string())?
    .query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "parent_id": row.get::<_, Option<String>>(2)?,
            "sort_order": row.get::<_, i64>(3)?,
            "created_at": row.get::<_, String>(4)?,
            "updated_at": row.get::<_, String>(5)?,
        }))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // 查询所有标签
    let tags: Vec<serde_json::Value> = db.prepare(
        "SELECT id, name, color, created_at FROM tags ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?
    .query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "color": row.get::<_, String>(2)?,
            "created_at": row.get::<_, String>(3)?,
        }))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // 查询所有未删除的收藏项
    let collections: Vec<serde_json::Value> = db.prepare(
        "SELECT id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at \
         FROM collections WHERE is_deleted = 0 ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?
    .query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "title": row.get::<_, String>(1)?,
            "url": row.get::<_, Option<String>>(2)?,
            "type": row.get::<_, String>(3)?,
            "content": row.get::<_, Option<String>>(4)?,
            "summary": row.get::<_, Option<String>>(5)?,
            "cover_url": row.get::<_, Option<String>>(6)?,
            "folder_id": row.get::<_, Option<String>>(7)?,
            "is_favorite": row.get::<_, i64>(8)?,
            "created_at": row.get::<_, String>(9)?,
            "updated_at": row.get::<_, String>(10)?,
        }))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // 查询收藏项的标签关联
    let collection_tags: Vec<(String, String, String, String)> = db.prepare(
        "SELECT ct.collection_id, t.id, t.name, t.color FROM collection_tags ct JOIN tags t ON ct.tag_id = t.id"
    ).map_err(|e| e.to_string())?
    .query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // 构建收藏项标签映射
    let mut tag_map: std::collections::HashMap<String, Vec<serde_json::Value>> = std::collections::HashMap::new();
    for (col_id, tag_id, name, color) in &collection_tags {
        tag_map.entry(col_id.clone()).or_default().push(serde_json::json!({ "id": tag_id, "name": name, "color": color }));
    }

    // 组装带标签的收藏项数据
    let collections_with_tags: Vec<serde_json::Value> = collections.iter().map(|c| {
        let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let tags = tag_map.get(id).cloned().unwrap_or_default();
        let mut col = c.clone();
        col.as_object_mut().unwrap().insert("tags".to_string(), serde_json::Value::Array(tags));
        col
    }).collect();

    let export_data = serde_json::json!({
        "version": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "folders": folders,
        "tags": tags,
        "collections": collections_with_tags,
    });

    let filename = format!("favorites-backup-{}.json", chrono::Utc::now().format("%Y-%m-%d"));
    let json_str = serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())?;

    let app_dir = dirs::data_local_dir().ok_or("无法确定应用数据目录")?.join("favorites");
    let exports_dir = app_dir.join("exports");
    std::fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    let file_path = exports_dir.join(&filename);
    std::fs::write(&file_path, json_str).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn export_html() -> Result<(), String> {
    let db = get_db().lock().map_err(|e| e.to_string())?;

    let folders: Vec<(String, String, Option<String>)> = db.prepare(
        "SELECT id, name, parent_id FROM folders ORDER BY sort_order ASC, created_at ASC"
    ).map_err(|e| e.to_string())?
    .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?)))
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    let collections: Vec<(String, String, String, Option<String>, String)> = db.prepare(
        "SELECT id, title, url, folder_id, created_at FROM collections WHERE is_deleted = 0 AND type = 'link' ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?
    .query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, String>(4)?))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    let mut collections_by_folder: std::collections::HashMap<String, Vec<(String, String, String, String)>> = std::collections::HashMap::new();
    for (id, title, url, folder_id, created_at) in &collections {
        if let Some(fid) = folder_id {
            collections_by_folder.entry(fid.clone()).or_default().push((id.clone(), title.clone(), url.clone(), created_at.clone()));
        }
    }

    let uncategorized: Vec<(String, String, String, String)> = collections.iter()
        .filter(|(_, _, _, folder_id, _)| folder_id.is_none())
        .map(|(id, title, url, _, created_at)| (id.clone(), title.clone(), url.clone(), created_at.clone()))
        .collect();

    let folder_map: std::collections::HashMap<String, (String, String, Option<String>)> = folders.iter()
        .map(|(id, name, parent)| (id.clone(), (id.clone(), name.clone(), parent.clone())))
        .collect();

    fn to_unix_timestamp(date_str: &str) -> i64 {
        chrono::DateTime::parse_from_rfc3339(date_str)
            .map(|dt| dt.timestamp())
            .unwrap_or(0)
    }

    fn escape_html(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
    }

    fn build_folder_html(folder_id: &str, indent: usize, folders: &[(String, String, Option<String>)], collections_by_folder: &std::collections::HashMap<String, Vec<(String, String, String, String)>>, folder_map: &std::collections::HashMap<String, (String, String, Option<String>)>) -> String {
        let folder = folder_map.get(folder_id);
        if folder.is_none() { return "".to_string(); }
        let (_, name, _) = folder.unwrap();
        let pad = " ".repeat(indent);
        let mut html = format!("{}<DT><H3>{}</H3>\n", pad, escape_html(name));
        html.push_str(&format!("{}<DL><p>\n", pad));

        for (id, _, parent) in folders {
            if parent.as_deref() == Some(folder_id) {
                html.push_str(&build_folder_html(id, indent + 4, folders, collections_by_folder, folder_map));
            }
        }

        if let Some(items) = collections_by_folder.get(folder_id) {
            for (_, title, url, created_at) in items {
                let ts = to_unix_timestamp(created_at);
                html.push_str(&format!("{}    <DT><A HREF=\"{}\" ADD_DATE=\"{}\">{}</A>\n", pad, escape_html(url), ts, escape_html(title)));
            }
        }

        html.push_str(&format!("{}</DL><p>\n", pad));
        html
    }

    let mut html = "<!DOCTYPE NETSCAPE-Bookmark-file-1>\n".to_string();
    html.push_str("<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n");
    html.push_str("<TITLE>Bookmarks</TITLE>\n");
    html.push_str("<H1>Bookmarks</H1>\n");
    html.push_str("<DL><p>\n");

    for (id, _, parent) in &folders {
        if parent.is_none() {
            html.push_str(&build_folder_html(id, 4, &folders, &collections_by_folder, &folder_map));
        }
    }

    if !uncategorized.is_empty() {
        html.push_str("    <DT><H3>未分类书签</H3>\n");
        html.push_str("    <DL><p>\n");
        for (_, title, url, created_at) in &uncategorized {
            let ts = to_unix_timestamp(created_at);
            html.push_str(&format!("        <DT><A HREF=\"{}\" ADD_DATE=\"{}\">{}</A>\n", escape_html(url), ts, escape_html(title)));
        }
        html.push_str("    </DL><p>\n");
    }

    html.push_str("</DL><p>\n");

    let filename = format!("bookmarks-{}.html", chrono::Utc::now().format("%Y-%m-%d"));
    let app_dir = dirs::data_local_dir().ok_or("无法确定应用数据目录")?.join("favorites");
    let exports_dir = app_dir.join("exports");
    std::fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    let file_path = exports_dir.join(&filename);
    std::fs::write(&file_path, html).map_err(|e| e.to_string())?;

    Ok(())
}