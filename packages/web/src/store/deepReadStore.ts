/**
 * deepReadStore - 精读队列管理
 * 参考 folderStore 模式：initialized 标志 + 自动缓存 + invalidate
 * 串行处理队列，完成后保存到 collection.content
 */

import { create } from 'zustand';
import * as api from '../services/api';
import type { Collection } from '../types';

const PROCESS_INTERVAL = 3000; // 3s 间隔防限流

export interface DeepReadTask {
    /** 收藏项 ID */
    collectionId: string;
    /** 目标 URL */
    url: string;
    /** 收藏项标题（用于 UI 展示） */
    title: string;
    /** 任务状态 */
    status: 'pending' | 'processing' | 'done' | 'error';
    /** 优先级：0=普通，1=插队（排到队首） */
    priority: number;
    /** 错误信息 */
    error?: string;
}

export interface DeepReadState {
    /** 队列任务列表 */
    tasks: DeepReadTask[];
    /** 当前正在处理的任务 */
    currentTask: DeepReadTask | null;
    /** 是否暂停 */
    paused: boolean;
    /** 是否已初始化（首次扫描完成） */
    initialized: boolean;
    /** 当前 abort controller */
    abortController: AbortController | null;
    /** 精读完成后的 content 缓存（collectionId → content），用于刷新卡片状态 */
    completedContent: Record<string, string>;
    /** 扫描所有无 content 的链接收藏，加入队列 */
    initQueue: (collections: Collection[]) => void;
    /** 入队：priority=1 时插队到队首 */
    enqueue: (collectionId: string, url: string, title: string, priority?: number) => void;
    /** 批量入队 */
    enqueueBatch: (items: { id: string; url: string; title: string }[]) => void;
    /** 开始/恢复处理 */
    startProcessing: () => void;
    /** 暂停队列 */
    pause: () => void;
    /** 取消单个任务 */
    cancelTask: (collectionId: string) => void;
    /** 取消所有待处理任务 */
    cancelAll: () => void;
    /** 重试失败项 */
    retryTask: (collectionId: string) => void;
    /** 获取某收藏项在队列中的状态 */
    getTaskStatus: (collectionId: string) => DeepReadTask | undefined;
}

export const useDeepReadStore = create<DeepReadState>((set, get) => ({
    tasks: [],
    currentTask: null,
    paused: false,
    initialized: false,
    abortController: null,
    completedContent: {},

    initQueue: (collections: Collection[]) => {
        const pendingItems = collections.filter(
            (c) => c.type === 'link' && c.url && !c.content
        );
        if (pendingItems.length === 0) {
            set({ initialized: true });
            return;
        }
        const newTasks: DeepReadTask[] = pendingItems.map((c) => ({
            collectionId: c.id,
            url: c.url!,
            title: c.title,
            status: 'pending',
            priority: 0,
        }));
        set({ tasks: newTasks, initialized: true });
        // 自动开始处理
        get().startProcessing();
    },

    enqueue: (collectionId: string, url: string, title: string, priority: number = 0) => {
        const state = get();
        // 已在队列中则跳过
        if (state.tasks.some((t) => t.collectionId === collectionId)) return;

        const newTask: DeepReadTask = {
            collectionId,
            url,
            title,
            status: 'pending',
            priority,
        };

        let tasks: DeepReadTask[];
        if (priority === 1) {
            // 插队：排到 pending 列最前面
            const pending = state.tasks.filter((t) => t.status === 'pending');
            const others = state.tasks.filter((t) => t.status !== 'pending');
            tasks = [newTask, ...pending, ...others];
        } else {
            tasks = [...state.tasks, newTask];
        }
        set({ tasks });

        // 如果队列为空或已暂停，尝试恢复处理
        if (!state.currentTask && !state.paused) {
            get().startProcessing();
        }
    },

    enqueueBatch: (items: { id: string; url: string; title: string }[]) => {
        const state = get();
        const existingIds = new Set(state.tasks.map((t) => t.collectionId));
        const newTasks: DeepReadTask[] = items
            .filter((item) => !existingIds.has(item.id))
            .map((item) => ({
                collectionId: item.id,
                url: item.url,
                title: item.title,
                status: 'pending',
                priority: 0,
            }));
        set({ tasks: [...state.tasks, ...newTasks] });
        if (!state.currentTask && !state.paused) {
            get().startProcessing();
        }
    },

    startProcessing: () => {
        const state = get();
        if (state.paused) return;
        if (state.currentTask) return; // 已在处理中

        const nextTask = state.tasks.find((t) => t.status === 'pending');
        if (!nextTask) return;

        const controller = new AbortController();
        const processingTask = { ...nextTask, status: 'processing' as const };
        const tasks = state.tasks.map((t) =>
            t.collectionId === nextTask.collectionId ? processingTask : t
        );

        set({ tasks, currentTask: processingTask, abortController: controller });

        // 异步处理
        processTask(processingTask, controller.signal)
            .then((result) => {
                if (controller.signal.aborted) return;

                // 保存到 collection.content
                return api.updateCollection(processingTask.collectionId, {
                    content: result.summary,
                });
            })
            .then((updatedCollection) => {
                if (controller.signal.aborted) return;
                // 标记完成 + 缓存 content 供卡片即时更新
                const state = get();
                const tasks = state.tasks.map((t) =>
                    t.collectionId === processingTask.collectionId
                        ? { ...t, status: 'done' as const }
                        : t
                );
                const completedContent = {
                    ...state.completedContent,
                    [processingTask.collectionId]: updatedCollection?.content || '',
                };
                set({ tasks, currentTask: null, abortController: null, completedContent });
                // 通知 collectionStore 更新对应条目的 content
                document.dispatchEvent(new CustomEvent('deep-read-complete', {
                    detail: { collectionId: processingTask.collectionId, content: updatedCollection?.content || '' },
                }));
                // 间隔后处理下一个
                scheduleNextProcess(PROCESS_INTERVAL);
            })
            .catch((err) => {
                if (controller.signal.aborted) {
                    // 取消了当前任务，恢复为 pending
                    const state = get();
                    const tasks = state.tasks.map((t) =>
                        t.collectionId === processingTask.collectionId
                            ? { ...t, status: 'pending' as const }
                            : t
                    );
                    set({ tasks, currentTask: null, abortController: null });
                    return;
                }
                // 失败：标记 error
                const errMsg = err instanceof Error ? err.message : '精读失败';
                const state = get();
                const tasks = state.tasks.map((t) =>
                    t.collectionId === processingTask.collectionId
                        ? { ...t, status: 'error' as const, error: errMsg }
                        : t
                );
                set({ tasks, currentTask: null, abortController: null });
                // 间隔后继续处理下一个
                scheduleNextProcess(PROCESS_INTERVAL);
            });
    },

    pause: () => {
        const state = get();
        // abort 当前处理中的任务
        state.abortController?.abort();
        set({ paused: true, currentTask: null, abortController: null });
    },

    cancelTask: (collectionId: string) => {
        const state = get();
        // 如果是当前正在处理的，abort 它
        if (state.currentTask?.collectionId === collectionId) {
            state.abortController?.abort();
            // 从队列中移除
            const tasks = state.tasks.filter(
                (t) => t.collectionId !== collectionId
            );
            set({ tasks, currentTask: null, abortController: null });
            // 处理下一个
            scheduleNextProcess(PROCESS_INTERVAL);
        } else {
            // 从队列中移除
            const tasks = state.tasks.filter(
                (t) => t.collectionId !== collectionId
            );
            set({ tasks });
        }
    },

    cancelAll: () => {
        const state = get();
        state.abortController?.abort();
        // 只保留 done 和 error 的记录（可选清空），这里直接清空
        set({ tasks: [], currentTask: null, abortController: null, paused: false });
    },

    retryTask: (collectionId: string) => {
        const state = get();
        const tasks = state.tasks.map((t) =>
            t.collectionId === collectionId
                ? { ...t, status: 'pending' as const, error: undefined }
                : t
        );
        set({ tasks });
        if (!state.currentTask && !state.paused) {
            get().startProcessing();
        }
    },

    getTaskStatus: (collectionId: string) => {
        return get().tasks.find((t) => t.collectionId === collectionId);
    },
}));

/**
 * 执行单个精读任务
 * @param task - 精读任务
 * @param signal - AbortSignal
 * @returns AI 生成的摘要
 */
async function processTask(
    task: DeepReadTask,
    signal: AbortSignal
): Promise<{ summary: string }> {
    return api.extractSummary(task.url, { signal });
}

/**
 * 延迟后继续处理下一个队列项
 * @param delayMs - 延迟毫秒数
 */
function scheduleNextProcess(delayMs: number) {
    setTimeout(() => {
        const state = useDeepReadStore.getState();
        if (!state.paused) {
            state.startProcessing();
        }
    }, delayMs);
}