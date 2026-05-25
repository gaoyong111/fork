---
name: ux-search-interaction-design
description: 搜索增强 + 流畅交互：全局 Cmd+K 搜索面板、collectionStore 状态管理重构、乐观更新 + Undo Toast、精读实时更新
---

# Favorites UX 搜索增强 + 流畅交互 设计文档

日期: 2026-05-25
状态: 已确认

## 目标

解决两个核心 UX 问题：
1. 搜索体验弱 — 只有列表页 keyword 过滤，无全局搜索，丢失 snippet 高亮
2. 操作体验闪烁 — 每次操作后全量刷新，无乐观更新，无撤销能力，精读完成需手动刷新

## 方案选择

选择 **方案 A：Overlay Cmd+K**，理由：
- Cmd+K 是桌面端最自然的全局交互，与 Tauri 桌面应用契合
- 状态管理重构是根本解，其他方案只是在打补丁
- Undo Toast 让删除从"不可逆→去回收站找"变成"一键撤销"

## 架构总览

新增 `collectionStore`（Zustand）作为所有页面共享的数据层，取代各页面的独立 useState。

```
App Layer
├── SearchOverlay（Cmd+K 全局搜索面板，App 层级挂载）
├── Pages（list/detail/add/trash）— 从 collectionStore 读取数据
├── ToastProvider + Undo — Toast 扩展 action 按钮
│
├── collectionStore (NEW)
│   ├── collections[]
│   ├── filters/sort/page/viewMode
│   ├── loading
│   ├── pendingUndos[]
│
├── folderStore (现有)
├── tagStore (现有)
├── deepReadStore (现有 + 完成事件发布)
│
└── FavoritesApi (shared 包，接口不变)
    ├── HttpApi (server)
    └── TauriApi (desktop Rust)
```

shared 包 `FavoritesApi` 接口层完全不动。搜索面板和各页面通过同一 api 层调用后端。

## 全局搜索（Cmd+K）

### 交互流程

1. **唤起** — Cmd+K / Ctrl+K 全局快捷键，任何页面可用。ESC 或点击遮罩关闭
2. **输入** — 打开时光标自动聚焦输入框，300ms debounce 即时搜索
3. **结果** — 列表展示匹配项：favicon + 标题（关键词高亮）+ snippet（关键词高亮）+ 来源标签（链接/笔记/文件）
4. **导航** — 上/下箭头键选择，Enter 跳转到 `/collection/:id` 详情页
5. **空状态** — 无匹配显示"未找到结果"提示 + 建议放宽搜索

### 组件结构

```
SearchOverlay.tsx      — 遮罩层 + 面板容器，挂载在 App 顶层
SearchInput.tsx        — 输入框 + Cmd+K 提示徽章 + 清空按钮
SearchResults.tsx      — 结果列表 + 键盘导航逻辑
SearchResultItem.tsx   — 单条结果：favicon + 高亮标题 + 高亮 snippet
```

### 与页内搜索的关系

搜索面板和列表页 SearchBar 共存，职责不同：
- **Cmd+K 面板**：跨页快速定位，跳转到详情页
- **列表页 SearchBar**：页内过滤，停留在当前列表视图。也改为调用 `searchCollections`，但结果映射回列表格式

### 搜索 API 调用

搜索面板调用 `api.searchCollections(query)`，使用专用 FTS5 搜索端点，返回 `SearchResultItem`：

```ts
interface SearchResultItem {
    id: string;
    title: string;
    type: CollectionType;      // link/file/note
    matchSnippet: string;      // FTS5 snippet，关键词被 <mark> 包裹
    folderId: string | null;
    isFavorite: boolean;
}
```

## 状态管理重构

### collectionStore 设计

```ts
interface CollectionState {
    // 数据
    collections: Collection[];
    total: number;

    // 视图状态（从 URL params 初始化）
    filters: {
        folderId: string | null;
        tagId: string | null;
        keyword: string;
        isFavorite: boolean | null;
        sortBy: string;
        sortOrder: string;
    };
    page: number;
    pageSize: number;
    viewMode: 'grid' | 'list';

    // 加载状态
    loading: boolean;

    // 乐观操作追踪
    pendingUndos: UndoAction[];
}

interface UndoAction {
    id: string;
    type: 'delete' | 'move' | 'untag' | 'unfavorite';
    targetId: string;           // collection ID
    payload: Record<string, unknown>; // 原始数据，用于撤销
    expiresAt: number;          // 5秒后自动确认
}
```

### 乐观更新 + Undo 流程

以删除为例：

```
1. 用户点击删除
2. collectionStore 立即从 collections[] 中移除该条目 → UI 无延迟更新
3. Toast 弹出 "已删除 xxx" + [撤销] 按钮
4. pendingUndos 记录 UndoAction，5秒倒计时
5. 5秒后自动向后端发送 DELETE 请求

场景 A：5秒内无操作 → undo 自动过期，后端删除提交，数据一致
场景 B：用户点撤销 →
   - 从 UndoAction.payload 恢复条目到 collections[]
   - Toast 更新为 "已恢复 xxx"
   - 不发送 DELETE 请求
```

**关键设计：删除在 5 秒 Undo 窗口内不提交后端，过期后才发 DELETE。** 后端零改动。

### 各操作策略

| 操作 | UI 立即变化 | 后端时机 | Undo 方式 |
|------|-----------|----------|----------|
| 删除 | 移除条目 | 5秒后提交 DELETE | 恢复条目，不发 DELETE |
| 移动文件夹 | 更新 folderId | 立即 PATCH | 回退 folderId + 调 api.move 回原位置 |
| 取消收藏 | 更新 isFavorite | 立即 PATCH | 回退 + 调 api.toggleFavorite |
| 添加标签 | 更新 tags[] | 立即 POST | 移除标签 + 调 api.removeTag |

只有删除是延迟提交，其他操作立即提交后端 + 本地乐观更新 + 可撤销回调。

### 精读完成实时更新

```
deepReadStore 处理完一个 task →
  发布事件 { collectionId, content: summary } →
  collectionStore 收到事件 →
  更新对应条目的 content 字段 →
  UI 自动刷新
```

事件机制用 Zustand 的 `subscribe`，不引入新库。

## 后端改动

### Server (Express)

**搜索 API 增强** — `searchRoutes.ts` `/api/search`：

1. 返回字段扩展：增加 `type`、`folderId`、`isFavorite`
2. FTS5 snippet 标记改用 `<mark>` 标签：

```sql
snippet(collections_fts, 0, '<mark>', '</mark>', '...', 32)
```

约 10 行改动。

**删除 Undo** — 后端零改动。纯前端延迟提交策略。

**精读通知** — 无需后端通知机制。前端 deepReadStore 处理完成后直接更新 collectionStore。

### Desktop (Tauri Rust)

`search_cmds.rs` 同步 server 改动：

1. 搜索结果返回结构体增加 `type`、`folderId`、`isFavorite` 字段
2. FTS5 snippet 用 `<mark>` 标签

约 15 行改动。删除 Undo 同前端策略，后端零改动。

### Shared 包

`SearchResultItem` 类型扩展：

```ts
interface SearchResultItem {
    id: string;
    title: string;
    url: string;
    type: CollectionType;       // 新增
    folderId: string | null;    // 新增
    isFavorite: boolean;        // 新增
    matchSnippet: string;       // 内容改为 HTML with <mark>
}
```

`HttpApi` 和 `TauriApi` 的 `searchCollections` 实现调整返回映射。

约 5 行类型改动 + 各实现约 10 行映射改动。

## 改动量估算

| 包 | 改动内容 | 估算行数 |
|----|---------|---------|
| web | SearchOverlay 组件 (4文件) | ~300 |
| web | collectionStore (1文件) | ~250 |
| web | 页面组件适配 store (4页面) | ~200 |
| web | Toast 扩展 Undo | ~50 |
| web | 键盘快捷键注册 | ~30 |
| shared | SearchResultItem 类型 | ~15 |
| shared | HttpApi/TauriApi 映射 | ~20 |
| server | searchRoutes snippet + 字段 | ~10 |
| desktop (Rust) | search_cmds 结构体 + snippet | ~15 |
| **总计** | | **~880** |

## 成功标准

1. Cmd+K 在任何页面可唤起搜索面板，搜索结果含 `<mark>` 高亮 snippet
2. 删除/移动/取消收藏/添加标签 — UI 立即变化，无闪烁
3. 删除后 5 秒内可撤销，撤销后条目恢复
4. 精读完成后对应卡片 content 自动更新，无需手动刷新
5. 列表页 SearchBar 也使用 `searchCollections` API（不再用 keyword 参数过滤）
6. web 和 desktop 两端行为一致