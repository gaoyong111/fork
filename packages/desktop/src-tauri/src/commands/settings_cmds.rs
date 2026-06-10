use crate::db::get_db;
use crate::db::models::{AiConfig, AppPreferences};
use crate::db::settings::{read_ai_config, read_app_preferences, write_app_preferences};

#[tauri::command]
pub fn get_ai_config() -> AiConfig {
    let db = get_db().lock().unwrap();
    read_ai_config(&db)
}

#[tauri::command]
pub fn set_ai_config(config: AiConfig) -> AiConfig {
    let db = get_db().lock().unwrap();
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", rusqlite::params!["ai_api_url", &config.api_url]).ok();
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", rusqlite::params!["ai_api_key", &config.api_key]).ok();
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", rusqlite::params!["ai_model", &config.model]).ok();

    AiConfig {
        api_url: config.api_url,
        api_key: config.api_key,
        model: config.model,
    }
}

/** 测试 AI API 连接，发送一个简单请求验证配置是否正确 */
#[tauri::command]
pub async fn test_ai_connection(config: Option<AiConfig>) -> Result<serde_json::Value, String> {
    let ai_config = config.unwrap_or_else(|| {
        let db = get_db().lock().unwrap();
        read_ai_config(&db)
    });

    if ai_config.api_key.is_empty() {
        return Err("请先配置 AI API Key".to_string());
    }

    let chat_url = format!("{}/chat/completions", ai_config.api_url);
    let request_body = serde_json::json!({
        "model": ai_config.model,
        "messages": [{ "role": "user", "content": "Hi" }],
        "max_tokens": 5
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.post(&chat_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", ai_config.api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("连接失败: {}", body));
    }

    Ok(serde_json::json!({
        "success": true,
        "model": ai_config.model,
        "message": "连接成功"
    }))
}

#[tauri::command]
pub fn get_app_preferences() -> AppPreferences {
    let db = get_db().lock().unwrap();
    read_app_preferences(&db)
}

#[tauri::command]
pub fn set_app_preferences(preferences: AppPreferences) -> AppPreferences {
    let db = get_db().lock().unwrap();
    let mode = if preferences.default_summary_mode == "brief" {
        "brief"
    } else {
        "detailed"
    };
    let prefs = AppPreferences {
        auto_deep_read: preferences.auto_deep_read,
        default_summary_mode: mode.to_string(),
    };
    write_app_preferences(&db, &prefs);
    prefs
}
