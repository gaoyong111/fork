use serde::{Deserialize, Serialize};

/// 标签
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collection_count: Option<i64>,
    pub created_at: String,
}

/// 文件夹
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collection_count: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<Folder>>,
}

/// 文件夹简要信息（用于 Collection 中的 folder 字段）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderBrief {
    pub id: String,
    pub name: String,
}

/// 收藏项
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub title: String,
    #[serde(rename = "description")]
    pub summary: Option<String>,
    pub url: Option<String>,
    #[serde(rename = "type")]
    pub rtype: String,
    pub content: Option<String>,
    #[serde(rename = "thumbnailUrl")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub folder_id: Option<String>,
    pub is_favorite: bool,
    pub is_archived: bool,
    pub read_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<FolderBrief>,
}

/// 搜索结果项
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultItem {
    pub id: String,
    pub title: String,
    #[serde(rename = "description")]
    pub summary: Option<String>,
    #[serde(rename = "type")]
    pub rtype: String,
    pub url: Option<String>,
    #[serde(rename = "thumbnailUrl")]
    pub cover_url: Option<String>,
    pub folder_id: Option<String>,
    pub is_favorite: bool,
    pub created_at: String,
    pub tags: Vec<Tag>,
    pub match_snippet: Option<String>,
}

/// 分页信息
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
    pub total_pages: i64,
}

/// 分页数据
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedData<T: Serialize> {
    pub items: Vec<T>,
    pub pagination: Pagination,
}

// ==================== 请求参数 ====================

/// 创建收藏项参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCollectionParams {
    pub title: String,
    pub description: Option<String>,
    pub url: Option<String>,
    #[serde(rename = "type")]
    pub rtype: Option<String>,
    pub content: Option<String>,
    pub thumbnail_url: Option<String>,
    pub folder_id: Option<String>,
    pub tag_ids: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
}

/// 更新收藏项参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCollectionParams {
    pub title: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    #[serde(rename = "type")]
    pub rtype: Option<String>,
    pub content: Option<String>,
    pub thumbnail_url: Option<String>,
    pub folder_id: Option<String>,
    pub tag_ids: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
}

/// 获取收藏列表查询参数
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GetCollectionsParams {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    #[serde(rename = "type")]
    pub rtype: Option<String>,
    pub folder_id: Option<String>,
    pub tag_id: Option<String>,
    pub is_favorite: Option<bool>,
    pub is_archived: Option<bool>,
    pub keyword: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

/// 创建文件夹参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderParams {
    pub name: String,
    pub parent_id: Option<String>,
}

/// 更新文件夹参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFolderParams {
    pub name: Option<String>,
    pub parent_id: Option<String>,
    pub sort_order: Option<i64>,
}

/// 创建标签参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTagParams {
    pub name: String,
    pub color: Option<String>,
}

/// 更新标签参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTagParams {
    pub name: Option<String>,
    pub color: Option<String>,
}

/// 搜索参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub q: String,
    #[serde(rename = "type")]
    pub rtype: Option<String>,
    pub folder_id: Option<String>,
    pub tag_id: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// 上传结果
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub rtype: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub created_at: String,
}

/// 元数据提取结果
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetadataResult {
    pub title: String,
    pub description: String,
    pub cover_url: String,
    pub favicon: String,
}

/// 导入结果
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub folders_created: i64,
    pub tags_created: i64,
    pub collections_created: i64,
    pub collections_skipped: i64,
}

/// 回收站查询参数
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrashParams {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}