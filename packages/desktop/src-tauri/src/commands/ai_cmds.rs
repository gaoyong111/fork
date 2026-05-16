use reqwest;
use scraper::{Html, Selector};
use crate::db::get_db;
use tokio::task;

const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const AI_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_HTML_SIZE: usize = 2 * 1024 * 1024; // 2MB

/** 从 DB settings 读取 AI 配置 */
fn get_ai_config() -> (String, String, String) {
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

    (api_url, api_key, model)
}

fn extract_page_text(html: &str, max_length: usize) -> String {
    let document = Html::parse_document(html);

    let article_sel = Selector::parse("article").ok();
    let main_sel = Selector::parse("main").ok();
    let body_sel = Selector::parse("body").ok();

    let text = if let Some(sel) = article_sel {
        document.select(&sel).next().map(|el| el.text().collect::<String>())
    } else {
        None
    }
    .or_else(|| main_sel.as_ref().and_then(|sel| document.select(sel).next().map(|el| el.text().collect::<String>())))
    .or_else(|| body_sel.as_ref().and_then(|sel| document.select(sel).next().map(|el| el.text().collect::<String>())))
    .unwrap_or_default();

    let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.len() > max_length {
        format!("{}...", &cleaned[..max_length])
    } else {
        cleaned
    }
}

#[tauri::command]
pub async fn extract_summary(url: String) -> Result<serde_json::Value, String> {
    let (api_url, api_key, model) = get_ai_config();

    if api_key.is_empty() {
        return Err("AI 服务未配置，请在设置中填写 API Key".to_string());
    }

    // 共用 Client，通过请求级 timeout 覆盖 client 级超时
    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;

    // 1. 抓取页面
    let response = client.get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let html = response.text().await.map_err(|e| e.to_string())?;

    // 限制页面大小，避免超大 HTML 导致解析阻塞
    if html.len() > MAX_HTML_SIZE {
        return Err("页面内容过大（超过2MB），无法处理".to_string());
    }

    // HTML 解析移到 spawn_blocking，避免阻塞 tokio worker 线程
    let page_text = task::spawn_blocking(move || extract_page_text(&html, 8000))
        .await
        .map_err(|e| e.to_string())?;

    if page_text.is_empty() || page_text.len() < 50 {
        return Err("无法提取页面内容，请确认链接可访问".to_string());
    }

    // 2. 调用 AI API（请求级 120s 超时覆盖 client 级 15s）
    let chat_url = format!("{}/chat/completions", api_url);

    let request_body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是一个专业的深度阅读助手。请对用户提供的文章内容进行精读和归纳总结。\n\n请按照以下结构输出 HTML 格式的精读报告（不要用 markdown，直接用 HTML 标签）：\n\n<h3>📖 核心观点</h3>\n<p>用2-3句话概括文章最核心的观点</p>\n\n<h3>🔍 详细分析</h3>\n<p>分3-5个要点详细展开分析文章的关键论述</p>\n\n<h3>💡 关键洞察</h3>\n<p>指出文章中独特或有价值的洞察</p>\n\n<h3>📝 原文金句</h3>\n<p>摘录1-2句文章中的精彩原话</p>\n\n要求：内容要详细、有深度，不少于300字，使用 HTML 格式输出，不要使用 markdown。"
            },
            {
                "role": "user",
                "content": format!("请精读并归纳以下文章内容：\n\n{}", page_text)
            }
        ],
        "max_tokens": 2048,
        "temperature": 0.7
    });

    let ai_response = client.post(&chat_url)
        .timeout(AI_TIMEOUT)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let ai_data: serde_json::Value = ai_response.json().await.map_err(|e| e.to_string())?;

    let summary = ai_data.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    Ok(serde_json::json!({ "summary": summary }))
}