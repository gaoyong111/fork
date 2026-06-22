import type Database from 'better-sqlite3';

/**
 * 递归获取某文件夹的所有后代 ID（不含自身）
 */
export function getAllDescendantFolderIds(db: Database.Database, parentId: string): string[] {
    const children = db.prepare(
        'SELECT id FROM folders WHERE parent_id = ?',
    ).all(parentId) as { id: string }[];

    const ids: string[] = [];
    for (const child of children) {
        ids.push(child.id);
        ids.push(...getAllDescendantFolderIds(db, child.id));
    }
    return ids;
}

/**
 * 获取文件夹筛选范围：自身 + 所有子文件夹
 */
export function getFolderScopeIds(db: Database.Database, folderId: string): string[] {
    return [folderId, ...getAllDescendantFolderIds(db, folderId)];
}

/**
 * 构建 collections.folder_id IN (...) 条件
 */
export function buildFolderScopeCondition(
    db: Database.Database,
    folderId: string,
    column = 'c.folder_id',
): { sql: string; params: string[] } {
    const ids = getFolderScopeIds(db, folderId);
    const placeholders = ids.map(() => '?').join(', ');
    return { sql: `${column} IN (${placeholders})`, params: ids };
}
