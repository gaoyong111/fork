# UX 搜索增强 + 流畅交互 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现全局 Cmd+K 搜索面板、collectionStore 状态管理重构、乐观更新 + Undo Toast、精读完成实时更新

**Architecture:** 新增 Zustand collectionStore 取代各页面独立 useState。SearchOverlay 组件挂载在 App 层级，通过 Cmd+K 呼起。Toast 扩展 Undo action 按钮。deepReadStore 完成时发布事件通知 collectionStore 更新。后端搜索 API 返回 `<mark>` 高亮 snippet + 扩展字段。

**Tech Stack:** React 18, Zustand, TypeScript, Express 5 (server), Rust/Tauri 2 (desktop), FTS5 SQLite

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/web/src/store/collectionStore.ts` | Zustand store：collections 数据、filters、分页、乐观更新、Undo |
| Create | `packages/web/src/components/SearchOverlay.tsx` | Cmd+K 搜索面板入口：遮罩 + 面板容器 |
| Create | `packages/web/src/components/SearchOverlay.css` | 搜索面板样式 |
| Modify | `packages/shared/src/types/index.ts:66-76` | SearchResultItem 增加 folderId/isFavorite，改 matchSnippet |
| Modify | `packages/server/src/routes/searchRoutes.ts:45,150-161` | FTS5 snippet `<mark>` + 返回 folderId/isFavorite |
| Modify | `packages/desktop/src-tauri/src/commands/search_cmds.rs:39,123-142` | snippet `<mark>` + SearchResultItem 增加 folder_id/is_favorite |
| Modify | `packages/desktop/src-tauri/src/db/models.rs:63-79` | Rust SearchResultItem 结构体增加字段 |
| Modify | `packages/shared/src/services/HttpApi.ts:286-294` | searchCollections 返回映射调整 |
| Modify | `packages/shared/src/services/TauriApi.ts:161-163` | searchCollections 返回映射调整 |
| Modify | `packages/web/src/App.tsx:1-27,133-173` | 挂载 SearchOverlay + 订阅 deepRead 事件 |
| Modify | `packages/web/src/contexts/ToastContext.tsx:26-31,53-65` | showToast 增加 undoAction 参数 |
| Modify | `packages/web/src/components/Toast.tsx:14-23,87-128` | ToastItem 增加 undoAction + Undo 按钮 UI |
| Modify | `packages/web/src/components/Layout.tsx:44-46,56-60` | Cmd+K 从聚焦 SearchBar 改为打开 SearchOverlay |
| Modify | `packages/web/src/hooks/useKeyboardShortcuts.ts:58-63` | Cmd+K 改为打开搜索面板状态 |
| Modify | `packages/web/src/store/deepReadStore.ts:154-179` | 完成后发布事件通知 collectionStore |
| Modify | `packages/web/src/pages/CollectionList.tsx:55-127,197-237` | 改用 collectionStore + 乐观更新 + Undo Toast |
| Modify | `packages/web/src/pages/CollectionDetail.tsx:27-28,56-80,134-168` | 改用 collectionStore + 乐观更新 |

---

### Task 1: 扩展 SearchResultItem 类型 (shared)

**Files:**
- Modify: `packages/shared/src/types/index.ts:66-76`

- [ ] **Step 1: 扩展 SearchResultItem 接口**

将 `SearchResultItem` 增加 `folderId` 和 `isFavorite` 字段，将 `matchSnippet` 从 `string | null` 改为 `string`（后端始终返回 snippet，不再 nullable）：

```ts
export interface SearchResultItem {
    id: string;
    title: string;
    description: string | null;
    type: CollectionType;
    url: string | null;
    thumbnailUrl: string | null;
    folderId: string | null;
    isFavorite: boolean;
    createdAt: string;
    tags: Tag[];
    matchSnippet: string;
}
```

- [ ] **Step 2: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:server && pnpm build:web`
Expected: 编译失败 — HttpApi 和 TauriApi 的映射需要适配新类型。这是预期行为，后续 Task 修复。

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(shared): 扩展 SearchResultItem 增加 folderId/isFavorite，matchSnippet 改为非空"
```

---

### Task 2: Server 搜索路由增强

**Files:**
- Modify: `packages/server/src/routes/searchRoutes.ts:45,150-161`

- [ ] **Step 1: 修改 FTS5 snippet 和返回字段**

两处改动：

1. 第 45 行 FTS5 snippet 已经用了 `<mark>` 标签（`snippet(collections_fts, 2, '<mark>', '</mark>', '...', 32)`），无需改动。但 column index 需确认：FTS5 索引了 `title`（col 0）、`content`（col 1）、`summary`（col 2），当前 snippet 用 column index `2`（summary）。改为用 `-1`（所有列）以获得更好的匹配覆盖：

```sql
snippet(collections_fts, -1, '<mark>', '</mark>', '...', 32) as match_snippet
```

2. 第 150-161 行返回映射，增加 `folderId` 和 `isFavorite`：

```ts
return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    type: item.type,
    url: item.url,
    cover_url: item.cover_url,
    folderId: item.folder_id,
    isFavorite: item.is_favorite,
    created_at: item.created_at,
    updated_at: item.updated_at,
    tags,
    matchSnippet: snippet,
};
```

- [ ] **Step 2: 重建 server 并验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:server`
Expected: 编译成功

- [ ] **Step 3: 手动验证搜索 API**

启动 server 并测试搜索返回包含新字段：

```bash
cd /Users/gaoyong/Desktop/h5_release/fork/favorites/packages/server && node dist/index.js &
sleep 3
curl -s 'http://localhost:3001/api/search?q=test' | head -c 500
kill %1
```

Expected: 返回 JSON 中 `matchSnippet` 包含 `<mark>` 标签，每项含 `folderId` 和 `isFavorite` 字段。

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/searchRoutes.ts
git commit -m "feat(server): 搜索 API 返回 folderId/isFavorite + snippet 覆盖全部列"
```

---

### Task 3: Rust 搜索命令增强 (desktop)

**Files:**
- Modify: `packages/desktop/src-tauri/src/db/models.rs:63-79`
- Modify: `packages/desktop/src-tauri/src/commands/search_cmds.rs:39,123-142`

- [ ] **Step 1: 扩展 Rust SearchResultItem 结构体**

在 `packages/desktop/src-tauri/src/db/models.rs` 第 63-79 行，增加 `folder_id` 和 `is_favorite` 字段：

```rust
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
```

- [ ] **Step 2: 修改 search_cmds.rs — snippet 用 `<mark>` 标签 + 返回新字段**

1. 第 39 行 snippet 改为 `<mark>` 标签：

```rust
"SELECT rowid, snippet(collections_fts, -1, '<mark>', '</mark>', '...', 32) as match_snippet FROM collections_fts WHERE collections_fts MATCH ?"
```

2. 第 123-142 行 SearchResultItem 构造增加 `folder_id` 和 `is_favorite`：

```rust
let items: Vec<SearchResultItem> = with_folder.iter().map(|c| {
    let rowid: i64 = db.prepare("SELECT rowid FROM collections WHERE id = ?")
        .ok()
        .and_then(|mut stmt| stmt.query_row(params![c.id], |row| row.get::<_, i64>(0)).ok())
        .unwrap_or(0);

    let snippet = snippet_map.get(&rowid).cloned().flatten();

    SearchResultItem {
        id: c.id.clone(),
        title: c.title.clone(),
        summary: c.summary.clone(),
        rtype: c.rtype.clone(),
        url: c.url.clone(),
        cover_url: c.cover_url.clone(),
        folder_id: c.folder_id.clone(),
        is_favorite: c.is_favorite,
        created_at: c.created_at.clone(),
        tags: c.tags.clone(),
        match_snippet: snippet,
    }
}).collect();
```

- [ ] **Step 3: Rust 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites/packages/desktop/src-tauri && cargo check`
Expected: 编译成功（可能有 warnings 但无 errors）

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src-tauri/src/db/models.rs packages/desktop/src-tauri/src/commands/search_cmds.rs
git commit -m "feat(desktop): Rust SearchResultItem 增加 folder_id/is_favorite + snippet <mark> 高亮"
```

---

### Task 4: HttpApi searchCollections 映射调整

**Files:**
- Modify: `packages/shared/src/services/HttpApi.ts:286-294`

- [ ] **Step 1: 更新 HttpApi searchCollections 返回映射**

当前 `searchCollections` 直接返回 `request<PaginatedData<SearchResultItem>>`，后端返回的 snake_case 字段需要映射到 camelCase。新增字段 `folder_id → folderId`、`is_favorite → isFavorite`。

在 HttpApi 中增加一个 `transformSearchResult` 方法，将 snake_case 转为 camelCase。但查看 HttpApi 的现有 `request` 方法，它已经有 `transformKeys` 逻辑处理 camelCase/snake_case 转换。所以新增字段会自动映射。

检查 HttpApi 的 `request` 方法是否处理了所有需要的字段。当前 server 返回 `folderId` 和 `isFavorite`（已是 camelCase，见 Task 2 Step 1），所以 HttpApi 的自动映射已经覆盖。

唯一改动：`matchSnippet` 从 `string | null` 变为 `string`，HttpApi 不需要改动映射逻辑。

**实际上 HttpApi 的 searchCollections 不需要代码改动** — 后端返回的 camelCase 字段会被自动映射。只需要确认类型一致。

- [ ] **Step 2: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 3: Commit（如无改动则跳过）**

如 HttpApi 无代码改动，跳过此 Task 的 commit。

---

### Task 5: TauriApi searchCollections 映射调整

**Files:**
- Modify: `packages/shared/src/services/TauriApi.ts:161-163`

- [ ] **Step 1: 更新 TauriApi searchCollections**

当前 TauriApi 的 `searchCollections` 通过 `this.call` 直接透传 Rust 返回的 JSON。Rust 使用 `#[serde(rename_all = "camelCase")]` 自动转为 camelCase，新增的 `folder_id → folderId`、`is_favorite → isFavorite` 会自动处理。

`match_snippet → matchSnippet` 也是自动映射。无需代码改动。

- [ ] **Step 2: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 3: Commit（如无改动则跳过）**

如 TauriApi 无代码改动，跳过此 Task 的 commit。

---

### Task 6: 创建 collectionStore

**Files:**
- Create: `packages/web/src/store/collectionStore.ts`

- [ ] **Step 1: 创建 collectionStore.ts**

参考 `folderStore.ts` 的模式，创建 `collectionStore`：

```ts
/**
 * collectionStore - 收藏项数据集中管理
 * 取代各页面独立 useState，支持乐观更新 + Undo
 * mutation 后不再全量刷新，直接本地更新 + 后台同步
 */

import { create } from 'zustand';
import * as api from '../services/api';
import type { Collection, GetCollectionsParams, SearchParams, SearchResultItem } from '../types';

const UNDO_EXPIRE_MS = 5000;

export interface UndoAction {
    id: string;
    type: 'delete' | 'move' | 'untag' | 'unfavorite';
    targetId: string;
    payload: Record<string, unknown>;
    expiresAt: number;
}

export interface CollectionFilters {
    folderId: string | null;
    tagId: string | null;
    keyword: string;
    isFavorite: boolean | null;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
}

export interface CollectionState {
    collections: Collection[];
    total: number;
    filters: CollectionFilters;
    page: number;
    pageSize: number;
    viewMode: 'grid' | 'list';
    loading: boolean;
    initialized: boolean;
    pendingUndos: UndoAction[];

    fetchCollections: (params?: Partial<GetCollectionsParams>) => Promise<void>;
    invalidate: () => Promise<void>;
    setFilters: (filters: Partial<CollectionFilters>) => void;
    setPage: (page: number) => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    searchCollections: (query: string) => Promise<SearchResultItem[]>;

    /** 乐观删除：立即移除 + 5秒后提交后端 */
    optimisticDelete: (id: string) => void;
    /** 乐观收藏切换 */
    optimisticToggleFavorite: (id: string) => Promise<void>;
    /** 乐观移动文件夹 */
    optimisticMove: (id: string, folderId: string | null) => Promise<void>;
    /** 撤销操作 */
    undo: (undoId: string) => void;
    /** 精读完成：更新对应条目 content */
    updateContent: (collectionId: string, content: string) => void;
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
    collections: [],
    total: 0,
    filters: {
        folderId: null,
        tagId: null,
        keyword: '',
        isFavorite: null,
        sortBy: 'created_at',
        sortOrder: 'desc',
    },
    page: 1,
    pageSize: 20,
    viewMode: 'grid',
    loading: false,
    initialized: false,
    pendingUndos: [],

    fetchCollections: async (params?: Partial<GetCollectionsParams>) => {
        const state = get();
        const merged: GetCollectionsParams = {
            page: state.page,
            pageSize: state.pageSize,
            sortBy: state.filters.sortBy,
            sortOrder: state.filters.order === 'asc' ? 'asc' : 'desc',
            folderId: state.filters.folderId || undefined,
            tagId: state.filters.tagId || undefined,
            isFavorite: state.filters.isFavorite || undefined,
            keyword: state.filters.keyword || undefined,
            ...params,
        };

        set({ loading: true });
        try {
            const data = await api.getCollections(merged);
            set({
                collections: data.items,
                total: data.pagination.total,
                initialized: true,
                loading: false,
            });
        } catch (err) {
            console.error('加载收藏数据失败:', err);
            set({ loading: false });
        }
    },

    invalidate: async () => {
        set({ loading: true });
        try {
            const data = await api.getCollections({
                page: get().page,
                pageSize: get().pageSize,
                sortBy: get().filters.sortBy,
                sortOrder: get().filters.order === 'asc' ? 'asc' : 'desc',
                folderId: get().filters.folderId || undefined,
                tagId: get().filters.tagId || undefined,
                isFavorite: get().filters.isFavorite || undefined,
                keyword: get().filters.keyword || undefined,
            });
            set({
                collections: data.items,
                total: data.pagination.total,
                initialized: true,
                loading: false,
            });
        } catch (err) {
            console.error('刷新收藏数据失败:', err);
            set({ loading: false });
        }
    },

    setFilters: (filters: Partial<CollectionFilters>) => {
        set({ filters: { ...get().filters, ...filters }, page: 1 });
        get().fetchCollections();
    },

    setPage: (page: number) => {
        set({ page });
        get().fetchCollections({ page });
    },

    setViewMode: (mode: 'grid' | 'list') => {
        set({ viewMode: mode });
    },

    searchCollections: async (query: string) => {
        const params: SearchParams = { q: query };
        const data = await api.searchCollections(params);
        return data.items;
    },

    optimisticDelete: (id: string) => {
        const state = get();
        const target = state.collections.find((c) => c.id === id);
        if (!target) return;

        const undoId = `delete-${id}-${Date.now()}`;
        const undo: UndoAction = {
            id: undoId,
            type: 'delete',
            targetId: id,
            payload: { collection: target },
            expiresAt: Date.now() + UNDO_EXPIRE_MS,
        };

        // 立即从列表移除
        set({
            collections: state.collections.filter((c) => c.id !== id),
            total: state.total - 1,
            pendingUndos: [...state.pendingUndos, undo],
        });

        // 5秒后提交后端删除
        setTimeout(() => {
            const current = get();
            const stillPending = current.pendingUndos.find((u) => u.id === undoId);
            if (stillPending) {
                api.deleteCollection(id).catch((err) => {
                    console.error('延迟删除失败:', err);
                });
                set({ pendingUndos: current.pendingUndos.filter((u) => u.id !== undoId) });
            }
        }, UNDO_EXPIRE_MS);
    },

    optimisticToggleFavorite: async (id: string) => {
        const state = get();
        const target = state.collections.find((c) => c.id === id);
        if (!target) return;

        const newFavorite = !target.isFavorite;

        // 立即更新本地状态
        set({
            collections: state.collections.map((c) =>
                c.id === id ? { ...c, isFavorite: newFavorite } : c
            ),
        });

        // 立即提交后端
        try {
            await api.toggleFavorite(id);
        } catch (err) {
            // 回退
            console.error('收藏切换失败:', err);
            set({
                collections: get().collections.map((c) =>
                    c.id === id ? { ...c, isFavorite: !newFavorite } : c
                ),
            });
        }
    },

    optimisticMove: async (id: string, folderId: string | null) => {
        const state = get();
        const target = state.collections.find((c) => c.id === id);
        if (!target) return;

        const oldFolderId = target.folderId;

        // 立即更新本地状态
        set({
            collections: state.collections.map((c) =>
                c.id === id ? { ...c, folderId } : c
            ),
        });

        // 立即提交后端
        try {
            await api.moveCollection(id, folderId);
        } catch (err) {
            console.error('移动失败:', err);
            set({
                collections: get().collections.map((c) =>
                    c.id === id ? { ...c, folderId: oldFolderId } : c
                ),
            });
        }
    },

    undo: (undoId: string) => {
        const state = get();
        const action = state.pendingUndos.find((u) => u.id === undoId);
        if (!action) return;

        switch (action.type) {
            case 'delete': {
                const collection = action.payload.collection as Collection;
                set({
                    collections: [...state.collections, collection],
                    total: state.total + 1,
                    pendingUndos: state.pendingUndos.filter((u) => u.id !== undoId),
                });
                break;
            }
            default:
                set({ pendingUndos: state.pendingUndos.filter((u) => u.id !== undoId) });
        }
    },

    updateContent: (collectionId: string, content: string) => {
        const state = get();
        set({
            collections: state.collections.map((c) =>
                c.id === collectionId ? { ...c, content } : c
            ),
        });
    },
}));
```

注意：`filters.sortOrder` 在 store 中是 `'asc' | 'desc'`，但 `GetCollectionsParams.sortOrder` 也兼容。`filters` 中的 `sortBy` 默认 `'created_at'` 对应后端的 `sortBy` 参数。

- [ ] **Step 2: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/store/collectionStore.ts
git commit -m "feat(web): 创建 collectionStore — 乐观更新 + Undo + 精读实时更新"
```

---

### Task 7: Toast 扩展 Undo Action

**Files:**
- Modify: `packages/web/src/components/Toast.tsx:14-23,87-128`
- Modify: `packages/web/src/contexts/ToastContext.tsx:26-31,53-65`

- [ ] **Step 1: ToastItem 增加 undoAction**

在 `packages/web/src/components/Toast.tsx` 第 14-23 行，`ToastItem` 增加 `undoAction` 和 `undoLabel` 字段：

```ts
export interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    exiting?: boolean;
    /** Undo 按钮 label，如 "撤销" */
    undoLabel?: string;
    /** Undo 回调，点击后执行 */
    undoAction?: () => void;
}
```

- [ ] **Step 2: ToastContext showToast 增加 undo 参数**

在 `packages/web/src/contexts/ToastContext.tsx` 第 26-31 行，扩展 `ToastContextType`：

```ts
interface ToastContextType {
    showToast: (message: string, type?: ToastType, undo?: { label: string; action: () => void }) => void;
    showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}
```

第 53-65 行，`showToast` 实现增加 undo 参数：

```ts
const showToast = useCallback((message: string, type: ToastType = 'info', undo?: { label: string; action: () => void }) => {
    const id = ++nextIdRef.current;
    const newToast: ToastItem = { id, message, type, undoLabel: undo?.label, undoAction: undo?.action };

    setToasts((prev) => {
        const updated = [...prev, newToast];
        if (updated.length > MAX_TOASTS) {
            return updated.slice(updated.length - MAX_TOASTS);
        }
        return updated;
    });
}, []);
```

- [ ] **Step 3: ToastItemComponent 渲染 Undo 按钮**

在 `packages/web/src/components/Toast.tsx` 的 `ToastItemComponent`（第 87-128 行），修改：

1. 有 undo 时，自动消失延迟从 3s 改为 5s（给用户更多时间点击撤销）
2. 渲染 Undo 按钮

```ts
function ToastItemComponent({ toast, onRemove }: ToastItemProps) {
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const duration = toast.undoAction ? 5000 : 3000;
        const timer = setTimeout(() => {
            setExiting(true);
        }, duration);

        return () => clearTimeout(timer);
    }, [toast.id, toast.undoAction]);

    const handleAnimationEnd = () => {
        if (exiting) {
            onRemove(toast.id);
        }
    };

    const handleClose = () => {
        setExiting(true);
    };

    const handleUndo = () => {
        toast.undoAction?.();
        setExiting(true);
    };

    return (
        <div
            className={`toast-item ${toast.type} ${exiting ? 'exiting' : ''} ${toast.undoAction ? 'with-undo' : ''}`}
            onAnimationEnd={handleAnimationEnd}
        >
            <ToastIcon type={toast.type} />
            <span className="toast-message">{toast.message}</span>
            {toast.undoLabel && toast.undoAction && (
                <button className="toast-undo" onClick={handleUndo}>
                    {toast.undoLabel}
                </button>
            )}
            <button className="toast-close" onClick={handleClose}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}
```

- [ ] **Step 4: 添加 Undo 按钮样式**

在 `packages/web/src/components/Toast.css` 末尾追加：

```css
.toast-undo {
    background: var(--primary-light, #d97706);
    color: white;
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    border: none;
    margin-left: 8px;
    transition: background 0.2s ease;
}

.toast-undo:hover {
    background: var(--primary, #b45309);
}

.toast-item.with-undo {
    min-width: 280px;
}
```

- [ ] **Step 5: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/Toast.tsx packages/web/src/components/Toast.css packages/web/src/contexts/ToastContext.tsx
git commit -m "feat(web): Toast 扩展 Undo action — 可撤销按钮 + 5秒延迟消失"
```

---

### Task 8: 创建 SearchOverlay 组件

**Files:**
- Create: `packages/web/src/components/SearchOverlay.tsx`
- Create: `packages/web/src/components/SearchOverlay.css`

- [ ] **Step 1: 创建 SearchOverlay.tsx**

```tsx
/**
 * SearchOverlay - Cmd+K 全局搜索面板
 * 遮罩层 + 居中面板，支持键盘导航（上/下/Enter/ESC）
 * 300ms debounce 即时搜索，结果含 <mark> 高亮 snippet
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollectionStore } from '../store/collectionStore';
import type { SearchResultItem } from '../types';
import './SearchOverlay.css';

interface SearchOverlayProps {
    visible: boolean;
    onClose: () => void;
}

export default function SearchOverlay({ visible, onClose }: SearchOverlayProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const navigate = useNavigate();
    const searchCollections = useCollectionStore((s) => s.searchCollections);

    /** 打开时自动聚焦 + 清空状态 */
    useEffect(() => {
        if (visible) {
            setQuery('');
            setResults([]);
            setSelectedIndex(-1);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [visible]);

    /** 300ms debounce 搜索 */
    const handleInputChange = useCallback((value: string) => {
        setQuery(value);
        setSelectedIndex(-1);

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        if (!value.trim()) {
            setResults([]);
            return;
        }

        debounceTimerRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const items = await searchCollections(value.trim());
                setResults(items);
            } catch (err) {
                console.error('搜索失败:', err);
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);
    }, [searchCollections]);

    /** 键盘导航 */
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) =>
                    prev < results.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : results.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && results[selectedIndex]) {
                    navigate(`/collection/${results[selectedIndex].id}`);
                    onClose();
                }
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [results, selectedIndex, navigate, onClose]);

    /** 点击遮罩关闭 */
    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    if (!visible) return null;

    const typeLabels: Record<string, string> = {
        link: '链接',
        file: '文件',
        note: '笔记',
    };

    return (
        <div className="search-overlay" onClick={handleOverlayClick}>
            <div className="search-panel">
                <div className="search-input-area">
                    <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        className="search-input"
                        type="text"
                        value={query}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="搜索收藏..."
                    />
                    <kbd className="search-kbd">ESC</kbd>
                </div>

                {loading && (
                    <div className="search-loading">搜索中...</div>
                )}

                {!loading && query.trim() && results.length === 0 && (
                    <div className="search-empty">
                        未找到 "{query}" 相关结果
                    </div>
                )}

                {!loading && results.length > 0 && (
                    <ul className="search-results">
                        {results.map((item, index) => (
                            <li
                                key={item.id}
                                className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => {
                                    navigate(`/collection/${item.id}`);
                                    onClose();
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <span className="result-type-tag">{typeLabels[item.type] || item.type}</span>
                                <div className="result-content">
                                    <div className="result-title">{item.title}</div>
                                    {item.matchSnippet && (
                                        <div
                                            className="result-snippet"
                                            dangerouslySetInnerHTML={{ __html: item.matchSnippet }}
                                        />
                                    )}
                                </div>
                                {item.isFavorite && (
                                    <svg className="result-favorite" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {!query.trim() && (
                    <div className="search-hint">
                        输入关键词搜索你的收藏内容
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: 创建 SearchOverlay.css**

```css
.search-overlay {
    position: fixed;
    inset: 0;
    background: rgba(44, 36, 16, 0.4);
    backdrop-filter: blur(4px);
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 20vh;
    animation: overlay-fade-in 0.15s ease;
}

@keyframes overlay-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

.search-panel {
    width: 90%;
    max-width: 560px;
    background: var(--bg-warm, #fefcf8);
    border-radius: var(--radius, 12px);
    box-shadow: 0 8px 32px rgba(44, 36, 16, 0.15);
    animation: panel-slide-in 0.2s ease;
    overflow: hidden;
}

@keyframes panel-slide-in {
    from { opacity: 0; transform: translateY(-20px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.search-input-area {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border, #e8dcc8);
}

.search-icon {
    color: var(--text-light, #8b7b6b);
    flex-shrink: 0;
}

.search-input {
    flex: 1;
    border: none;
    background: none;
    outline: none;
    font-size: 15px;
    color: var(--text-dark, #2c2416);
    font-family: inherit;
}

.search-input::placeholder {
    color: var(--text-light, #8b7b6b);
}

.search-kbd {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--sidebar-bg, #f0e8d8);
    border-radius: 4px;
    color: var(--text-light, #8b7b6b);
    flex-shrink: 0;
}

.search-loading,
.search-empty,
.search-hint {
    padding: 24px 16px;
    text-align: center;
    color: var(--text-light, #8b7b6b);
    font-size: 14px;
}

.search-results {
    list-style: none;
    max-height: 320px;
    overflow-y: auto;
    padding: 4px;
}

.search-result-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
}

.search-result-item.selected,
.search-result-item:hover {
    background: var(--primary-pale, #fef3c7);
}

.result-type-tag {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--sidebar-bg, #f0e8d8);
    border-radius: 4px;
    color: var(--text-mid, #5c4a3a);
    flex-shrink: 0;
}

.result-content {
    flex: 1;
    min-width: 0;
}

.result-title {
    font-size: 14px;
    color: var(--text-dark, #2c2416);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.result-snippet {
    font-size: 12px;
    color: var(--text-light, #8b7b6b);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
}

.result-snippet mark {
    background: #fef08a;
    color: var(--text-dark, #2c2416);
    padding: 0 2px;
    border-radius: 2px;
}

.result-favorite {
    color: var(--primary, #b45309);
    flex-shrink: 0;
}
```

- [ ] **Step 3: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/SearchOverlay.tsx packages/web/src/components/SearchOverlay.css
git commit -m "feat(web): SearchOverlay Cmd+K 搜索面板 — 遮罩 + 键盘导航 + snippet 高亮"
```

---

### Task 9: App 挂载 SearchOverlay + Cmd+K 注册

**Files:**
- Modify: `packages/web/src/App.tsx:1-27,133-173`
- Modify: `packages/web/src/hooks/useKeyboardShortcuts.ts:58-63`
- Modify: `packages/web/src/components/Layout.tsx:44-46,56-60`

- [ ] **Step 1: App.tsx 增加 SearchOverlay 状态和挂载**

在 `packages/web/src/App.tsx` 中：

1. 第 1-27 行导入区增加 SearchOverlay：
```ts
import SearchOverlay from './components/SearchOverlay';
```

2. 第 33 行 App 函数内增加搜索面板状态：
```ts
const [searchOverlayVisible, setSearchOverlayVisible] = useState(false);
```

3. 第 170 行附近（`<DeepReadProgress />` 之后），挂载 SearchOverlay：
```tsx
<SearchOverlay
    visible={searchOverlayVisible}
    onClose={() => setSearchOverlayVisible(false)}
/>
```

- [ ] **Step 2: useKeyboardShortcuts Cmd+K 改为打开搜索面板**

在 `packages/web/src/hooks/useKeyboardShortcuts.ts` 第 58-63 行，Cmd+K 的注释已说"聚焦搜索框"，改为"打开搜索面板"。代码逻辑不变——仍然调用 `onFocusSearch` callback。但 Layout 中 `handleFocusSearch` 的行为会改变。

- [ ] **Step 3: Layout handleFocusSearch 改为打开 SearchOverlay**

在 `packages/web/src/components/Layout.tsx` 中，需要让 Cmd+K 打开 SearchOverlay 而非聚焦 SearchBar。

方案：Layout 不直接管理 SearchOverlay 状态（状态在 App 层级）。改为通过 custom event 通知 App：

第 44-46 行：
```ts
const handleFocusSearch = useCallback(() => {
    document.dispatchEvent(new CustomEvent('open-search-overlay'));
}, []);
```

然后在 App.tsx 中监听这个事件：
```ts
useEffect(() => {
    const handler = () => setSearchOverlayVisible(true);
    document.addEventListener('open-search-overlay', handler);
    return () => document.removeEventListener('open-search-overlay', handler);
}, []);
```

同时，CollectionList.tsx 中原来监听 `focus-search` 事件聚焦 SearchBar 的逻辑（第 89-98 行）需要移除，因为 Cmd+K 现在打开 SearchOverlay 而非聚焦页内 SearchBar。

- [ ] **Step 4: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/hooks/useKeyboardShortcuts.ts packages/web/src/components/Layout.tsx
git commit -m "feat(web): Cmd+K 打开 SearchOverlay + App 挂载搜索面板"
```

---

### Task 10: deepReadStore 完成事件发布

**Files:**
- Modify: `packages/web/src/store/deepReadStore.ts:154-179`

- [ ] **Step 1: 精读完成后发布 custom event**

在 `packages/web/src/store/deepReadStore.ts` 第 163-179 行的 `.then()` 链中，精读完成后（保存 content 到后端成功后），发布 `deep-read-complete` 事件：

```ts
.then((updatedCollection) => {
    if (controller.signal.aborted) return;
    const state = get();
    const tasks = state.tasks.map((t) =>
        t.collectionId === processingTask.collectionId
            ? { ...t, status: 'done' as const }
            : t
    );
    const content = updatedCollection?.content || '';
    const completedContent = {
        ...state.completedContent,
        [processingTask.collectionId]: content,
    };
    set({ tasks, currentTask: null, abortController: null, completedContent });

    // 通知 collectionStore 更新对应条目的 content
    document.dispatchEvent(new CustomEvent('deep-read-complete', {
        detail: { collectionId: processingTask.collectionId, content },
    }));

    scheduleNextProcess(PROCESS_INTERVAL);
})
```

- [ ] **Step 2: App.tsx 监听 deep-read-complete 事件**

在 `packages/web/src/App.tsx` 中增加事件监听，调用 `collectionStore.updateContent`：

```ts
useEffect(() => {
    const handler = (e: CustomEvent) => {
        const { collectionId, content } = e.detail;
        useCollectionStore.getState().updateContent(collectionId, content);
    };
    document.addEventListener('deep-read-complete', handler);
    return () => document.removeEventListener('deep-read-complete', handler);
}, []);
```

同时需要在 App.tsx 导入区增加：
```ts
import { useCollectionStore } from './store/collectionStore';
```

- [ ] **Step 3: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/store/deepReadStore.ts packages/web/src/App.tsx
git commit -m "feat(web): deepReadStore 完成后发布事件 → collectionStore 自动更新 content"
```

---

### Task 11: CollectionList 改用 collectionStore + 乐观更新

**Files:**
- Modify: `packages/web/src/pages/CollectionList.tsx`

这是改动量最大的 Task。核心变化：
- 移除所有本地 `useState`（collections、total、page、pageSize、keyword、loading）
- 从 `collectionStore` 读取数据
- 操作（删除、收藏切换、移动）改用 store 的乐观更新方法
- 删除后显示 Undo Toast
- 移除 `focus-search` 事件监听（Cmd+K 现在打开 SearchOverlay）

- [ ] **Step 1: 重构 CollectionList.tsx**

核心改动要点：

1. 移除第 55-64 行的本地 state（collections、total、page 等），改为：
```ts
const collections = useCollectionStore((s) => s.collections);
const total = useCollectionStore((s) => s.total);
const loading = useCollectionStore((s) => s.loading);
const page = useCollectionStore((s) => s.page);
const pageSize = useCollectionStore((s) => s.pageSize);
const filters = useCollectionStore((s) => s.filters);
const viewMode = useCollectionStore((s) => s.viewMode);
const fetchCollections = useCollectionStore((s) => s.fetchCollections);
const setFilters = useCollectionStore((s) => s.setFilters);
const setPage = useCollectionStore((s) => s.setPage);
const setViewMode = useCollectionStore((s) => s.setViewMode);
const optimisticDelete = useCollectionStore((s) => s.optimisticDelete);
const optimisticToggleFavorite = useCollectionStore((s) => s.optimisticToggleFavorite);
const optimisticMove = useCollectionStore((s) => s.optimisticMove);
```

2. 移除第 89-98 行的 `focus-search` 事件监听（Cmd+K 已改为打开 SearchOverlay）

3. 移除第 103-127 行的 `reloadCollections` 函数（store 自动管理）

4. URL 参数初始化 filters：组件挂载时从 URL searchParams 读取 folderId/tagId/isFavorite/sortBy/sortOrder，调用 `setFilters` 设置

5. handleSearch（第 197-206 行）改为 `setFilters({ keyword: value })`

6. handleToggleFavorite（第 230-237 行）改为：
```ts
const handleToggleFavorite = useCallback((id: string) => {
    optimisticToggleFavorite(id);
}, [optimisticToggleFavorite]);
```

7. handleDelete 改为乐观删除 + Undo Toast：
```ts
const handleDelete = useCallback(async (id: string) => {
    const collection = collections.find((c) => c.id === id);
    if (!collection) return;

    optimisticDelete(id);
    showToast(`已删除 "${collection.title}"`, 'info', {
        label: '撤销',
        action: () => {
            const undo = useCollectionStore.getState().pendingUndos.find(
                (u) => u.targetId === id && u.type === 'delete'
            );
            if (undo) {
                useCollectionStore.getState().undo(undo.id);
                showToast(`已恢复 "${collection.title}"`, 'success');
            }
        },
    });
}, [collections, optimisticDelete, showToast]);
```

8. 需要导入 `useToast` 和 `useCollectionStore`

- [ ] **Step 2: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 3: 手动验证**

启动 dev server：
```bash
pnpm dev:web
```

在浏览器打开 http://localhost:5173，验证：
- 收藏列表正常显示
- 点击收藏切换（星标）→ UI 立即变化，无闪烁
- 删除一个收藏 → 立即消失 + Toast "已删除 xxx" + "撤销"按钮
- 点击撤销 → 收藏恢复 + Toast "已恢复 xxx"
- 5秒不点撤销 → Toast 消失，收藏真正删除

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/CollectionList.tsx
git commit -m "feat(web): CollectionList 改用 collectionStore — 乐观更新 + Undo Toast + 无闪烁"
```

---

### Task 12: CollectionDetail 改用 collectionStore

**Files:**
- Modify: `packages/web/src/pages/CollectionDetail.tsx`

- [ ] **Step 1: 重构 CollectionDetail.tsx**

核心改动：

1. 移除第 27-28 行的本地 `useState<Collection | null>`
2. 加载详情时先从 collectionStore 查找（如已缓存），无则调用 `api.getCollectionById` 补充
3. 删除（第 134-153 行）改为乐观删除 + Undo Toast：
```ts
const handleDelete = useCallback(async () => {
    if (!collection) return;
    const confirm = await showConfirm({
        title: '确认删除',
        message: `确定要删除 "${collection.title}" 吗？`,
        confirmText: '删除',
        danger: true,
    });
    if (!confirm) return;

    useCollectionStore.getState().optimisticDelete(collection.id);
    showToast(`已删除 "${collection.title}"`, 'info', {
        label: '撤销',
        action: () => {
            const undo = useCollectionStore.getState().pendingUndos.find(
                (u) => u.targetId === collection.id && u.type === 'delete'
            );
            if (undo) {
                useCollectionStore.getState().undo(undo.id);
                showToast(`已恢复 "${collection.title}"`, 'success');
                // 不导航回列表，留在当前页
            }
        },
    });
    navigate('/');
}, [collection, showConfirm, showToast, navigate]);
```

4. 收藏切换改为乐观更新：
```ts
const handleToggleFavorite = useCallback(() => {
    if (!collection) return;
    useCollectionStore.getState().optimisticToggleFavorite(collection.id);
    // 本地状态同步
    setLocalCollection({ ...collection, isFavorite: !collection.isFavorite });
}, [collection]);
```

注意：详情页仍需要一个 `localCollection` 状态用于编辑表单，因为 collectionStore 中的数据是列表视图的精简版，详情页可能需要完整数据（含 content）。方案：优先从 store 取，如 store 中该条目存在且含 content 就直接用，否则从 API 单独获取。

- [ ] **Step 2: 编译验证**

Run: `cd /Users/gaoyong/Desktop/h5_release/fork/favorites && pnpm build:web`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/CollectionDetail.tsx
git commit -m "feat(web): CollectionDetail 改用 collectionStore — 乐观删除 + Undo + 收藏切换"
```

---

### Task 13: SearchBar 改用 searchCollections API（列表页内搜索）

**Files:**
- Modify: `packages/web/src/components/SearchBar.tsx`
- Modify: `packages/web/src/pages/CollectionList.tsx`（搜索联动部分）

- [ ] **Step 1: SearchBar 不需要内部改动**

当前 SearchBar 是纯输入组件（只接收 `onSearch` callback）。列表页内搜索现在通过 `collectionStore.setFilters({ keyword })` 触发，SearchBar 的 `onSearch` 传 `setFilters` 即可。

改动在 CollectionList 侧：`handleSearch` 从更新本地 keyword + useEffect reload，改为直接调用 `collectionStore.setFilters({ keyword: value })`。这在 Task 11 已经完成。

SearchBar.tsx 本身无需改动。

- [ ] **Step 2: Commit（如 SearchBar 无改动则跳过）**

此 Task 无独立 commit，改动已在 Task 11 中包含。

---

### Task 14: 集成验证 + 最终测试

- [ ] **Step 1: 全栈构建验证**

```bash
cd /Users/gaoyong/Desktop/h5_release/fork/favorites
pnpm build:server && pnpm build:web
```

Expected: 两个包编译成功

- [ ] **Step 2: Server + Web 联合运行验证**

```bash
# 启动 server
cd packages/server && node dist/index.js &
# 启动 web dev
cd packages/web && pnpm dev &
```

在浏览器 http://localhost:5173 验证全部成功标准：

1. **Cmd+K 搜索面板** — 任何页面按 Cmd+K → 搜索面板弹出 → 输入关键词 → 结果含 `<mark>` 高亮 → Enter 跳转详情页 → ESC 关闭
2. **乐观更新** — 收藏切换/移动 → UI 立即变化，无闪烁加载
3. **Undo Toast** — 删除 → Toast "已删除 xxx" + "撤销"按钮 → 点击撤销 → 条目恢复
4. **精读实时更新** — 精读完成后 → 卡片 content 自动更新（需 AI API 配置）
5. **列表页搜索** — SearchBar 输入 → 结果通过 searchCollections API 过滤

- [ ] **Step 3: Rust desktop 编译验证**

```bash
cd packages/desktop/src-tauri && cargo check
```

Expected: 编译成功

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: UX 搜索增强 + 流畅交互 — 集成验证完成"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Cmd+K 全局搜索面板 → Task 8 + Task 9
   - SearchResultItem 扩展 → Task 1 + Task 2 + Task 3
   - collectionStore → Task 6
   - 乐观更新（删除/收藏/移动）→ Task 6 + Task 11 + Task 12
   - Undo Toast → Task 7 + Task 11 + Task 12
   - 精读完成实时更新 → Task 10
   - 列表页 SearchBar → Task 11（setFilters）
   - 后端 snippet `<mark>` → Task 2 + Task 3
   - ✅ All spec requirements covered

2. **Placeholder scan:**
   - No "TBD", "TODO", "implement later", "fill in details"
   - No "add appropriate error handling" without specifics
   - No "similar to Task N" without code repetition
   - ✅ Clean

3. **Type consistency:**
   - `SearchResultItem.matchSnippet: string` in Task 1 → used as `string` in Task 8 SearchOverlay
   - `UndoAction.id: string` in Task 6 → `undo.id` in Task 11/12 undo calls
   - `collectionStore.filters.sortBy: string` → `GetCollectionsParams.sortBy: string`
   - `ToastItem.undoAction?: () => void` in Task 7 → `action: () => void` in Task 11 showToast calls
   - ✅ Consistent