use crate::db::models::{AiConfig, AppPreferences};
use rusqlite::Connection;

const DEFAULT_API_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL: &str = "gpt-4o-mini";

fn read_setting(db: &Connection, key: &str) -> Option<String> {
    db.prepare("SELECT value FROM settings WHERE key = ?")
        .ok()?
        .query_row([key], |row| row.get::<_, String>(0))
        .ok()
}

fn write_setting(db: &Connection, key: &str, value: &str) {
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [key, value],
    )
    .ok();
}

/// 从 settings 表读取 AI 配置
pub fn read_ai_config(db: &Connection) -> AiConfig {
    AiConfig {
        api_url: read_setting(db, "ai_api_url").unwrap_or_else(|| DEFAULT_API_URL.to_string()),
        api_key: read_setting(db, "ai_api_key").unwrap_or_default(),
        model: read_setting(db, "ai_model").unwrap_or_else(|| DEFAULT_MODEL.to_string()),
    }
}

/// 读取 AI 调用三元组（api_url, api_key, model）
pub fn read_ai_config_tuple(db: &Connection) -> (String, String, String) {
    let cfg = read_ai_config(db);
    (cfg.api_url, cfg.api_key, cfg.model)
}

/// 读取应用偏好
pub fn read_app_preferences(db: &Connection) -> AppPreferences {
    let auto_deep_read = read_setting(db, "auto_deep_read")
        .map(|v| v != "false" && v != "0")
        .unwrap_or(true);
    let default_summary_mode = read_setting(db, "default_summary_mode")
        .filter(|v| v == "brief" || v == "detailed")
        .unwrap_or_else(|| "detailed".to_string());

    AppPreferences {
        auto_deep_read,
        default_summary_mode,
    }
}

/// 写入应用偏好
pub fn write_app_preferences(db: &Connection, prefs: &AppPreferences) {
    write_setting(
        db,
        "auto_deep_read",
        if prefs.auto_deep_read { "true" } else { "false" },
    );
    write_setting(db, "default_summary_mode", &prefs.default_summary_mode);
}
