/**
 * DeepReadProgress 组件 - 精读队列进度浮条
 */

import { useState } from 'react';
import { useDeepReadStore, type DeepReadTask } from '../store/deepReadStore';
import './DeepReadProgress.css';

function phaseLabel(task: DeepReadTask): string {
    if (task.status === 'processing') {
        return task.phase === 'summarizing' ? '生成摘要' : '抓取正文';
    }
    return {
        pending: '等待中',
        processing: '精读中',
        done: '已完成',
        error: '失败',
    }[task.status];
}

export default function DeepReadProgress() {
    const tasks = useDeepReadStore((s) => s.tasks);
    const currentTask = useDeepReadStore((s) => s.currentTask);
    const paused = useDeepReadStore((s) => s.paused);
    const completedCount = useDeepReadStore((s) => s.completedCount);
    const startProcessing = useDeepReadStore((s) => s.startProcessing);
    const pause = useDeepReadStore((s) => s.pause);
    const cancelTask = useDeepReadStore((s) => s.cancelTask);
    const cancelAll = useDeepReadStore((s) => s.cancelAll);
    const retryTask = useDeepReadStore((s) => s.retryTask);
    const [expanded, setExpanded] = useState(false);

    const pendingCount = tasks.filter((t) => t.status === 'pending').length;
    const errorCount = tasks.filter((t) => t.status === 'error').length;
    const activeCount = pendingCount + (currentTask ? 1 : 0);
    const total = activeCount + completedCount + errorCount;

    if (activeCount === 0 && errorCount === 0 && completedCount === 0) return null;

    return (
        <div className="deep-read-progress">
            {!expanded ? (
                <div className="deep-read-progress-bar" onClick={() => setExpanded(true)}>
                    <div className="deep-read-progress-info">
                        {paused ? (
                            <span className="deep-read-progress-paused">
                                精读已暂停 · {pendingCount} 项待处理
                            </span>
                        ) : currentTask ? (
                            <span className="deep-read-progress-active">
                                {phaseLabel(currentTask)} {completedCount + 1}/{total} · 「
                                {currentTask.title.length > 20
                                    ? currentTask.title.slice(0, 20) + '...'
                                    : currentTask.title}」
                            </span>
                        ) : (
                            <span className="deep-read-progress-active">
                                精读队列 · 已完成 {completedCount} · 待处理 {pendingCount}
                            </span>
                        )}
                    </div>
                    <div className="deep-read-progress-actions">
                        {paused ? (
                            <button
                                className="deep-read-progress-btn"
                                onClick={(e) => { e.stopPropagation(); startProcessing(); }}
                            >
                                继续
                            </button>
                        ) : (
                            <button
                                className="deep-read-progress-btn"
                                onClick={(e) => { e.stopPropagation(); pause(); }}
                            >
                                暂停
                            </button>
                        )}
                        <button
                            className="deep-read-progress-btn deep-read-progress-btn-danger"
                            onClick={(e) => { e.stopPropagation(); cancelAll(); }}
                        >
                            取消全部
                        </button>
                        <button
                            className="deep-read-progress-expand-btn"
                            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                            title="展开队列详情"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="deep-read-progress-expanded">
                    <div className="deep-read-progress-header">
                        <span className="deep-read-progress-title">
                            精读队列 · 已完成 {completedCount} · 待处理 {pendingCount} · 失败 {errorCount}
                        </span>
                        <button
                            className="deep-read-progress-collapse-btn"
                            onClick={() => setExpanded(false)}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="18 15 12 9 6 15" />
                            </svg>
                        </button>
                    </div>
                    <div className="deep-read-progress-list">
                        {tasks.map((task) => (
                            <TaskItem
                                key={task.collectionId}
                                task={task}
                                isCurrent={currentTask?.collectionId === task.collectionId}
                                onCancel={cancelTask}
                                onRetry={retryTask}
                            />
                        ))}
                    </div>
                    <div className="deep-read-progress-footer">
                        {paused ? (
                            <button className="deep-read-progress-btn" onClick={startProcessing}>
                                继续精读
                            </button>
                        ) : (
                            <button className="deep-read-progress-btn" onClick={pause}>
                                暂停
                            </button>
                        )}
                        <button className="deep-read-progress-btn deep-read-progress-btn-danger" onClick={cancelAll}>
                            取消全部
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function TaskItem({
    task,
    isCurrent,
    onCancel,
    onRetry,
}: {
    task: DeepReadTask;
    isCurrent: boolean;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
}) {
    const statusClass = {
        pending: 'status-pending',
        processing: 'status-processing',
        done: 'status-done',
        error: 'status-error',
    }[task.status];

    return (
        <div className={`deep-read-task-item ${isCurrent ? 'current' : ''}`}>
            <span className={`deep-read-task-status ${statusClass}`}>
                {task.status === 'processing' && <span className="deep-read-spinner" />}
                {phaseLabel(task)}
            </span>
            <span className="deep-read-task-title" title={task.title}>
                {task.title.length > 30 ? task.title.slice(0, 30) + '...' : task.title}
            </span>
            {task.status === 'error' && task.error && (
                <span className="deep-read-task-error">{task.error}</span>
            )}
            <div className="deep-read-task-actions">
                {task.status === 'error' && (
                    <button
                        className="deep-read-task-btn"
                        onClick={() => onRetry(task.collectionId)}
                        title="重试"
                    >
                        重试
                    </button>
                )}
                {(task.status === 'pending' || task.status === 'error') && (
                    <button
                        className="deep-read-task-btn deep-read-task-btn-danger"
                        onClick={() => onCancel(task.collectionId)}
                        title="取消"
                    >
                        取消
                    </button>
                )}
            </div>
        </div>
    );
}
