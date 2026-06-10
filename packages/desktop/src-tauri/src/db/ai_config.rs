use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize, Clone, Default)]
struct MaxTokensConfig {
    chunk: u32,
    full: u32,
    #[serde(default)]
    merge: u32,
    #[serde(default)]
    refine: u32,
}

#[derive(Deserialize, Clone)]
struct PromptsConfig {
    full: String,
    chunk: String,
    merge: String,
}

#[derive(Deserialize, Clone)]
struct TemplateMeta {
    label: String,
    prompts: PromptsConfig,
}

#[derive(Deserialize, Clone, Default)]
struct BriefModeConfig {
    #[serde(rename = "maxTokens", default)]
    max_tokens: MaxTokensConfig,
    #[serde(rename = "refinePrompt", default)]
    refine_prompt: String,
    #[serde(default)]
    prompts: Option<PromptsConfig>,
    #[serde(default)]
    templates: HashMap<String, TemplateMeta>,
}

#[derive(Deserialize, Clone)]
struct DeepReadConfig {
    #[serde(rename = "chunkThreshold")]
    chunk_threshold: usize,
    #[serde(rename = "chunkSize")]
    chunk_size: usize,
    #[serde(rename = "chunkConcurrency")]
    chunk_concurrency: usize,
    #[serde(rename = "minContentLength")]
    min_content_length: usize,
    #[serde(rename = "minParagraphCount")]
    min_paragraph_count: usize,
    #[serde(rename = "fetchTimeoutMs")]
    fetch_timeout_ms: u64,
    #[serde(rename = "aiTimeoutMs")]
    ai_timeout_ms: u64,
    #[serde(rename = "maxHtmlSizeBytes")]
    max_html_size_bytes: usize,
    #[serde(rename = "maxTokens")]
    max_tokens: MaxTokensConfig,
    temperature: f64,
    #[serde(rename = "userMessagePrefix")]
    user_message_prefix: String,
    #[serde(rename = "refinePrompt", default)]
    refine_prompt: String,
    prompts: PromptsConfig,
    #[serde(default)]
    templates: HashMap<String, TemplateMeta>,
    #[serde(default)]
    brief: BriefModeConfig,
}

static DEEP_READ_CONFIG: Lazy<DeepReadConfig> = Lazy::new(|| {
    serde_json::from_str(include_str!("../../../../shared/src/ai/deep-read.json"))
        .expect("deep-read.json 解析失败")
});

pub fn chunk_threshold() -> usize {
    DEEP_READ_CONFIG.chunk_threshold
}

pub fn chunk_size() -> usize {
    DEEP_READ_CONFIG.chunk_size
}

pub fn chunk_concurrency() -> usize {
    DEEP_READ_CONFIG.chunk_concurrency.max(1)
}

pub fn min_content_length() -> usize {
    DEEP_READ_CONFIG.min_content_length
}

pub fn min_paragraph_count() -> usize {
    DEEP_READ_CONFIG.min_paragraph_count
}

pub fn fetch_timeout() -> std::time::Duration {
    std::time::Duration::from_millis(DEEP_READ_CONFIG.fetch_timeout_ms)
}

pub fn ai_timeout() -> std::time::Duration {
    std::time::Duration::from_millis(DEEP_READ_CONFIG.ai_timeout_ms)
}

pub fn max_html_size() -> usize {
    DEEP_READ_CONFIG.max_html_size_bytes
}

fn max_tokens_config(summary_mode: &str) -> &MaxTokensConfig {
    if summary_mode == "brief" && DEEP_READ_CONFIG.brief.max_tokens.chunk > 0 {
        &DEEP_READ_CONFIG.brief.max_tokens
    } else {
        &DEEP_READ_CONFIG.max_tokens
    }
}

pub fn max_tokens(summary_mode: &str, is_chunk: bool, is_refine: bool, is_merge: bool) -> u32 {
    let tokens = max_tokens_config(summary_mode);
    if is_refine {
        let refine = tokens.refine;
        if refine > 0 {
            return refine;
        }
    }
    if is_merge {
        let merge = tokens.merge;
        if merge > 0 {
            return merge;
        }
    }
    if is_chunk {
        tokens.chunk
    } else {
        tokens.full
    }
}

pub fn temperature() -> f64 {
    DEEP_READ_CONFIG.temperature
}

pub fn user_message_prefix() -> &'static str {
    &DEEP_READ_CONFIG.user_message_prefix
}

pub fn refine_prompt(summary_mode: &str) -> String {
    if summary_mode == "brief" && !DEEP_READ_CONFIG.brief.refine_prompt.is_empty() {
        return DEEP_READ_CONFIG.brief.refine_prompt.clone();
    }
    DEEP_READ_CONFIG.refine_prompt.clone()
}

pub fn template_prompt(template_type: &str, mode: &str, summary_mode: &str) -> String {
    let use_brief = summary_mode == "brief";
    let brief = &DEEP_READ_CONFIG.brief;

    if use_brief {
        if let Some(t) = brief.templates.get(template_type) {
            match mode {
                "chunk" => return t.prompts.chunk.clone(),
                "merge" => return t.prompts.merge.clone(),
                _ => return t.prompts.full.clone(),
            }
        }
        if let Some(prompts) = &brief.prompts {
            return match mode {
                "chunk" => prompts.chunk.clone(),
                "merge" => prompts.merge.clone(),
                _ => prompts.full.clone(),
            };
        }
    }

    if let Some(t) = DEEP_READ_CONFIG.templates.get(template_type) {
        match mode {
            "chunk" => return t.prompts.chunk.clone(),
            "merge" => return t.prompts.merge.clone(),
            _ => return t.prompts.full.clone(),
        }
    }
    match mode {
        "chunk" => DEEP_READ_CONFIG.prompts.chunk.clone(),
        "merge" => DEEP_READ_CONFIG.prompts.merge.clone(),
        _ => DEEP_READ_CONFIG.prompts.full.clone(),
    }
}

pub fn detect_template_type(url: &str, html: Option<&str>) -> String {
    if url.contains("mp.weixin.qq.com") {
        return "wechat".to_string();
    }
    let lower = html.unwrap_or("").to_lowercase();
    let path = url.to_lowercase();

    if path.contains("tutorial")
        || path.contains("docs.")
        || path.contains("guide")
        || path.contains("wiki")
        || lower.contains("<code")
        || lower.contains("<pre>")
    {
        return "tutorial".to_string();
    }
    if path.contains("news") || path.contains("thepaper") || lower.contains("publish-time") {
        return "news".to_string();
    }
    if path.contains("medium.com")
        || path.contains("blog")
        || path.contains("zhihu.com/p/")
        || path.contains("juejin.cn")
    {
        return "blog".to_string();
    }
    "general".to_string()
}
