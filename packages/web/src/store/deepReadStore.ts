/**
 * deepReadStore - 精读队列管理
 * 串行处理队列，完成后保存 rawContent 和 summary（content）到 collection
 */

import { create } from 'zustand';
import {
    deepReadAiConfig,
    buildDeepReadCollectionUpdate,
    type DeepReadTemplateType,
} from '@favorites/shared/ai/deepRead';
import { inferTitleUpdate } from '@favorites/shared/metadata/collectionMeta';
import type { DeepReadResult, Collection } from '@favorites/shared/types';
import { classifyDeepReadError, getMaxAutoRetries, getRetryBackoffMs } from '@favorites/shared/ai/deepReadErrors';
import type { SummaryMode } from '../types';
import * as api from '../services/api';
import { useCollectionStore } from './collectionStore';
import { useAppSettingsStore } from './appSettingsStore';

const PROCESS_INTERVAL = deepReadAiConfig.processIntervalMs ?? 3000;

function syncTaskMap(tasks: DeepReadTask[]): Record<string, DeepReadTask> {
    const map: Record<string, DeepReadTask> = {};
    for (const task of tasks) {
        map[task.collectionId] = task;
    }
    return map;
}

export type DeepReadPhase = 'fetching' | 'summarizing';

export interface DeepReadEnqueueOptions {
    /** 已有原文，跳过重抓 */
    rawContent?: string;
    /** 已有图文分离数据（JSON） */
    images?: string;
    /** 强制重新抓取（忽略 rawContent） */
    refetch?: boolean;
    /** 文章类型模板 */
    templateType?: DeepReadTemplateType;
    /** 再次精读时的用户诉求 */
    userDirection?: string;
    /** 再次精读时的先前摘要 */
    previousSummary?: string;
    /** 摘要模式 */
    summaryMode?: SummaryMode;
    /** 从已有摘要压缩而非从原文精读 */
    sourceMode?: 'compress';
}

export interface DeepReadTask {
    collectionId: string;
    url: string;
    title: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    priority: number;
    error?: string;
    rawContent?: string;
    images?: string;
    refetch?: boolean;
    templateType?: DeepReadTemplateType;
    userDirection?: string;
    previousSummary?: string;
    summaryMode?: SummaryMode;
    sourceMode?: 'compress';
    retryCount?: number;
    phase?: DeepReadPhase;
}

export interface DeepReadState {
    tasks: DeepReadTask[];
    taskByCollectionId: Record<string, DeepReadTask>;
    currentTask: DeepReadTask | null;
    paused: boolean;
    /** 是否已从 API 同步过待精读项 */
    pendingSyncDone: boolean;
    abortController: AbortController | null;
    /** 本次会话累计完成数 */
    completedCount: number;
    completedContent: Record<string, string>;
    completedRawContent: Record<string, string>;
    /** 精读完成后 API 返回的完整收藏项，供详情页刷新 */
    completedCollections: Record<string, Collection>;

    /** 从 API 拉取未精读链接并入队（App 启动时调用一次） */
    syncPendingFromApi: () => Promise<void>;
    enqueue: (collectionId: string, url: string, title: string, priority?: number, options?: DeepReadEnqueueOptions) => void;
    enqueueBatch: (items: { id: string; url: string; title: string; rawContent?: string }[]) => void;
    startProcessing: () => void;
    pause: () => void;
    cancelTask: (collectionId: string) => void;
    cancelAll: () => void;
    retryTask: (collectionId: string) => void;
    getTaskStatus: (collectionId: string) => DeepReadTask | undefined;
}

export const useDeepReadStore = create<DeepReadState>((set, get) => ({
    tasks: [],
    taskByCollectionId: {},
    currentTask: null,
    paused: false,
    pendingSyncDone: false,
    abortController: null,
    completedCount: 0,
    completedContent: {},
    completedRawContent: {},
    completedCollections: {},

    syncPendingFromApi: async () => {
        if (get().pendingSyncDone) return;
        set({ pendingSyncDone: true });

        if (!useAppSettingsStore.getState().isAutoDeepReadEnabled()) {
            return;
        }

        try {
            const data = await api.getCollections({ page: 1, pageSize: 200, type: 'link' });
            const pending = data.items.filter((c) => c.url && !c.content);
            if (pending.length === 0) return;

            const state = get();
            const existingIds = new Set(state.tasks.map((t) => t.collectionId));
            const newTasks: DeepReadTask[] = pending
                .filter((c) => !existingIds.has(c.id))
                .map((c) => ({
                    collectionId: c.id,
                    url: c.url!,
                    title: c.title,
                    status: 'pending' as const,
                    priority: 0,
                    rawContent: c.rawContent || undefined,
                    images: c.images || undefined,
                    summaryMode: useAppSettingsStore.getState().getDefaultSummaryMode(),
                }));

            if (newTasks.length > 0) {
                const tasks = [...state.tasks, ...newTasks];
                set({ tasks, taskByCollectionId: syncTaskMap(tasks) });
            }
        } catch (err) {
            console.error('同步待精读队列失败:', err);
        } finally {
            if (!get().paused && !get().currentTask) {
                get().startProcessing();
            }
        }
    },

    enqueue: (collectionId, url, title, priority = 0, options = {}) => {
        const state = get();
        if (state.tasks.some((t) => t.collectionId === collectionId && t.status !== 'error')) return;

        const useCachedRaw = !options.refetch && options.rawContent?.trim();
        const newTask: DeepReadTask = {
            collectionId,
            url,
            title,
            status: 'pending',
            priority,
            rawContent: useCachedRaw ? options.rawContent!.trim() : undefined,
            images: options.images || undefined,
            refetch: options.refetch ?? false,
            templateType: options.templateType,
            userDirection: options.userDirection,
            previousSummary: options.previousSummary,
            summaryMode: options.summaryMode ?? useAppSettingsStore.getState().getDefaultSummaryMode(),
            sourceMode: options.sourceMode,
            retryCount: 0,
        };

        const completedContent = { ...state.completedContent };
        delete completedContent[collectionId];
        const completedRawContent = { ...state.completedRawContent };
        delete completedRawContent[collectionId];
        const completedCollections = { ...state.completedCollections };
        delete completedCollections[collectionId];

        const withoutExisting = state.tasks.filter((t) => t.collectionId !== collectionId);
        let tasks: DeepReadTask[];
        if (priority === 1) {
            const pending = withoutExisting.filter((t) => t.status === 'pending');
            const others = withoutExisting.filter((t) => t.status !== 'pending');
            tasks = [newTask, ...pending, ...others];
        } else {
            tasks = [...withoutExisting, newTask];
        }
        set({ tasks, taskByCollectionId: syncTaskMap(tasks), completedContent, completedRawContent, completedCollections });

        if (!state.currentTask && !state.paused) {
            get().startProcessing();
        }
    },

    enqueueBatch: (items) => {
        const state = get();
        const existingIds = new Set(state.tasks.map((t) => t.collectionId));
        const newTasks: DeepReadTask[] = items
            .filter((item) => !existingIds.has(item.id))
            .map((item) => ({
                collectionId: item.id,
                url: item.url,
                title: item.title,
                status: 'pending' as const,
                priority: 0,
                rawContent: item.rawContent,
                summaryMode: useAppSettingsStore.getState().getDefaultSummaryMode(),
                retryCount: 0,
            }));
        if (newTasks.length === 0) return;
        const tasks = [...state.tasks, ...newTasks];
        set({ tasks, taskByCollectionId: syncTaskMap(tasks) });
        if (!state.currentTask && !state.paused) {
            get().startProcessing();
        }
    },

    startProcessing: () => {
        const state = get();
        if (state.currentTask) return;
        if (state.paused) {
            set({ paused: false });
        }

        const freshState = get();
        const nextTask = freshState.tasks.find((t) => t.status === 'pending');
        if (!nextTask) return;

        const controller = new AbortController();
        const phase: DeepReadPhase =
            nextTask.rawContent && !nextTask.refetch ? 'summarizing' : 'fetching';
        const processingTask: DeepReadTask = { ...nextTask, status: 'processing', phase };
        const tasks = freshState.tasks.map((t) =>
            t.collectionId === nextTask.collectionId ? processingTask : t
        );

        set({ tasks, taskByCollectionId: syncTaskMap(tasks), currentTask: processingTask, abortController: controller });

        processTask(processingTask, controller.signal)
            .then((result) => {
                if (controller.signal.aborted) return;
                const mode = processingTask.summaryMode ?? 'detailed';
                const existing = useCollectionStore.getState().collections.find(
                    (c) => c.id === processingTask.collectionId,
                );
                const updatePayload = buildDeepReadCollectionUpdate(
                    mode,
                    result.summary,
                    result.rawContent,
                    result.images ?? '',
                    existing,
                    { skipRawContentUpdate: processingTask.sourceMode === 'compress' },
                );
                if (existing) {
                    const metaPatch = inferTitleUpdate(existing, {
                        pageTitle: result.pageTitle,
                        rawContent: result.rawContent,
                        summary: result.summary,
                    });
                    if (metaPatch.title) updatePayload.title = metaPatch.title;
                    if (metaPatch.description) updatePayload.description = metaPatch.description;
                }
                return api.updateCollection(processingTask.collectionId, updatePayload);
            })
            .then((updatedCollection) => {
                if (controller.signal.aborted) return;

                const state = get();
                const tasks = state.tasks.filter((t) => t.collectionId !== processingTask.collectionId);
                const completedContent = {
                    ...state.completedContent,
                    [processingTask.collectionId]: updatedCollection?.content || '',
                };
                const completedRawContent = {
                    ...state.completedRawContent,
                    [processingTask.collectionId]: updatedCollection?.rawContent || '',
                };
                const completedCollections = updatedCollection
                    ? {
                        ...state.completedCollections,
                        [processingTask.collectionId]: updatedCollection,
                    }
                    : state.completedCollections;
                set({
                    tasks,
                    taskByCollectionId: syncTaskMap(tasks),
                    currentTask: null,
                    abortController: null,
                    completedContent,
                    completedRawContent,
                    completedCollections,
                    completedCount: state.completedCount + 1,
                });
                useCollectionStore.getState().updateSummary(
                    processingTask.collectionId,
                    updatedCollection,
                );
                scheduleNextProcess(PROCESS_INTERVAL);
            })
            .catch((err) => {
                if (controller.signal.aborted) {
                    const state = get();
                    const tasks = state.tasks.filter((t) => t.collectionId !== processingTask.collectionId);
                    set({ tasks, taskByCollectionId: syncTaskMap(tasks), currentTask: null, abortController: null });
                    return;
                }

                const classified = classifyDeepReadError(err);
                const retryCount = processingTask.retryCount ?? 0;
                const maxRetries = getMaxAutoRetries();

                if (classified.retryable && retryCount < maxRetries) {
                    const delay = getRetryBackoffMs(retryCount);
                    const retryState = get();
                    const tasks = retryState.tasks.map((t) =>
                        t.collectionId === processingTask.collectionId
                            ? {
                                  ...t,
                                  status: 'pending' as const,
                                  retryCount: retryCount + 1,
                                  error: undefined,
                                  phase: undefined,
                              }
                            : t
                    );
                    set({ tasks, taskByCollectionId: syncTaskMap(tasks), currentTask: null, abortController: null });
                    scheduleNextProcess(delay);
                    return;
                }

                const state = get();
                const tasks = state.tasks.map((t) =>
                    t.collectionId === processingTask.collectionId
                        ? { ...t, status: 'error' as const, error: classified.message, phase: undefined }
                        : t
                );
                set({ tasks, taskByCollectionId: syncTaskMap(tasks), currentTask: null, abortController: null });
                scheduleNextProcess(PROCESS_INTERVAL);
            });
    },

    pause: () => {
        const state = get();
        state.abortController?.abort();
        set({ paused: true, currentTask: null, abortController: null });
    },

    cancelTask: (collectionId: string) => {
        const state = get();
        if (state.currentTask?.collectionId === collectionId) {
            state.abortController?.abort();
            const tasks = state.tasks.filter((t) => t.collectionId !== collectionId);
            set({ tasks, taskByCollectionId: syncTaskMap(tasks), currentTask: null, abortController: null });
            scheduleNextProcess(PROCESS_INTERVAL);
        } else {
            const tasks = state.tasks.filter((t) => t.collectionId !== collectionId);
            set({ tasks, taskByCollectionId: syncTaskMap(tasks) });
        }
    },

    cancelAll: () => {
        const state = get();
        state.abortController?.abort();
        set({
            tasks: [],
            taskByCollectionId: {},
            currentTask: null,
            abortController: null,
            paused: false,
        });
    },

    retryTask: (collectionId: string) => {
        const state = get();
        const tasks = state.tasks.map((t) =>
            t.collectionId === collectionId
                ? { ...t, status: 'pending' as const, error: undefined, retryCount: 0, phase: undefined }
                : t
        );
        set({ tasks, taskByCollectionId: syncTaskMap(tasks) });
        if (!state.currentTask && !state.paused) {
            get().startProcessing();
        }
    },

    getTaskStatus: (collectionId: string) => get().taskByCollectionId[collectionId],
}));

async function processTask(
    task: DeepReadTask,
    signal: AbortSignal
): Promise<DeepReadResult> {
    const rawContent = task.refetch ? undefined : task.rawContent;
    return api.deepRead(task.url, {
        signal,
        rawContent,
        images: task.images,
        refetch: task.refetch,
        templateType: task.templateType,
        userDirection: task.userDirection,
        previousSummary: task.previousSummary,
        summaryMode: task.summaryMode,
        sourceMode: task.sourceMode,
    });
}

function scheduleNextProcess(delayMs: number) {
    setTimeout(() => {
        const state = useDeepReadStore.getState();
        if (!state.paused) {
            state.startProcessing();
        }
    }, delayMs);
}
