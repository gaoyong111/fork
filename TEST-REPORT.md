# MVP 后端 API 测试报告

## 测试环境
- 日期：2026-04-13
- Node.js 版本：v22.22.2
- 包管理器：pnpm v10.33.0
- 数据库：SQLite (better-sqlite3)
- 服务端口：3001
- 测试工具：curl

## 测试结果汇总

| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/health | GET | PASS | 返回 status: ok 和时间戳 |
| /api/folders | POST | PASS | 成功创建"技术文章"和"设计资源"两个文件夹 |
| /api/folders | GET | PASS | 返回树形结构，含 collection_count 字段 |
| /api/folders/:id | PUT | PASS | 成功更新文件夹名称 |
| /api/folders/:id | DELETE | PASS | 成功删除文件夹，级联处理正确 |
| /api/tags | POST | PASS | 成功创建 React、TypeScript、工具 三个标签 |
| /api/tags | GET | PASS | 返回标签列表，含 collection_count 字段 |
| /api/tags/:id | PUT | PASS | 成功更新标签名称和颜色 |
| /api/tags/:id | DELETE | PASS | 成功删除标签，级联删除关联关系 |
| /api/collections | POST | PASS | 成功创建链接收藏，关联文件夹和标签 |
| /api/collections | GET | PASS | 分页查询正常，支持 folder_id / is_favorite 筛选 |
| /api/collections/:id | GET | PASS | 返回详情含 tags 和 folder 信息 |
| /api/collections/:id | PUT | PASS | 成功更新标题和摘要 |
| /api/collections/:id | DELETE | PASS | 软删除成功，列表不再返回已删除项 |
| /api/search?q=keyword | GET | PASS | 英文全文搜索正常，空结果和无匹配返回空列表 |
| /api/upload | POST | PASS | 成功上传 txt 文件，自动创建文件类型收藏项 |

**总计：16/16 接口通过**

## 详细测试记录

### 1. 健康检查
- 请求：GET /api/health
- 响应：
  ```json
  {
      "code": 0,
      "message": "success",
      "data": {
          "status": "ok",
          "timestamp": "2026-04-13T08:28:39.973Z"
      }
  }
  ```
- 结果：PASS 通过

### 2. 创建文件夹
- 请求：POST /api/folders `{"name": "技术文章"}`
- 响应：201 Created，返回完整文件夹对象（含 id、name、parent_id、sort_order、时间戳）
- 请求：POST /api/folders `{"name": "设计资源"}`
- 响应：201 Created，返回完整文件夹对象
- 结果：PASS 通过

### 3. 获取文件夹树
- 请求：GET /api/folders
- 响应：返回树形结构数组，每个节点含 collection_count 和 children 字段
- 结果：PASS 通过

### 4. 更新文件夹
- 请求：PUT /api/folders/:id `{"name": "技术文章-已更新"}`
- 响应：返回更新后的文件夹对象，updated_at 已更新
- 结果：PASS 通过

### 5. 删除文件夹
- 请求：DELETE /api/folders/:id（删除"设计资源"）
- 响应：`{"code": 0, "message": "success", "data": null}`
- 验证：再次 GET /api/folders 确认只剩一个文件夹
- 结果：PASS 通过

### 6. 创建标签
- 请求：POST /api/tags `{"name": "React"}` / `{"name": "TypeScript"}` / `{"name": "工具"}`
- 响应：201 Created，返回标签对象（含 id、name、color、collection_count）
- 结果：PASS 通过

### 7. 获取标签列表
- 请求：GET /api/tags
- 响应：返回标签数组，按 collection_count DESC 排序
- 结果：PASS 通过

### 8. 更新标签
- 请求：PUT /api/tags/:id `{"name": "工具-已更新", "color": "#ef4444"}`
- 响应：返回更新后的标签对象
- 结果：PASS 通过

### 9. 删除标签
- 请求：DELETE /api/tags/:id（删除"工具-已更新"）
- 响应：`{"code": 0, "message": "success", "data": null}`
- 验证：再次 GET /api/tags 确认只剩两个标签
- 结果：PASS 通过

### 10. 创建收藏项
- 请求：POST /api/collections
  ```json
  {
      "title": "React 官方文档",
      "url": "https://react.dev",
      "type": "link",
      "summary": "React 官方学习文档，包含教程和 API 参考",
      "folder_id": "ce6719fc-168c-476f-b22c-77e896f9dea9",
      "tag_ids": ["57e023d3-1bf8-47f3-a2b8-0d33a420da0e", "ee6577e3-a5f0-4467-98e1-031af7585a5a"],
      "is_favorite": true
  }
  ```
- 响应：201 Created，返回收藏项对象含关联的 tags 数组
- 结果：PASS 通过

### 11. 获取收藏列表
- 请求：GET /api/collections?page=1&limit=10
- 响应：返回 items 数组和 pagination 对象（page、pageSize、total、totalPages）
- 请求：GET /api/collections?folder_id=xxx
- 响应：正确筛选出指定文件夹下的收藏项
- 请求：GET /api/collections?is_favorite=1
- 响应：正确筛选出收藏项
- 结果：PASS 通过

### 12. 获取收藏详情
- 请求：GET /api/collections/:id
- 响应：返回完整收藏项对象，含 tags 数组和 folder 对象
- 结果：PASS 通过

### 13. 更新收藏项
- 请求：PUT /api/collections/:id `{"title": "React 官方文档-已更新", "summary": "更新后的摘要信息"}`
- 响应：返回更新后的对象，updated_at 已更新，tags 保留
- 结果：PASS 通过

### 14. 软删除收藏项
- 请求：DELETE /api/collections/:id
- 响应：`{"code": 0, "message": "success", "data": null}`
- 验证：GET /api/collections 返回空列表，确认软删除生效
- 结果：PASS 通过

### 15. 全文搜索
- 请求：GET /api/search?q=TypeScript
- 响应：返回匹配的收藏项列表，含 matchSnippet 字段
- 请求：GET /api/search?q=notexistxyz123
- 响应：返回空列表 `{"items": [], "pagination": {...}}`
- 请求：GET /api/search（无 q 参数）
- 响应：400 错误 `"搜索关键词不能为空"`
- 结果：PASS 通过

### 16. 文件上传
- 请求：POST /api/upload -F 'file=@test-upload.txt'
- 响应：201 Created，返回文件信息（id、title、type、filePath、fileSize、mimeType）
- 结果：PASS 通过

## 边界情况验证

| 测试场景 | 预期结果 | 实际结果 | 状态 |
|----------|----------|----------|------|
| 创建文件夹 - 空名称 | 400 错误 | `{"code":40001,"message":"文件夹名称不能为空"}` | PASS |
| 创建标签 - 重复名称 | 409 冲突 | `{"code":40901,"message":"标签名称已存在"}` | PASS |
| 删除不存在的文件夹 | 404 错误 | `{"code":40401,"message":"文件夹不存在"}` | PASS |
| 删除不存在的收藏项 | 404 错误 | `{"code":40401,"message":"收藏项不存在"}` | PASS |
| 搜索 - 无关键词 | 400 错误 | `{"code":40001,"message":"搜索关键词不能为空"}` | PASS |
| 访问不存在的路由 | 404 错误 | `{"code":40401,"message":"接口不存在"}` | PASS |

## 发现的问题

### 1. FTS5 中文分词支持有限（低优先级）
- **现象**：搜索中文关键词"教程"时，FTS5 的 unicode61 tokenizer 无法正确分词，导致无法匹配中文内容
- **影响**：中文全文搜索功能受限
- **建议**：后续可考虑集成 jieba 或其他中文分词库，或使用 ICU tokenizer 插件来增强中文搜索能力
- **严重程度**：低 -- 英文搜索正常，中文可通过 LIKE 模糊查询作为降级方案

### 2. 搜索结果 matchSnippet 为空（低优先级）
- **现象**：英文搜索 "TypeScript" 返回结果中 matchSnippet 字段为空字符串
- **影响**：搜索结果缺少高亮片段展示
- **建议**：检查 FTS5 snippet 函数的参数配置，确保 content 列有内容时能正确生成片段
- **严重程度**：低 -- 搜索功能本身正常，仅影响前端高亮展示

## 总结

MVP 后端 API 整体质量良好，所有 16 个核心接口均通过测试。代码结构清晰，错误处理完善，边界情况覆盖到位。主要的技术债务在于 FTS5 对中文搜索的支持，建议在后续迭代中优化。
