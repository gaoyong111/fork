use rusqlite::{params, Connection};

/**
 * 获取文件夹筛选范围：自身 + 所有子文件夹 ID
 */
pub fn get_folder_scope_ids(db: &Connection, folder_id: &str) -> Result<Vec<String>, rusqlite::Error> {
    let mut all_ids = vec![folder_id.to_string()];
    let mut to_process = vec![folder_id.to_string()];

    while let Some(current) = to_process.pop() {
        let mut stmt = db.prepare("SELECT id FROM folders WHERE parent_id = ?")?;
        let children: Vec<String> = stmt
            .query_map(params![current], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        for child in children {
            all_ids.push(child.clone());
            to_process.push(child);
        }
    }

    Ok(all_ids)
}
