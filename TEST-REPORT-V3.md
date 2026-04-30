# 收藏夹项目端到端测试报告 V3

## 测试环境
- 日期：2026-04-15
- Node.js: v22.22.2
- pnpm: 10.33.0
- 后端端口：3001
- 数据库：SQLite (better-sqlite3) + FTS5 全文搜索

## 构建验证

| 项目 | 结果 |
|------|------|
| 后端启动 (pnpm dev:server) | PASS - 服务正常启动，GET /api/health 返回 200 |
| 前端构建 (npx vite build) | PASS - 70 modules, 607ms, 无错误 |

## 测试结果汇总

| 场景 | 测试项 | 状态 | 备注 |
|------|--------|------|------|
| A | 创建根文件夹[技术] | PASS | 返回 201，id 正确生成 |
| A | 创建子文件夹[前端] | PASS | parentId 正确指向"技术"文件夹 |
| A | 创建根文件夹[设计] | PASS | 返回 201 |
| A | 验证树形结构 | PASS | 根节点包含"技术"，"前端"作为"技术"的 children 正确返回 |
| A | 更新文件夹名称[设计->UI设计] | PASS | PUT 返回 200，name 字段已更新 |
| A | 删除文件夹[UI设计] | PASS | DELETE 返回 200，级联删除正常 |
| B | 创建标签[React] | PASS | 返回 201，color=#61dafb 正确 |
| B | 创建标签[TypeScript] | PASS | 返回 201 |
| B | 创建标签[工具] | PASS | 返回 201 |
| B | 验证标签列表 | PASS | 共 3 个标签，均包含 collection_count 字段 |
| C | 创建链接收藏[React官方文档] | PASS | type=link, folder_id 正确, tags=1 |
| C | 创建笔记收藏[学习笔记] | PASS | type=note, tags=2 (React + TypeScript) |
| C | 验证收藏列表 | PASS | items=2, snake_case 字段正确 (created_at/is_favorite/folder_id), 分页结构完整 |
| C | 验证收藏详情 | PASS | title 正确，folder 对象包含 id 和 name |
| C | 更新收藏标题 | PASS | PUT 返回 200，标题已更新为"React 官方文档 (已更新)" |
| C | 切换星标(两次) | PASS | is_favorite: 0->1->0，切换逻辑正确 |
| C | 移动收藏到文件夹 | PASS | folder_id 已更新为"前端"文件夹 id |
| D | 分页第1页 (page=1&limit=2) | PASS | items=2, total=6, totalPages=3, page=1 |
| D | 分页第2页 (page=2&limit=2) | PASS | items=2, page=2 |
| E | 排序[created_at ASC] | PASS | 时间升序正确，首条 <= 末条 |
| E | 排序[title ASC] | PASS | 标题按 A-Z 排序正确 |
| E | 排序[updated_at DESC] | PASS | 更新时间降序正确 |
| F | 搜索[React] | PASS | 找到 2 条结果 (标题+内容匹配)，分页结构正确 |
| G | 批量删除 | PASS | deletedCount=2，软删除正确 |
| H | 文件上传 | PASS | type=file, filePath 正确返回，文件已存储 |
| I | 404-收藏项不存在 | PASS | HTTP 404，message="收藏项不存在" |
| I | 400-空标题 | PASS | HTTP 400，message="标题不能为空" |
| I | 409-重复标签名 | PASS | HTTP 409，message="标签名称已存在" |
| I | 400-空搜索关键词 | PASS | HTTP 400，message="搜索关键词不能为空" |

**总计：29/29 PASS，0 FAIL**

## 发现的问题

### 1. [低] FTS5 搜索 matchSnippet 偶尔为空
- **现象**：搜索 "React" 时返回结果中 `matchSnippet` 为空字符串，搜索 "Hooks" 时同样为空
- **原因**：FTS5 的 `snippet()` 函数在匹配列（content）有内容但匹配位置特殊时可能返回空
- **影响**：前端搜索结果无法展示高亮片段，但不影响搜索准确性
- **建议**：检查 `snippet(collections_fts, 2, '<mark>', '</mark>', '...', 32)` 的参数配置，或在前端对空 snippet 做 fallback 处理（截取 content 前 N 字符）

## 闪光点

1. **前后端字段兼容性设计优秀**：后端同时接受 camelCase 和 snake_case 请求参数（如 `folderId` / `folder_id`、`tagIds` / `tag_ids`），前端转换层处理响应的 snake_case -> camelCase 转换，两层兼容确保了健壮性
2. **分页与排序实现完善**：白名单校验防止 SQL 注入，默认值处理合理，排序结果验证通过
3. **错误处理规范**：400/404/409 状态码使用准确，错误信息清晰（中文），覆盖了空标题、重复标签、不存在资源、空搜索等边界场景
4. **树形文件夹结构**：递归构建树 + 级联删除 + collection_count 统计，逻辑完整
5. **FTS5 全文搜索**：带触发器自动同步、查询转义防注入、支持分页和筛选
6. **软删除设计**：收藏项使用 `is_deleted` 标记，支持未来回收站功能
