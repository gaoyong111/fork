use crate::db::models::MetadataResult;
use reqwest;
use scraper::{Html, Selector};

const MAX_RESPONSE_SIZE: usize = 500 * 1024;
const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WECHAT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

fn is_wechat_url(url: &str) -> bool {
    url.contains("mp.weixin.qq.com")
}

/** 从微信公众号 HTML 提取封面（og:image / msg_cdn_url / js_cover / data-src） */
fn extract_wechat_cover(html: &str) -> Option<String> {
    for marker in ["property=\"og:image\"", "property='og:image'"] {
        if let Some(start) = html.find(marker) {
            let slice = &html[start..start.min(html.len()).saturating_add(200)];
            if let Some(url) = extract_attr_value(slice, "content") {
                if url.starts_with("http") {
                    return Some(url);
                }
            }
        }
    }

    if let Some(idx) = html.find("msg_cdn_url") {
        let end = (idx + 120).min(html.len());
        let slice = &html[idx..end];
        if let Some(url) = extract_quoted_url(slice) {
            return Some(url.replace("\\/", "/"));
        }
    }

    if let Some(idx) = html.find("id=\"js_cover\"").or_else(|| html.find("id='js_cover'")) {
        let end = (idx + 300).min(html.len());
        let slice = &html[idx..end];
        if let Some(url) = extract_css_background_url(slice) {
            return Some(url);
        }
    }

    if let Some(idx) = html.find("https://mmbiz.qpic.cn") {
        let rest = &html[idx..];
        if let Some(end) = rest.find('"').or_else(|| rest.find('\'')) {
            return Some(rest[..end].to_string());
        }
    }

    None
}

fn extract_attr_value(fragment: &str, attr: &str) -> Option<String> {
    let key = format!("{}=\"", attr);
    if let Some(start) = fragment.find(&key) {
        let rest = &fragment[start + key.len()..];
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }
    None
}

fn extract_quoted_url(fragment: &str) -> Option<String> {
    if let Some(start) = fragment.find('"') {
        let rest = &fragment[start + 1..];
        if let Some(end) = rest.find('"') {
            let url = rest[..end].to_string();
            if url.starts_with("http") {
                return Some(url);
            }
        }
    }
    None
}

fn extract_css_background_url(fragment: &str) -> Option<String> {
    if let Some(idx) = fragment.find("url(") {
        let rest = &fragment[idx + 4..];
        let trimmed = rest.trim_start_matches(['\'', '"']);
        if let Some(end) = trimmed.find(['\'', '"', ')']) {
            let url = trimmed[..end].trim();
            if url.starts_with("http") {
                return Some(url.to_string());
            }
        }
    }
    None
}

#[tauri::command]
pub async fn fetch_metadata(url: String) -> Result<MetadataResult, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(empty_metadata());
    }

    let wechat = is_wechat_url(&url);

    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent(if wechat { WECHAT_USER_AGENT } else { USER_AGENT })
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");

    if wechat {
        request = request.header("Referer", "https://mp.weixin.qq.com/");
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    let content_type = response.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
        return Ok(empty_metadata());
    }

    let body = response.bytes().await.map_err(|e| e.to_string())?;
    let html_bytes = if body.len() > MAX_RESPONSE_SIZE {
        &body[..MAX_RESPONSE_SIZE]
    } else {
        &body[..]
    };

    let html_str = String::from_utf8_lossy(html_bytes).to_string();
    Ok(extract_metadata_from_html(&html_str, &url))
}

fn empty_metadata() -> MetadataResult {
    MetadataResult {
        title: "".to_string(),
        description: "".to_string(),
        cover_url: "".to_string(),
        favicon: "".to_string(),
    }
}

fn extract_metadata_from_html(html: &str, page_url: &str) -> MetadataResult {
    let document = Html::parse_document(html);
    let base_url_parsed = url::Url::parse(page_url).ok();
    let wechat = is_wechat_url(page_url);

    let title = select_attr(&document, "meta[property='og:title']", "content")
        .or_else(|| select_text(&document, "title"))
        .unwrap_or_default();

    let description = select_attr(&document, "meta[property='og:description']", "content")
        .or_else(|| select_attr(&document, "meta[name='description']", "content"))
        .or_else(|| select_attr(&document, "meta[name='twitter:description']", "content"))
        .unwrap_or_default();

    let mut cover_url = select_attr(&document, "meta[property='og:image']", "content")
        .or_else(|| select_attr(&document, "meta[name='twitter:image']", "content"))
        .unwrap_or_default();

    if wechat {
        if cover_url.is_empty() {
            cover_url = extract_wechat_cover(html).unwrap_or_default();
        }
        if cover_url.is_empty() {
            if let Ok(sel) = Selector::parse("#js_cover") {
                if let Some(el) = document.select(&sel).next() {
                    if let Some(style) = el.value().attr("style") {
                        if let Some(url) = extract_css_background_url(style) {
                            cover_url = url;
                        }
                    }
                }
            }
        }
        if cover_url.is_empty() {
            for selector in [".rich_media_thumb img", "#js_article img", "#img-content img"] {
                if let Ok(sel) = Selector::parse(selector) {
                    if let Some(el) = document.select(&sel).next() {
                        cover_url = el.value().attr("data-src")
                            .or_else(|| el.value().attr("src"))
                            .unwrap_or("")
                            .to_string();
                        if !cover_url.is_empty() {
                            break;
                        }
                    }
                }
            }
        }
    } else if cover_url.is_empty() {
        if let (Some(base), Ok(sel)) = (&base_url_parsed, Selector::parse("img")) {
            if let Some(el) = document.select(&sel).next() {
                if let Some(src) = el.value().attr("src") {
                    if let Ok(img_url) = base.join(src) {
                        if img_url.host_str() == base.host_str() {
                            cover_url = img_url.to_string();
                        }
                    }
                }
            }
        }
    }

    let favicon = select_attr(&document, "link[rel='icon']", "href")
        .or_else(|| select_attr(&document, "link[rel='shortcut icon']", "href"))
        .or_else(|| select_attr(&document, "link[rel='apple-touch-icon']", "href"))
        .unwrap_or_else(|| {
            base_url_parsed.as_ref()
                .map(|u| format!("{}://{}", u.scheme(), u.host_str().unwrap_or("")))
                .map(|origin| format!("{}/favicon.ico", origin))
                .unwrap_or_default()
        });

    MetadataResult {
        title: title.trim().to_string(),
        description: description.trim().to_string(),
        cover_url: resolve_url(&cover_url, page_url),
        favicon: resolve_url(&favicon, page_url),
    }
}

fn select_text(document: &Html, selector: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    document.select(&sel).next().map(|el| el.text().collect::<String>())
}

fn select_attr(document: &Html, selector: &str, attr: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    document.select(&sel).next().and_then(|el| el.value().attr(attr).map(|v| v.to_string()))
}

fn resolve_url(relative: &str, base: &str) -> String {
    if relative.is_empty() {
        return String::new();
    }
    if relative.starts_with("http") {
        return relative.to_string();
    }
    url::Url::parse(base)
        .and_then(|base_url| base_url.join(relative))
        .map(|u| u.to_string())
        .unwrap_or_else(|_| relative.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_wechat_cover_from_msg_cdn_url() {
        let html = r#"<script>var msg_cdn_url = "https://mmbiz.qpic.cn/cover.jpg";</script>"#;
        let cover = extract_wechat_cover(html);
        assert_eq!(cover.as_deref(), Some("https://mmbiz.qpic.cn/cover.jpg"));
    }
}
