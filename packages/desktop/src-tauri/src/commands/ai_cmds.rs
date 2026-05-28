use reqwest;
use scraper::{Html, Selector};
use crate::db::get_db;
use rusqlite::Connection;
use tokio::task;

const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const AI_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_HTML_SIZE: usize = 10 * 1024 * 1024; // 10MB 安全上限（防止极端页面耗尽内存）
const MAX_TEXT_LENGTH: usize = 16000; // 给 AI 的纯文本长度上限

/** 将 reqwest 错误分类为用户可读的中文提示 */
fn classify_reqwest_error(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        return "请求超时，请稍后重试".to_string();
    }
    if err.is_connect() {
        return "网络连接失败，请检查链接地址或网络".to_string();
    }
    if err.is_redirect() {
        return "页面重定向过多，无法获取内容".to_string();
    }
    if err.is_request() {
        return "请求构造失败，请检查链接地址".to_string();
    }
    if err.is_body() || err.is_decode() {
        return "页面内容解析失败".to_string();
    }
    err.to_string()
}

/** 从 DB settings 读取 AI 配置（接受 &Connection，避免在持锁上下文中二次加锁） */
fn read_ai_config(db: &Connection) -> (String, String, String) {
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

/**
 * 从 HTML 提取正文纯文本
 * 先剔除 script/style/nav 等噪音标签，再从 article/main/body 中提取文本，
 * 最后截断到 max_length（纯文本层面截断，不影响内容完整性）
 */
fn extract_page_text(html: &str, max_length: usize) -> String {
    // 先移除噪音标签内容，大幅减少解析量
    let noise_tags = ["script", "style", "noscript", "nav", "footer", "header", "iframe"];
    let mut cleaned_html = html.to_string();
    for tag in &noise_tags {
        // 移除 <tag>...</tag> 整块内容（包括嵌套）
        let open = format!("<{}", tag);
        let close = format!("</{}>", tag);
        while let Some(start) = cleaned_html.find(&open) {
            if let Some(end) = cleaned_html.find(&close) {
                if end > start {
                    cleaned_html.replace_range(start..end + close.len(), "");
                } else {
                    break;
                }
            } else {
                // 没有闭合标签，移除从开标签到末尾
                cleaned_html.replace_range(start.., "");
                break;
            }
        }
    }

    let document = Html::parse_document(&cleaned_html);

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

    let trimmed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.len() > max_length {
        let mut end = max_length;
        while !trimmed.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        format!("{}...", &trimmed[..end])
    } else {
        trimmed
    }
}

#[tauri::command]
pub async fn extract_summary(url: String) -> Result<serde_json::Value, String> {
    let (api_url, api_key, model) = {
        let db = get_db().lock().map_err(|e| e.to_string())?;
        read_ai_config(&db)
    };

    if api_key.is_empty() {
        return Err("AI 服务未配置，请在设置中填写 API Key".to_string());
    }

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
        .map_err(|e| classify_reqwest_error(&e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("页面返回 HTTP {}（{}），无法获取内容", status.as_u16(), status.canonical_reason().unwrap_or("未知")));
    }

    let html = response.text().await.map_err(|e| classify_reqwest_error(&e))?;

    // 极端大页面（>10MB）拒绝，防止耗尽内存；正常大页面完整解析
    if html.len() > MAX_HTML_SIZE {
        return Err("页面内容超过 10MB，无法处理".to_string());
    }

    // HTML 解析移到 spawn_blocking，避免阻塞 tokio worker 线程
    let page_text = task::spawn_blocking(move || extract_page_text(&html, MAX_TEXT_LENGTH))
        .await
        .map_err(|e| e.to_string())?;

    if page_text.is_empty() || page_text.len() < 50 {
        return Err("无法提取页面内容，请确认链接可访问".to_string());
    }

    // 2. 调用 AI API
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
        .map_err(|e| classify_reqwest_error(&e))?;

    let ai_status = ai_response.status();
    if !ai_status.is_success() {
        let body_text = ai_response.text().await.unwrap_or_default();
        let api_error = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|v| v.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str().map(|s| s.to_string()))
            )
            .unwrap_or_default();
        if api_error.is_empty() {
            return Err(format!("AI 服务返回 HTTP {}，请检查 API 配置", ai_status.as_u16()));
        }
        return Err(format!("AI 服务错误：{}", api_error));
    }

    let ai_data: serde_json::Value = ai_response.json().await.map_err(|e| classify_reqwest_error(&e))?;

    let summary = ai_data.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    Ok(serde_json::json!({ "summary": summary }))
}