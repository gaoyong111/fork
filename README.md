# Favorites - 全平台个人收藏管理系统

统一管理网页书签、文件、笔记等多种类型的收藏内容，支持文件夹分类、标签系统、全文搜索和多端同步。

## 功能特性

- **网页收藏** - 收藏网页链接，自动提取标题和描述
- **文件上传** - 支持拖拽上传 PDF、图片、文档等文件
- **笔记收藏** - 创建和收藏文本/Markdown 笔记
- **文件夹分类** - 树形文件夹结构，支持多级嵌套和拖拽排序
- **标签系统** - 多标签维度分类，支持标签筛选和组合查询
- **全文搜索** - 基于 SQLite FTS5 的全文检索
- **批量操作** - 批量删除、移动、打标签
- **PWA 支持** - 可安装到桌面，支持离线访问
- **剪贴板检测** - 自动检测剪贴板 URL，快速收藏

## 技术栈

| 层级 | 技术 |
|------|------|
| Web 前端 | React 18 + TypeScript + Vite |
| 桌面端 | Tauri 2 |
| 后端 | Express 5 + TypeScript |
| 数据库 | SQLite + FTS5 |
| 包管理 | pnpm workspace |

## 项目结构

```
favorites/
├── packages/
│   ├── web/          # Web 前端应用
│   ├── server/       # Node.js 后端 API
│   └── desktop/      # Tauri 桌面端（复用 web 代码）
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

## 快速开始

### 环境要求

- Node.js >= 22.0.0
- pnpm >= 9.0.0

### 安装依赖

```bash
pnpm install
```

### 启动开发服务

```bash
# 同时启动前端和后端
pnpm dev:web
pnpm dev:server
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001/api

### 构建桌面端

```bash
pnpm build:desktop
```

## API 接口

| 模块 | 路径前缀 | 说明 |
|------|---------|------|
| 收藏项 | `/api/collections` | CRUD、批量删除、星标、移动 |
| 文件夹 | `/api/folders` | CRUD、树形结构 |
| 标签 | `/api/tags` | CRUD |
| 搜索 | `/api/search` | 全文搜索 |
| 上传 | `/api/upload` | 文件上传 |

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
