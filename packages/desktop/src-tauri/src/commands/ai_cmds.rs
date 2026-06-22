use reqwest;
use scraper::{Html, Selector, ElementRef};
use crate::db::{ai_config, get_db, settings::read_ai_config_tuple};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use tokio::task;

/** 分离后的图片信息 */
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArticleImage {
    pub id: i32,
    pub src: String,
    pub alt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepReadArgs {
    url: String,
    raw_content: Option<String>,
    images: Option<String>,
    refetch: Option<bool>,
    template_type: Option<String>,
    user_direction: Option<String>,
    previous_summary: Option<String>,
    summary_mode: Option<String>,
    source_mode: Option<String>,
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

fn get_app_data_dir() -> std::path::PathBuf {
    dirs::data_local_dir()
        .expect("无法确定应用数据目录")
        .join("favorites")
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
 * 从 HTML 提取正文，图文分离：图片用 [图N] 占位符，图片信息存入 images 数组
 */
fn extract_article_html(html: &str, page_url: &str, is_wechat: bool) -> (String, Vec<ArticleImage>) {
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
        None => return (String::new(), Vec::new()),
    };

    let mut parts: Vec<String> = Vec::new();
    let mut images: Vec<ArticleImage> = Vec::new();
    let mut img_index: i32 = 0;

    if let Some(sel) = block_sel {
        for el in container.select(&sel) {
            if let Some(html_part) = element_to_html_with_images(&el, page_url, &mut images, &mut img_index) {
                parts.push(html_part);
            }
        }
    }

    if parts.is_empty() {
        let text = container.text().collect::<String>();
        let trimmed = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if trimmed.is_empty() {
            return (String::new(), images);
        }
        return (format!("<p>{}</p>", html_escape(&trimmed)), images);
    }

    (parts.join("\n"), images)
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

fn element_to_html_with_images(
    el: &ElementRef,
    page_url: &str,
    images: &mut Vec<ArticleImage>,
    img_index: &mut i32,
) -> Option<String> {
    let tag = el.value().name();
    match tag {
        "img" => {
            let src = el.value().attr("data-src")
                .or_else(|| el.value().attr("data-original"))
                .or_else(|| el.value().attr("src"))?;
            let resolved = resolve_url(src, page_url)?;
            let alt = el.value().attr("alt").unwrap_or("配图");
            let id = *img_index + 1;
            *img_index = id;
            images.push(ArticleImage { id, src: resolved.clone(), alt: alt.to_string(), local_path: None });
            Some(format!("<p>[图{}]</p>", id))
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

fn prepare_content_for_ai(content: &str, images_json: Option<&str>) -> String {
    if !is_html_content(content) {
        return content.trim().to_string();
    }
    let document = Html::parse_document(content);
    let sel = Selector::parse("p, h1, h2, h3, h4, h5, h6, li, blockquote, img, hr").ok();

    // 解析 images JSON 用于占位符替换
    let images: Vec<ArticleImage> = images_json
        .and_then(|j| serde_json::from_str(j).ok())
        .unwrap_or_default();

    let mut lines: Vec<String> = Vec::new();
    if let Some(selector) = sel {
        for el in document.select(&selector) {
            let tag = el.value().name();
            match tag {
                "img" => {
                    // 内嵌 <img> 标签（老数据兼容）：尝试从 images 替换
                    let src = el.value().attr("src").unwrap_or("");
                    let alt = el.value().attr("alt").unwrap_or("配图");
                    // 检查是否有匹配的 [图N] 占位符
                    let matched = images.iter().find(|img| img.src == src);
                    if let Some(img) = matched {
                        lines.push(format!("[图{}: {}]", img.id, img.alt));
                    } else {
                        lines.push(format!("[图片: {}]", alt));
                    }
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
                        // 替换 [图N] 占位符为 [图N: alt]
                        let enriched = enrich_image_placeholders(&text, &images);
                        lines.push(enriched);
                        lines.push(String::new());
                    }
                }
            }
        }
    }
    if lines.is_empty() {
        return content_to_plain_text(content);
    }
    let joined = lines.join("\n");
    truncate_for_ai(&joined, ai_config::max_ai_content_chars())
}

/** 将 [图N] 占位符替换为 [图N: alt]，便于 AI 理解图片内容 */
fn enrich_image_placeholders(text: &str, images: &[ArticleImage]) -> String {
    let mut result = text.to_string();
    for img in images {
        let placeholder = format!("[图{}]", img.id);
        let enriched = format!("[图{}: {}]", img.id, img.alt);
        result = result.replace(&placeholder, &enriched);
    }
    result
}

/** 纯文本层面智能截断：保留前60%+后40%，中间标记省略 */
fn truncate_for_ai(content: &str, max_chars: usize) -> String {
    if content.len() <= max_chars {
        return content.to_string();
    }

    let paragraphs: Vec<&str> = content.split("\n\n").collect();
    let head_budget = (max_chars as f64 * 0.6) as usize;
    let tail_budget = max_chars - head_budget;

    let mut head_parts: Vec<&str> = Vec::new();
    let mut head_join_len = 0;
    for para in &paragraphs {
        let sep = if head_parts.is_empty() { 0 } else { 2 };
        if head_join_len + sep + para.len() > head_budget && !head_parts.is_empty() {
            break;
        }
        head_parts.push(para);
        head_join_len += sep + para.len();
    }

    let mut tail_parts: Vec<&str> = Vec::new();
    let mut tail_join_len = 0;
    let tail_lower_bound = head_parts.len();
    for i in (tail_lower_bound..paragraphs.len()).rev() {
        let para = paragraphs[i];
        let sep = if tail_parts.is_empty() { 0 } else { 2 };
        if tail_join_len + sep + para.len() > tail_budget && !tail_parts.is_empty() {
            break;
        }
        tail_parts.insert(0, para);
        tail_join_len += sep + para.len();
    }

    let middle_start = head_parts.len();
    let middle_end = paragraphs.len() - tail_parts.len();
    let omitted = if middle_start >= middle_end {
        0
    } else {
        paragraphs[middle_start..middle_end].join("\n\n").len()
    };

    if omitted == 0 {
        let parts: Vec<&str> = if tail_parts.is_empty() {
            head_parts
        } else {
            head_parts.iter().chain(tail_parts.iter()).copied().collect()
        };
        return parts.join("\n\n");
    }

    let marker = format!("\n\n【中间约 {} 字已省略，主要为展开论述与案例细节】\n\n", omitted);
    let mut result = head_parts.join("\n\n");
    result.push_str(&marker);
    result.push_str(&tail_parts.join("\n\n"));
    result
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
    let max_chunks = ai_config::max_chunks();
    if chunks.len() > max_chunks {
        // 超过上限时只保留前 max_chunks 个 chunk
        chunks.truncate(max_chunks);
    }
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
    images: Option<String>,
    refetch: Option<bool>,
    template_type: Option<String>,
    user_direction: Option<String>,
    previous_summary: Option<String>,
    summary_mode: Option<String>,
    source_mode: Option<String>,
) -> Result<serde_json::Value, String> {
    let args = DeepReadArgs {
        url,
        raw_content,
        images,
        refetch,
        template_type,
        user_direction,
        previous_summary,
        summary_mode,
        source_mode,
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

/** 从页面 HTML 或原文中提取标题 */
fn extract_page_title(page_html: Option<&str>, raw_content: &str) -> Option<String> {
    if let Some(html) = page_html {
        let document = Html::parse_document(html);
        if let Ok(sel) = Selector::parse(r#"meta[property="og:title"]"#) {
            if let Some(el) = document.select(&sel).next() {
                if let Some(title) = el.value().attr("content").map(|s| s.trim()).filter(|s| !s.is_empty()) {
                    return Some(title.to_string());
                }
            }
        }
        if let Ok(sel) = Selector::parse("title") {
            if let Some(el) = document.select(&sel).next() {
                let title = el.text().collect::<String>().trim().to_string();
                if !title.is_empty() {
                    return Some(title);
                }
            }
        }
    }

    let fragment = Html::parse_fragment(raw_content);
    for tag in ["h1", "h2"] {
        if let Ok(sel) = Selector::parse(tag) {
            if let Some(el) = fragment.select(&sel).next() {
                let title = el.text().collect::<String>().trim().to_string();
                if !title.is_empty() {
                    return Some(title);
                }
            }
        }
    }

    None
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
    let mut raw_content = String::new();
    let mut images_json = args.images.clone().unwrap_or_default();

    if !refetch {
        if let Some(existing) = args.raw_content.as_deref() {
            let trimmed = existing.trim();
            if !trimmed.is_empty() {
                validate_extracted_content(trimmed)?;
                check_cancelled(cancel)?;
                raw_content = trimmed.to_string();
                // 已有 images 也要带上
                if args.images.is_none() || args.images.as_deref().unwrap_or("").is_empty() {
                    images_json = String::new();
                }
            } else {
                return Err("原文内容为空，请重新抓取".to_string());
            }
        }
    }

    if raw_content.is_empty() {
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
        let (extracted, extracted_images) = task::spawn_blocking(move || extract_article_html(&html, &page_url, wechat))
            .await
            .map_err(|e| e.to_string())?;

        validate_extracted_content(&extracted)?;
        raw_content = extracted;
        images_json = serde_json::to_string(&extracted_images).unwrap_or_default();
    }

    // 下载图片到本地（如有新提取的图片）
    let mut images: Vec<ArticleImage> = if images_json.is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(&images_json).unwrap_or_default()
    };

    if !images.is_empty() && images.iter().any(|img| img.local_path.is_none()) {
        let img_dir = get_app_data_dir().join("uploads").join("img");
        std::fs::create_dir_all(&img_dir).ok();

        let img_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent(WECHAT_USER_AGENT)
            .build()
            .map_err(|e| e.to_string())?;

        for img in &mut images {
            if img.local_path.is_some() { continue; }
            if img.src.is_empty() { continue; }

            check_cancelled(cancel)?;

            let is_wechat_img = img.src.contains("mmbiz.qpic.cn") || img.src.contains("wx.qlogo.cn");
            let mut img_request = img_client.get(&img.src)
                .header("Accept", "image/*,*/*;q=0.8");

            if is_wechat_img {
                img_request = img_request
                    .header("Referer", "https://mp.weixin.qq.com/")
                    .header("Referrer-Policy", "no-referrer");
            }

            match img_request.send().await {
                Ok(resp) if resp.status().is_success() => {
                    let bytes = resp.bytes().await.ok();
                    if let Some(bytes) = bytes {
                        let filename = format!("img_{}_{}.jpg", img.id, &img.src.split('/').last().unwrap_or("unknown").chars().take(12).collect::<String>());
                        let file_path = img_dir.join(&filename);
                        if std::fs::write(&file_path, &bytes).is_ok() {
                            // 存绝对路径，前端用 convertFileSrc 转为 asset:// 协议
                            img.local_path = Some(file_path.to_string_lossy().to_string());
                        }
                    }
                },
                _ => { /* 下载失败，保留原始 src 兜底 */ }
            }
        }
        images_json = serde_json::to_string(&images).unwrap_or_default();
    }

    let template_type = args.template_type.clone().unwrap_or_else(|| {
        ai_config::detect_template_type(url, page_html.as_deref())
    });

    let images_ref = if images_json.is_empty() { None } else { Some(images_json.as_str()) };
    let prepared = prepare_content_for_ai(&raw_content, images_ref);
    let summary_mode = resolve_summary_mode(args.summary_mode.as_ref());

    let summary = if args.source_mode.as_deref() == Some("compress") {
        let user = format!(
            "请将以下详细摘要压缩为简略版（保留所有核心实体与关键细节，不要过度压缩）：\n\n{}",
            prepared
        );
        call_ai_api(
            &ai_config::compress_prompt(),
            &user,
            ai_config::compress_max_tokens(),
            &api_url,
            &api_key,
            &model,
            cancel,
        ).await?
    } else if let Some(direction) = args.user_direction.as_deref().filter(|d| !d.trim().is_empty()) {
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
        "images": images_json,
        "summary": summary,
        "templateType": template_type,
        "pageTitle": extract_page_title(page_html.as_deref(), &raw_content),
    }))
}
