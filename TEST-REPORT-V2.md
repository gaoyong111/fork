# 收藏夹项目联调测试报告 V2

## 测试环境
- 日期：2026-04-14
- Node.js 版本：v22.22.2
- 操作系统：Linux
- 包管理器：pnpm

## 构建验证
| 项目 | 结果 |
|------|------|
| 前端构建 (vite build) | PASS - 65 modules transformed, 0 errors, built in 632ms |
| 后端启动 (port 3001) | PASS - 服务正常启动，数据库初始化成功 |

## API 联调测试

### 基础接口
| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/health | GET | PASS | 返回 `{ code: 0, status: "ok" }` |

### 文件夹接口
| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/folders (创建根文件夹) | POST | PASS | 创建"技术文章"成功，返回 id |
| /api/folders (创建子文件夹) | POST | **FAIL** | 传入 `parentId` 但后端期望 `parent_id`，导致子文件夹创建为根文件夹（parent_id 为 null） |
| /api/folders (获取树形结构) | GET | **FAIL** | 子文件夹未嵌套在父文件夹的 children 中（因上一个问题导致） |

### 标签接口
| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/tags (创建 React) | POST | PASS (重复) | 标签已存在，返回 409 冲突（之前已创建） |
| /api/tags (创建 TypeScript) | POST | PASS (重复) | 标签已存在，返回 409 冲突（之前已创建） |
| /api/tags (获取列表) | GET | PASS | 返回 2 个标签，含 collection_count |

### 收藏项 CRUD
| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/collections (创建链接) | POST | PASS | 创建"React 官方文档"，关联文件夹和标签成功 |
| /api/collections (创建笔记) | POST | PASS | 创建"学习笔记"，关联 2 个标签成功 |
| /api/collections (获取列表) | GET | PASS | 返回分页数据，含标签信息 |
| /api/collections/:id (获取详情) | GET | PASS | 返回详情，含标签和所属文件夹信息 |
| /api/collections/:id (更新) | PUT | PASS | 标题更新为"React 官方文档（更新）"成功 |
| /api/collections/:id/favorite (星标切换) | POST | PASS | 第一次切换 0->1，第二次切换 1->0，均成功 |
| /api/collections/:id/move (移动) | POST | PASS | 移动到"设计资源"文件夹成功 |

### 批量操作
| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/collections/batch-delete | POST | PASS | 批量软删除 2 条记录，deletedCount=2 |

### 搜索
| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/search?q=React | GET | **FAIL** | total 返回 3 但 items 为空数组；FTS5 COUNT 查询未排除已软删除的记录 |

### 文件上传
| 接口 | 方法 | 状态 | 备注 |
|------|------|------|------|
| /api/upload | POST | PASS | 上传 test-upload.txt 成功，返回文件路径和元信息 |

## 新增功能文件检查
| 文件 | 存在 | 行数 |
|------|------|------|
| src/components/BatchActionBar.tsx | PASS | 101 行 |
| src/components/FolderSelector.tsx | PASS | 115 行 |
| src/components/TagPicker.tsx | PASS | 133 行 |
| src/hooks/useKeyboardShortcuts.ts | PASS | 78 行 |

## 发现的问题

### BUG-001: 文件夹创建接口字段命名不一致（严重）
- **接口**: POST /api/folders
- **现象**: 前端发送 `parentId`（camelCase），后端接口定义的是 `parent_id`（snake_case），导致子文件夹的 parent_id 始终为 null
- **影响**: 无法创建嵌套子文件夹，树形结构功能完全失效
- **根因**: 后端 `CreateFolderBody` 接口使用 `parent_id`，前端可能使用 `parentId`，两者命名风格不统一
- **建议**: 统一前后端字段命名规范，要么全部使用 camelCase（前端友好），要么全部使用 snake_case（数据库友好），并在中间件层做转换

### BUG-002: 搜索接口 total 计数不准确（中等）
- **接口**: GET /api/search?q=keyword
- **现象**: FTS5 的 COUNT 查询返回 total=3，但实际 items 为空数组
- **影响**: 前端分页组件会显示错误的页码信息
- **根因**: `searchRoutes.ts` 第 112-114 行的 COUNT 查询直接统计 FTS5 匹配数，未加 `is_deleted = 0` 条件，导致已软删除的记录也被计入总数
- **建议**: 将 COUNT 查询改为 JOIN collections 表并加上 `is_deleted = 0` 过滤条件

### BUG-003: move 接口请求体命名风格与其他接口不一致（低）
- **接口**: POST /api/collections/:id/move
- **现象**: `MoveCollectionBody` 接口使用 `folderId`（camelCase），而其他收藏项接口（创建、更新）使用 `folder_id`（snake_case）
- **影响**: 前端需要针对不同接口使用不同的字段命名，增加维护成本
- **建议**: 统一所有接口的请求体字段命名风格

## 测试总结

| 类别 | 通过 | 失败 | 总计 |
|------|------|------|------|
| 基础接口 | 1 | 0 | 1 |
| 文件夹接口 | 1 | 2 | 3 |
| 标签接口 | 3 | 0 | 3 |
| 收藏项 CRUD | 7 | 0 | 7 |
| 批量操作 | 1 | 0 | 1 |
| 搜索 | 0 | 1 | 1 |
| 文件上传 | 1 | 0 | 1 |
| **合计** | **14** | **3** | **17** |

**通过率: 82.4% (14/17)**

核心 CRUD 功能（创建、读取、更新、删除、星标、移动、批量删除、上传）全部正常。主要问题集中在字段命名规范不一致（BUG-001、BUG-003）和搜索计数逻辑缺陷（BUG-002）。
