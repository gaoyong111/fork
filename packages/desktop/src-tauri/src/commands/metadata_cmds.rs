use crate::db::models::MetadataResult;
use reqwest;
use scraper::{Html, Selector};

const MAX_RESPONSE_SIZE: usize = 500 * 1024;
const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[tauri::command]
pub async fn fetch_metadata(url: String) -> Result<MetadataResult, String> {
    // URL 格式校验
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(MetadataResult { title: "".to_string(), description: "".to_string(), cover_url: "".to_string(), favicon: "".to_string() });
    }

    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let content_type = response.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
        return Ok(MetadataResult { title: "".to_string(), description: "".to_string(), cover_url: "".to_string(), favicon: "".to_string() });
    }

    // 限制响应体大小
    let body = response.bytes().await.map_err(|e| e.to_string())?;
    let html_bytes = if body.len() > MAX_RESPONSE_SIZE {
        &body[..MAX_RESPONSE_SIZE]
    } else {
        &body[..]
    };

    let html_str = String::from_utf8_lossy(html_bytes).to_string();
    let base_url = url.clone();

    Ok(extract_metadata_from_html(&html_str, &base_url))
}

fn extract_metadata_from_html(html: &str, page_url: &str) -> MetadataResult {
    let document = Html::parse_document(html);
    let base_url_parsed = url::Url::parse(page_url).ok();

    // 提取 title
    let title = select_text(&document, "title")
        .or_else(|| select_attr(&document, "meta[property='og:title']", "content"))
        .unwrap_or_default();

    // 提取 description
    let description = select_attr(&document, "meta[property='og:description']", "content")
        .or_else(|| select_attr(&document, "meta[name='description']", "content"))
        .or_else(|| select_attr(&document, "meta[name='twitter:description']", "content"))
        .unwrap_or_default();

    // 提取 coverUrl
    let cover_url = select_attr(&document, "meta[property='og:image']", "content")
        .or_else(|| select_attr(&document, "meta[name='twitter:image']", "content"))
        .unwrap_or_default();

    // 提取 favicon
    let favicon = select_attr(&document, "link[rel='icon']", "href")
        .or_else(|| select_attr(&document, "link[rel='shortcut icon']", "href"))
        .or_else(|| select_attr(&document, "link[rel='apple-touch-icon']", "href"))
        .unwrap_or_else(|| {
            base_url_parsed.as_ref()
                .map(|u| format!("{}://{}", u.scheme(), u.host_str().unwrap_or("")))
                .map(|origin| format!("{}/favicon.ico", origin))
                .unwrap_or_default()
        });

    // 将相对路径转为绝对路径
    let cover_url_abs = resolve_url(&cover_url, page_url);
    let favicon_abs = resolve_url(&favicon, page_url);

    MetadataResult {
        title: title.trim().to_string(),
        description: description.trim().to_string(),
        cover_url: cover_url_abs,
        favicon: favicon_abs,
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
    if relative.starts_with("http") {
        return relative.to_string();
    }
    url::Url::parse(base)
        .and_then(|base_url| base_url.join(relative))
        .map(|u| u.to_string())
        .unwrap_or_else(|_| relative.to_string())
}