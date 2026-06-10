use reqwest;
use scraper::{Html, Selector, ElementRef};
use crate::db::{ai_config, get_db, settings::read_ai_config_tuple};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use tokio::task;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepReadArgs {
    url: String,
    raw_content: Option<String>,
    refetch: Option<bool>,
    template_type: Option<String>,
    user_direction: Option<String>,
    previous_summary: Option<String>,
    summary_mode: Option<String>,
}

fn resolve_summary_mode(mode: Option<&String>) -> String {
    match mode.map(|s| s.as_str()) {
        Some("brief") => "brief".to_string(),
        _ => "detailed".to_string(),
    }
}

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WECHAT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

static CURRENT_DEEP_READ_CANCEL: Lazy<Mutex<Option<Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(None));

fn register_cancel_token() -> Arc<AtomicBool> {
    let token = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = CURRENT_DEEP_READ_CANCEL.lock() {
        *guard = Some(Arc::clone(&token));
    }
    token
}

fn clear_cancel_token() {
    if let Ok(mut guard) = CURRENT_DEEP_READ_CANCEL.lock() {
        *guard = None;
    }
}

fn check_cancelled(token: &AtomicBool) -> Result<(), String> {
    if token.load(Ordering::SeqCst) {
        return Err("精读已取消".to_string());
    }
    Ok(())
}

/** 取消当前正在执行的 deep_read */
#[tauri::command]
pub fn cancel_deep_read() {
    if let Ok(guard) = CURRENT_DEEP_READ_CANCEL.lock() {
        if let Some(token) = guard.as_ref() {
            token.store(true, Ordering::SeqCst);
        }
    }
}

/** 判断是否为微信公众号链接 */
fn is_wechat_url(url: &str) -> bool {
    url.contains("mp.weixin.qq.com")
}

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

/**
 * 从 HTML 提取保留格式与图片的原文
 */
fn extract_article_html(html: &str, page_url: &str, is_wechat: bool) -> String {
    let noise_tags = ["script", "style", "noscript", "nav", "footer", "header", "iframe"];
    let mut cleaned_html = html.to_string();
    for tag in &noise_tags {
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
                cleaned_html.replace_range(start.., "");
                break;
            }
        }
    }

    let document = Html::parse_document(&cleaned_html);
    let wechat_content_sel = Selector::parse("#js_content").ok();
    let rich_media_sel = Selector::parse(".rich_media_content").ok();
    let article_sel = Selector::parse("article").ok();
    let main_sel = Selector::parse("main").ok();
    let body_sel = Selector::parse("body").ok();
    let block_sel = Selector::parse("p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, figure, img, hr, section").ok();

    let container = if is_wechat {
        wechat_content_sel.as_ref()
            .and_then(|sel| document.select(sel).next())
            .or_else(|| rich_media_sel.as_ref().and_then(|sel| document.select(sel).next()))
    } else {
        None
    }
    .or_else(|| article_sel.as_ref().and_then(|sel| document.select(sel).next()))
    .or_else(|| main_sel.as_ref().and_then(|sel| document.select(sel).next()))
    .or_else(|| body_sel.as_ref().and_then(|sel| document.select(sel).next()));

    let container = match container {
        Some(c) => c,
        None => return String::new(),
    };

    let mut parts: Vec<String> = Vec::new();
    if let Some(sel) = block_sel {
        for el in container.select(&sel) {
            if let Some(html_part) = element_to_html(&el, page_url) {
                parts.push(html_part);
            }
        }
    }

    if parts.is_empty() {
        let text = container.text().collect::<String>();
        let trimmed = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if trimmed.is_empty() {
            return String::new();
        }
        return format!("<p>{}</p>", html_escape(&trimmed));
    }

    parts.join("\n")
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn resolve_url(raw: &str, base: &str) -> Option<String> {
    if raw.starts_with("http") {
        return Some(raw.to_string());
    }
    if let Ok(base_url) = url::Url::parse(base) {
        if let Ok(joined) = base_url.join(raw) {
            return Some(joined.to_string());
        }
    }
    None
}

fn element_to_html(el: &ElementRef, page_url: &str) -> Option<String> {
    let tag = el.value().name();
    match tag {
        "img" => {
            let src = el.value().attr("data-src")
                .or_else(|| el.value().attr("data-original"))
                .or_else(|| el.value().attr("src"))?;
            let resolved = resolve_url(src, page_url)?;
            let alt = el.value().attr("alt").unwrap_or("配图");
            Some(format!("<img src=\"{}\" alt=\"{}\" />", html_escape(&resolved), html_escape(alt)))
        }
        "hr" => Some("<hr />".to_string()),
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "blockquote" | "ul" | "ol" | "figure" | "section" => {
            let text = el.text().collect::<String>().trim().to_string();
            if text.is_empty() && tag != "figure" {
                return None;
            }
            Some(format!("<{}>{}</{}>", tag, html_escape(&text), tag))
        }
        _ => None,
    }
}

fn is_html_content(content: &str) -> bool {
    let trimmed = content.trim();
    trimmed.starts_with('<') && trimmed.contains("</")
}

fn content_to_plain_text(content: &str) -> String {
    if !is_html_content(content) {
        return content.trim().to_string();
    }
    let document = Html::parse_document(content);
    let body_sel = Selector::parse("body").ok();
    if let Some(sel) = body_sel {
        if let Some(body) = document.select(&sel).next() {
            return body.text().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
        }
    }
    content.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn prepare_content_for_ai(content: &str) -> String {
    if !is_html_content(content) {
        return content.trim().to_string();
    }
    let document = Html::parse_document(content);
    let sel = Selector::parse("p, h1, h2, h3, h4, h5, h6, li, blockquote, img, hr").ok();
    let mut lines: Vec<String> = Vec::new();
    if let Some(selector) = sel {
        for el in document.select(&selector) {
            let tag = el.value().name();
            match tag {
                "img" => {
                    let src = el.value().attr("src").unwrap_or("");
                    let alt = el.value().attr("alt").unwrap_or("配图");
                    lines.push(format!("[图片: {} ({})]", alt, src));
                }
                "hr" => lines.push("---".to_string()),
                t if t.starts_with('h') && t.len() == 2 => {
                    let level = t.chars().nth(1).unwrap_or('1').to_digit(10).unwrap_or(1) as usize;
                    let text = el.text().collect::<String>().trim().to_string();
                    if !text.is_empty() {
                        lines.push(format!("{} {}", "#".repeat(level), text));
                    }
                }
                "li" => {
                    let text = el.text().collect::<String>().trim().to_string();
                    if !text.is_empty() {
                        lines.push(format!("- {}", text));
                    }
                }
                _ => {
                    let text = el.text().collect::<String>().trim().to_string();
                    if !text.is_empty() {
                        lines.push(text);
                        lines.push(String::new());
                    }
                }
            }
        }
    }
    if lines.is_empty() {
        return content_to_plain_text(content);
    }
    lines.join("\n")
}

/**
 * 调用 AI API
 */
async fn call_ai_api(
    system_prompt: &str,
    user_content: &str,
    max_tokens: u32,
    api_url: &str,
    api_key: &str,
    model: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    check_cancelled(cancel)?;

    let request_body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_content }
        ],
        "max_tokens": max_tokens,
        "temperature": ai_config::temperature()
    });

    let chat_url = format!("{}/chat/completions", api_url);

    let client = reqwest::Client::builder()
        .timeout(ai_config::ai_timeout())
        .build()
        .map_err(|e| e.to_string())?;

    let ai_response = client.post(&chat_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| classify_reqwest_error(&e))?;

    check_cancelled(cancel)?;

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

    Ok(summary)
}

async fn chunked_ai_process(
    prepared_content: &str,
    template_type: &str,
    summary_mode: &str,
    api_url: &str,
    api_key: &str,
    model: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    if prepared_content.len() <= ai_config::chunk_threshold() {
        let prompt = ai_config::template_prompt(template_type, "full", summary_mode);
        let user = format!("{}{}", ai_config::user_message_prefix(), prepared_content);
        return call_ai_api(
            &prompt,
            &user,
            ai_config::max_tokens(summary_mode, false, false, false),
            api_url,
            api_key,
            model,
            cancel,
        ).await;
    }

    let paragraphs = prepared_content.split("\n\n").collect::<Vec<_>>();
    let mut chunks: Vec<String> = Vec::new();
    let mut current_chunk = String::new();
    let chunk_size = ai_config::chunk_size();

    for para in &paragraphs {
        if current_chunk.len() + para.len() > chunk_size && !current_chunk.is_empty() {
            chunks.push(current_chunk.clone());
            current_chunk = para.to_string();
        } else {
            if !current_chunk.is_empty() {
                current_chunk.push_str("\n\n");
            }
            current_chunk.push_str(para);
        }
    }
    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }

    let concurrency = ai_config::chunk_concurrency();
    let mut results: Vec<String> = Vec::with_capacity(chunks.len());
    let chunk_prompt = ai_config::template_prompt(template_type, "chunk", summary_mode);
    let merge_prompt = ai_config::template_prompt(template_type, "merge", summary_mode);
    let prefix = ai_config::user_message_prefix();
    let summary_mode_owned = summary_mode.to_string();

    for batch in chunks.chunks(concurrency) {
        check_cancelled(cancel)?;
        let api_url = api_url.to_string();
        let api_key = api_key.to_string();
        let model = model.to_string();
        let cancel = Arc::new(AtomicBool::new(cancel.load(Ordering::SeqCst)));
        let chunk_prompt = chunk_prompt.clone();
        let prefix = prefix.to_string();
        let summary_mode_batch = summary_mode_owned.clone();

        let futures: Vec<_> = batch
            .iter()
            .map(|chunk| {
                let chunk = chunk.clone();
                let api_url = api_url.clone();
                let api_key = api_key.clone();
                let model = model.clone();
                let cancel = Arc::clone(&cancel);
                let chunk_prompt = chunk_prompt.clone();
                let prefix = prefix.clone();
                let summary_mode_batch = summary_mode_batch.clone();
                async move {
                    let user = format!("{}{}", prefix, chunk);
                    call_ai_api(
                        &chunk_prompt,
                        &user,
                        ai_config::max_tokens(&summary_mode_batch, true, false, false),
                        &api_url,
                        &api_key,
                        &model,
                        &cancel,
                    ).await
                }
            })
            .collect();

        let batch_results = futures::future::try_join_all(futures).await?;
        results.extend(batch_results);
    }

    check_cancelled(cancel)?;
    let merged = results.join("\n\n---\n\n");
    let user = format!("{}{}", prefix, merged);
    call_ai_api(
        &merge_prompt,
        &user,
        ai_config::max_tokens(summary_mode, false, false, true),
        api_url,
        api_key,
        model,
        cancel,
    ).await
}

fn build_refine_user_message(prepared: &str, previous: &str, direction: &str) -> String {
    format!(
        "【用户调整诉求】\n{}\n\n【先前的精读摘要】\n{}\n\n【原文内容】\n{}",
        direction.trim(),
        previous.trim(),
        prepared
    )
}

fn refine_system_prompt(template_type: &str, summary_mode: &str) -> String {
    format!(
        "{}\n\n---\n\n该文章默认精读模板参考（可按用户诉求调整结构）：\n{}",
        ai_config::refine_prompt(summary_mode),
        ai_config::template_prompt(template_type, "full", summary_mode)
    )
}

#[tauri::command]
pub async fn deep_read(
    url: String,
    raw_content: Option<String>,
    refetch: Option<bool>,
    template_type: Option<String>,
    user_direction: Option<String>,
    previous_summary: Option<String>,
    summary_mode: Option<String>,
) -> Result<serde_json::Value, String> {
    let args = DeepReadArgs {
        url,
        raw_content,
        refetch,
        template_type,
        user_direction,
        previous_summary,
        summary_mode,
    };
    let cancel_token = register_cancel_token();
    let result = deep_read_inner(&args, &cancel_token).await;
    clear_cancel_token();
    result
}

/** 按字符数安全截取预览文本（避免 UTF-8 字节边界 panic） */
fn text_preview(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

/** 校验提取的正文质量 */
fn validate_extracted_content(content: &str) -> Result<(), String> {
    let text = content_to_plain_text(content);
    let min_len = ai_config::min_content_length();
    if text.chars().count() < min_len {
        return Err(format!("正文过短（{} 字），可能未成功提取页面内容", text.chars().count()));
    }

    let para_count = if is_html_content(content) {
        let document = Html::parse_document(content);
        let sel = Selector::parse("p, h1, h2, h3, h4, h5, h6, li, blockquote").ok();
        sel.map(|s| document.select(&s).count()).unwrap_or(0)
    } else {
        content.split("\n\n").filter(|p| !p.trim().is_empty()).count()
    };
    let min_para = ai_config::min_paragraph_count();
    if para_count < min_para && text.chars().count() < min_len * 3 {
        return Err("正文段落过少，可能是导航页或登录页".to_string());
    }

    let preview = text_preview(&text, 500).to_lowercase();
    let noise = ["请登录", "sign in", "log in", "403 forbidden", "access denied", "页面不存在", "验证码", "captcha"];
    for kw in noise {
        if preview.contains(&kw.to_lowercase()) {
            return Err("页面疑似需要登录或为错误页，无法精读".to_string());
        }
    }

    Ok(())
}

async fn deep_read_inner(
    args: &DeepReadArgs,
    cancel: &AtomicBool,
) -> Result<serde_json::Value, String> {
    let url = &args.url;
    let refetch = args.refetch.unwrap_or(false);
    let (api_url, api_key, model) = {
        let db = get_db().lock().map_err(|e| e.to_string())?;
        read_ai_config_tuple(&db)
    };

    if api_key.is_empty() {
        return Err("AI 服务未配置，请在设置中填写 API Key".to_string());
    }

    let mut page_html: Option<String> = None;
    let raw_content = if !refetch {
        if let Some(existing) = args.raw_content.as_deref() {
            let trimmed = existing.trim();
            if !trimmed.is_empty() {
                validate_extracted_content(trimmed)?;
                check_cancelled(cancel)?;
                trimmed.to_string()
            } else {
                return Err("原文内容为空，请重新抓取".to_string());
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let raw_content = if raw_content.is_empty() {
        let wechat = is_wechat_url(url);

        let client = reqwest::Client::builder()
            .timeout(ai_config::fetch_timeout())
            .user_agent(if wechat { WECHAT_USER_AGENT } else { USER_AGENT })
            .build()
            .map_err(|e| e.to_string())?;

        let mut request = client.get(url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "zh-CN,zh;q=0.9");

        if wechat {
            request = request.header("Referer", "https://mp.weixin.qq.com/");
        }

        let response = request
            .send()
            .await
            .map_err(|e| classify_reqwest_error(&e))?;

        check_cancelled(cancel)?;

        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "页面返回 HTTP {}（{}），无法获取内容",
                status.as_u16(),
                status.canonical_reason().unwrap_or("未知")
            ));
        }

        let html = response.text().await.map_err(|e| classify_reqwest_error(&e))?;
        page_html = Some(html.clone());

        check_cancelled(cancel)?;

        if html.len() > ai_config::max_html_size() {
            return Err("页面内容超过 10MB，无法处理".to_string());
        }

        let page_url = url.clone();
        let extracted = task::spawn_blocking(move || extract_article_html(&html, &page_url, wechat))
            .await
            .map_err(|e| e.to_string())?;

        validate_extracted_content(&extracted)?;
        extracted
    } else {
        raw_content
    };

    let template_type = args.template_type.clone().unwrap_or_else(|| {
        ai_config::detect_template_type(url, page_html.as_deref())
    });

    let prepared = prepare_content_for_ai(&raw_content);
    let summary_mode = resolve_summary_mode(args.summary_mode.as_ref());

    let summary = if let Some(direction) = args.user_direction.as_deref().filter(|d| !d.trim().is_empty()) {
        let previous = args.previous_summary.as_deref().unwrap_or("");
        let system = refine_system_prompt(&template_type, &summary_mode);
        let user = build_refine_user_message(&prepared, previous, direction);
        call_ai_api(
            &system,
            &user,
            ai_config::max_tokens(&summary_mode, false, true, false),
            &api_url,
            &api_key,
            &model,
            cancel,
        ).await?
    } else {
        chunked_ai_process(&prepared, &template_type, &summary_mode, &api_url, &api_key, &model, cancel).await?
    };

    Ok(serde_json::json!({
        "rawContent": raw_content,
        "summary": summary,
        "templateType": template_type
    }))
}
