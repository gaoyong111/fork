use crate::db::get_db;

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub api_url: String,
    pub api_key: String,
    pub model: String,
}

/** 从 DB 读取 AI 配置（同步，读取后立即释放 lock） */
fn load_ai_config_sync() -> AiConfig {
    let db = get_db().lock().unwrap();
    let api_url = db.prepare("SELECT value FROM settings WHERE key = 'ai_api_url'")
        .ok()
        .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, String>(0)).ok())
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let api_key = db.prepare("SELECT value FROM settings WHERE key = 'ai_api_key'")
        .ok()
        .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, String>(0)).ok())
        .unwrap_or_default();

    let model = db.prepare("SELECT value FROM settings WHERE key = 'ai_model'")
        .ok()
        .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, String>(0)).ok())
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    AiConfig { api_url, api_key, model }
}

#[tauri::command]
pub fn get_ai_config() -> AiConfig {
    load_ai_config_sync()
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
pub async fn test_ai_connection() -> Result<serde_json::Value, String> {
    // 同步读取配置，立即释放 MutexGuard
    let config = load_ai_config_sync();

    if config.api_key.is_empty() {
        return Err("API Key 未填写".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let chat_url = format!("{}/chat/completions", config.api_url);

    let request_body = serde_json::json!({
        "model": config.model,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 5
    });

    let response = client.post(&chat_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("连接失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API 返回错误 ({}): {}", status, body));
    }

    let body = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    let data: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("响应不是合法 JSON ({}): 原始内容前200字符: {}", e, &body[..body.len().min(200)]))?;

    if data.get("choices").is_some() {
        Ok(serde_json::json!({
            "success": true,
            "model": data.get("model").and_then(|m| m.as_str()).unwrap_or(&config.model),
            "message": "连接成功，AI 服务可正常使用"
        }))
    } else {
        let err_msg = data.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("未知错误");
        Err(format!("API 响应异常: {}", err_msg))
    }
}