-- 收藏项表
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT,
    type TEXT NOT NULL DEFAULT 'link',
    content TEXT,
    summary TEXT,
    cover_url TEXT,
    folder_id TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    read_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

-- 文件夹表
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 收藏项标签关联表
CREATE TABLE IF NOT EXISTS collection_tags (
    collection_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (collection_id, tag_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- FTS5 全文搜索虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS collections_fts USING fts5(
    title,
    content,
    summary,
    content='collections',
    content_rowid='rowid',
    tokenize='unicode61'
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_collections_folder_id ON collections(folder_id);
CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(type);
CREATE INDEX IF NOT EXISTS idx_collections_is_deleted ON collections(is_deleted);
CREATE INDEX IF NOT EXISTS idx_collections_is_archived ON collections(is_archived);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_collection_tags_tag_id ON collection_tags(tag_id);

-- FTS 同步触发器
CREATE TRIGGER IF NOT EXISTS collections_fts_insert AFTER INSERT ON collections BEGIN
    INSERT INTO collections_fts(rowid, title, content, summary) VALUES (new.rowid, new.title, new.content, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS collections_fts_update AFTER UPDATE ON collections BEGIN
    DELETE FROM collections_fts WHERE rowid = old.rowid;
    INSERT INTO collections_fts(rowid, title, content, summary) VALUES (new.rowid, new.title, new.content, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS collections_fts_delete AFTER DELETE ON collections BEGIN
    DELETE FROM collections_fts WHERE rowid = old.rowid;
END;

-- 应用设置表（键值对存储）
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);