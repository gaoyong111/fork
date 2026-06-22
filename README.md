# Favorites - 全平台个人收藏管理系统

统一管理网页书签、文件、笔记等多种类型的收藏内容。支持 Web 浏览器访问和 Tauri 桌面端，数据本地存储，无需账号即可使用。

## 功能特性

### 收藏与管理

- **网页收藏** — 收藏链接，自动抓取标题、描述和缩略图
- **文件上传** — 支持拖拽上传 PDF、图片、文档等文件
- **笔记收藏** — 创建和收藏文本 / Markdown 笔记
- **文件夹分类** — 树形多级文件夹，支持拖拽排序；筛选父文件夹时自动包含子文件夹内容
- **标签系统** — 多标签分类，支持标签筛选与组合查询
- **星标 / 归档 / 阅读统计** — 星标收藏、归档降噪、自动记录阅读次数
- **回收站** — 软删除与恢复，删除操作支持 Undo 撤销

### 浏览与搜索

- **列表 / 卡片双视图** — 列表模式适合快速扫读，卡片模式支持小 / 中两档尺寸
- **全文搜索** — 基于 SQLite FTS5，列表页关键词过滤
- **全局搜索（Cmd+K）** — 任意页面唤起搜索面板，支持键盘导航与 snippet 高亮
- **虚拟滚动** — 大列表流畅渲染，滚动位置自动恢复
- **筛选状态保持** — 从详情返回列表时保留文件夹、标签等筛选条件

### AI 精读

- **网页精读** — 抓取原文并生成结构化摘要，支持多种摘要模板
- **精读队列** — 后台排队处理，卡片和详情页实时展示进度
- **标题回填** — 精读完成后自动补全仅有域名的占位标题
- **元数据状态标记** — 抓取失败、信息不完整等情况在列表中可见

### 数据与部署

- **导入 / 导出** — JSON 全量备份、HTML 书签互导
- **数据管理** — 桌面端支持本地数据库备份与恢复、存储空间查看
- **PWA** — Web 端可安装到桌面
- **剪贴板检测** — 自动检测剪贴板 URL，快速收藏
- **Docker 部署** — 一键容器化部署

## 架构

项目采用 **desktop-first** 双运行时架构：Web 端通过 Express API 访问 SQLite，桌面端通过 Tauri + Rust 直接操作本地数据库。前端共用同一套 React 代码，通过 `@favorites/shared` 中的 `FavoritesApi` 抽象层适配不同后端。

```
┌─────────────┐     HttpApi      ┌─────────────┐
│  packages/  │ ───────────────► │  packages/  │
│    web      │                  │   server    │ ──► SQLite
└─────────────┘                  └─────────────┘
       │
       │ TauriApi
       ▼
┌─────────────┐
│  packages/  │ ──► SQLite（本地）
│   desktop   │
└─────────────┘
       ▲
       │ 共用
┌─────────────┐
│  packages/  │  类型、API 契约、AI 逻辑、Schema
│   shared    │
└─────────────┘
```

## 技术栈

| 层级 | 技术 |
|------|------|
| Web 前端 | React 18 + TypeScript + Vite + Zustand |
| 桌面端 | Tauri 2 + Rust |
| 后端 | Express 5 + TypeScript |
| 数据库 | SQLite + FTS5 |
| 共享层 | pnpm workspace + FavoritesApi 适配器 |
| 包管理 | pnpm >= 9 |

## 项目结构

```
favorites/
├── packages/
│   ├── web/          # Web 前端（React SPA）
│   ├── server/       # Node.js 后端 API
│   ├── desktop/      # Tauri 桌面端（复用 web 构建产物）
│   └── shared/       # 共享类型、API 契约、AI 逻辑、数据库 Schema
├── docs/             # 设计文档
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

## 快速开始

### 环境要求

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- 桌面端额外需要 [Rust](https://www.rust-lang.org/tools/install) 和对应平台的 Tauri 构建依赖

### 安装依赖

```bash
pnpm install
```

### Web 开发

```bash
# 终端 1：后端 API
pnpm dev:server

# 终端 2：前端
pnpm dev:web
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001/api

### 桌面端开发

```bash
# 需先启动 web dev server（Tauri 开发模式加载 localhost:5173）
pnpm dev:web
pnpm dev:desktop
```

### 构建

```bash
pnpm build:web       # 构建 Web 前端
pnpm build:server    # 构建后端
pnpm build:desktop   # 构建桌面安装包（含 web 构建）
```

## API 接口

| 模块 | 路径前缀 | 说明 |
|------|---------|------|
| 收藏项 | `/api/collections` | CRUD、批量操作、星标、归档、阅读计数 |
| 文件夹 | `/api/folders` | CRUD、树形结构 |
| 标签 | `/api/tags` | CRUD |
| 搜索 | `/api/search` | FTS5 全文搜索 |
| 上传 | `/api/upload` | 文件上传 |
| 元数据 | `/api/metadata` | URL 元数据抓取 |
| 回收站 | `/api/trash` | 查看、恢复、永久删除、清空 |
| 导入 | `/api/import` | JSON / HTML 书签导入 |
| 导出 | `/api/export` | JSON / HTML 书签导出 |
| AI | `/api/ai` | 网页精读 |

## Docker 部署

### 快速启动

```bash
# 构建并启动
docker-compose up -d

# 或者使用 pnpm 脚本
pnpm docker:build
pnpm docker:up
```

启动后访问 http://localhost:3000

### 生产部署（Nginx 反向代理）

使用 Nginx 作为前端静态文件服务器和反向代理，提供更好的性能和安全性：

```bash
docker-compose -f docker-compose.prod.yml up -d
```

启动后访问 http://localhost

### 停止服务

```bash
docker-compose down

# 生产环境
docker-compose -f docker-compose.prod.yml down
```

### 数据备份

数据通过 Docker volumes 持久化，备份和恢复方法：

```bash
# 备份数据库
docker cp favorites-favorites-1:/app/data ./backup-data

# 备份上传文件
docker cp favorites-favorites-1:/app/uploads ./backup-uploads

# 恢复数据
docker cp ./backup-data/. favorites-favorites-1:/app/data/
docker cp ./backup-uploads/. favorites-favorites-1:/app/uploads/
```

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 后端服务端口（容器内部） | `3001` |

## License

MIT
