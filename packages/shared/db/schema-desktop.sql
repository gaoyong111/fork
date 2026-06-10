-- Desktop-only schema extensions (Tauri app settings KV store)

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
