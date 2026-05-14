/**
 * 数据管理页面 - 提供数据导入/导出、备份恢复功能
 * 桌面端额外支持本地备份恢复和存储信息查看
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { isTauriEnvironment } from '@favorites/shared/services/createApi';
import type { ImportResult, AiConfig } from '../types';
import * as api from '../services/api';
import './DataManage.css';

/** 备份记录类型 */
interface BackupRecord {
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
}

/** 存储信息类型 */
interface StorageInfo {
    dataDir: string;
    dbSize: number;
    uploadsSize: number;
}

const isDesktop = isTauriEnvironment();

/**
 * 格式化文件大小为人类可读格式
 * @param bytes - 文件大小（字节）
 * @returns 格式化后的字符串
 */
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 格式化 ISO 时间为本地可读格式
 * @param iso - ISO 8601 时间字符串
 * @returns 格式化后的日期时间
 */
function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString('zh-CN');
    } catch {
        return iso;
    }
}

/**
 * 数据管理页面组件
 */
export default function DataManage() {
    const { showToast, showConfirm } = useToast();

    // 导出状态
    const [exportingJSON, setExportingJSON] = useState(false);
    const [exportingHTML, setExportingHTML] = useState(false);

    // 导入状态
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [pendingFile, setPendingFile] = useState<{ file: File; type: 'json' | 'html' } | null>(null);

    // 拖拽状态
    const [dragOver, setDragOver] = useState(false);

    // 桌面端数据管理状态
    const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
    const [backups, setBackups] = useState<BackupRecord[]>([]);
    const [backingUp, setBackingUp] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [_loadingStorage, setLoadingStorage] = useState(false);

    // AI 设置状态
    const [aiConfig, setAiConfigState] = useState<AiConfig>({ apiUrl: '', apiKey: '', model: '' });
    const [savingAiConfig, setSavingAiConfig] = useState(false);
    const [testingAi, setTestingAi] = useState(false);
    const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string; model?: string } | null>(null);

    // 文件输入引用
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const htmlInputRef = useRef<HTMLInputElement>(null);

    /**
     * 加载桌面端存储信息和备份列表
     */
    const loadDesktopData = useCallback(async () => {
        if (!isDesktop) return;
        setLoadingStorage(true);
        try {
            const info = await api.getStorageInfo();
            setStorageInfo(info);
            const list = await api.listBackups();
            setBackups(list);
            const config = await api.getAiConfig();
            setAiConfigState(config);
        } catch (err) {
            showToast((err as Error).message || '加载存储信息失败', 'error');
        } finally {
            setLoadingStorage(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadDesktopData();
    }, [loadDesktopData]);

    /**
     * 处理 JSON 导出
     */
    const handleExportJSON = useCallback(async () => {
        setExportingJSON(true);
        try {
            await api.exportJSON();
            showToast('JSON 备份导出成功', 'success');
        } catch (err) {
            showToast((err as Error).message || '导出失败', 'error');
        } finally {
            setExportingJSON(false);
        }
    }, [showToast]);

    /**
     * 处理 HTML 书签导出
     */
    const handleExportHTML = useCallback(async () => {
        setExportingHTML(true);
        try {
            await api.exportHTML();
            showToast('HTML 书签导出成功', 'success');
        } catch (err) {
            showToast((err as Error).message || '导出失败', 'error');
        } finally {
            setExportingHTML(false);
        }
    }, [showToast]);

    /**
     * 处理文件选择
     * @param file - 选择的文件
     * @param type - 导入类型
     */
    const handleFileSelect = useCallback((file: File, type: 'json' | 'html') => {
        setImportResult(null);
        setPendingFile({ file, type });
    }, []);

    /**
     * 确认导入
     */
    const handleConfirmImport = useCallback(async () => {
        if (!pendingFile) return;

        const confirmed = await showConfirm({
            title: '确认导入',
            message: `确定要导入文件「${pendingFile.file.name}」吗？\n重复的数据将被跳过。`,
            confirmText: '确定导入',
            cancelText: '取消',
        });

        if (!confirmed) {
            setPendingFile(null);
            return;
        }

        setImporting(true);
        setImportResult(null);

        try {
            let result: ImportResult;
            if (pendingFile.type === 'json') {
                result = await api.importJSON(pendingFile.file);
            } else {
                result = await api.importHTML(pendingFile.file);
            }

            setImportResult(result);

            const total = result.collectionsCreated + result.foldersCreated + result.tagsCreated;
            if (total > 0) {
                showToast(`导入成功：${result.collectionsCreated} 个收藏项，${result.foldersCreated} 个文件夹，${result.tagsCreated} 个标签`, 'success');
            } else {
                showToast('没有新数据被导入（全部已存在）', 'info');
            }
        } catch (err) {
            showToast((err as Error).message || '导入失败', 'error');
        } finally {
            setImporting(false);
            setPendingFile(null);
        }
    }, [pendingFile, showConfirm, showToast]);

    /**
     * 取消待导入文件
     */
    const handleCancelImport = useCallback(() => {
        setPendingFile(null);
    }, []);

    /**
     * 创建数据库备份
     */
    const handleBackup = useCallback(async () => {
        setBackingUp(true);
        try {
            const path = await api.backupDatabase();
            showToast(`备份成功：${path}`, 'success');
            loadDesktopData();
        } catch (err) {
            showToast((err as Error).message || '备份失败', 'error');
        } finally {
            setBackingUp(false);
        }
    }, [showToast, loadDesktopData]);

    /**
     * 从备份恢复数据库
     * @param backupPath - 备份文件路径
     */
    const handleRestore = useCallback(async (backupPath: string) => {
        const confirmed = await showConfirm({
            title: '确认恢复',
            message: '恢复备份将替换当前所有数据，此操作不可撤销。\n确定要继续吗？',
            confirmText: '确定恢复',
            cancelText: '取消',
        });

        if (!confirmed) return;

        setRestoring(true);
        try {
            await api.restoreDatabase(backupPath);
            showToast('数据恢复成功，页面将刷新', 'success');
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            showToast((err as Error).message || '恢复失败', 'error');
        } finally {
            setRestoring(false);
        }
    }, [showConfirm, showToast]);

    /**
     * 删除备份文件
     * @param path - 备份文件路径
     */
    const handleDeleteBackup = useCallback(async (path: string) => {
        const confirmed = await showConfirm({
            title: '删除备份',
            message: '确定要删除此备份文件吗？此操作不可撤销。',
            confirmText: '删除',
            cancelText: '取消',
        });

        if (!confirmed) return;

        try {
            await api.deleteBackup(path);
            showToast('备份已删除', 'success');
            loadDesktopData();
        } catch (err) {
            showToast((err as Error).message || '删除失败', 'error');
        }
    }, [showConfirm, showToast, loadDesktopData]);

    /**
     * 保存 AI API 配置
     */
    const handleSaveAiConfig = useCallback(async () => {
        setSavingAiConfig(true);
        try {
            await api.setAiConfig(aiConfig);
            showToast('AI 设置已保存', 'success');
        } catch (err) {
            showToast((err as Error).message || '保存失败', 'error');
        } finally {
            setSavingAiConfig(false);
        }
    }, [aiConfig, showToast]);

    /**
     * 测试 AI API 连接
     */
    const handleTestAiConnection = useCallback(async () => {
        setTestingAi(true);
        setAiTestResult(null);
        try {
            const result = await api.testAiConnection();
            setAiTestResult({ success: true, message: result.message, model: result.model });
            showToast(result.message, 'success');
        } catch (err) {
            setAiTestResult({ success: false, message: (err as Error).message });
            showToast((err as Error).message, 'error');
        } finally {
            setTestingAi(false);
        }
    }, [showToast]);

    /**
     * 处理拖拽进入
     * @param e - 拖拽事件
     */
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    /**
     * 处理拖拽离开
     */
    const handleDragLeave = useCallback(() => {
        setDragOver(false);
    }, []);

    /**
     * 处理文件拖放
     * @param e - 拖拽事件
     */
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);

        const file = e.dataTransfer.files[0];
        if (!file) return;

        if (file.name.endsWith('.json')) {
            handleFileSelect(file, 'json');
        } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
            handleFileSelect(file, 'html');
        } else {
            showToast('请拖入 JSON 或 HTML 文件', 'error');
        }
    }, [handleFileSelect, showToast]);

    /**
     * 处理 JSON 文件选择器变化
     * @param e - 文件输入事件
     */
    const handleJsonInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file, 'json');
        }
        e.target.value = '';
    }, [handleFileSelect]);

    /**
     * 处理 HTML 文件选择器变化
     * @param e - 文件输入事件
     */
    const handleHtmlInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file, 'html');
        }
        e.target.value = '';
    }, [handleFileSelect]);

    return (
        <div className="data-manage">
            <h2 className="data-manage-title">数据管理</h2>

            {/* 桌面端：存储信息与备份恢复 */}
            {isDesktop && (
                <div className="data-manage-card">
                    <h3 className="data-manage-card-title">本地数据管理</h3>
                    <p className="data-manage-card-desc">管理本地数据库的备份与恢复，查看存储空间占用。</p>

                    {/* 存储信息 */}
                    {storageInfo && (
                        <div className="data-manage-storage-info">
                            <div className="data-manage-storage-item">
                                <span className="data-manage-storage-label">数据目录</span>
                                <span className="data-manage-storage-value">{storageInfo.dataDir}</span>
                            </div>
                            <div className="data-manage-storage-item">
                                <span className="data-manage-storage-label">数据库大小</span>
                                <span className="data-manage-storage-value">{formatSize(storageInfo.dbSize)}</span>
                            </div>
                            <div className="data-manage-storage-item">
                                <span className="data-manage-storage-label">上传文件大小</span>
                                <span className="data-manage-storage-value">{formatSize(storageInfo.uploadsSize)}</span>
                            </div>
                        </div>
                    )}

                    <div className="data-manage-actions">
                        <button
                            className="data-manage-btn data-manage-btn-primary"
                            onClick={handleBackup}
                            disabled={backingUp}
                        >
                            {backingUp ? <span className="data-manage-spinner" /> : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                                    <polyline points="17 21 17 13 7 13 7 21" />
                                    <polyline points="7 3 7 8 15 8" />
                                </svg>
                            )}
                            {backingUp ? '备份中...' : '创建备份'}
                        </button>
                    </div>

                    {/* 备份列表 */}
                    {backups.length > 0 && (
                        <div className="data-manage-backups-list">
                            <h4 className="data-manage-backups-title">备份列表</h4>
                            {backups.map((backup) => (
                                <div key={backup.path} className="data-manage-backup-item">
                                    <div className="data-manage-backup-info">
                                        <span className="data-manage-backup-name">{backup.name}</span>
                                        <span className="data-manage-backup-meta">
                                            {formatSize(backup.size)} · {formatDate(backup.modifiedAt)}
                                        </span>
                                    </div>
                                    <div className="data-manage-backup-actions">
                                        <button
                                            className="data-manage-btn data-manage-btn-sm data-manage-btn-primary"
                                            onClick={() => handleRestore(backup.path)}
                                            disabled={restoring}
                                        >
                                            恢复
                                        </button>
                                        <button
                                            className="data-manage-btn data-manage-btn-sm data-manage-btn-cancel"
                                            onClick={() => handleDeleteBackup(backup.path)}
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 桌面端：AI API 设置 */}
            {isDesktop && (
                <div className="data-manage-card">
                    <h3 className="data-manage-card-title">AI 服务设置</h3>
                    <p className="data-manage-card-desc">配置用于精读摘要和智能标签匹配的 AI API。支持 OpenAI 兼容接口（如 DeepSeek、Moonshot 等）。</p>

                    <div className="data-manage-settings-form">
                        <div className="data-manage-settings-item">
                            <label className="data-manage-settings-label">API 地址</label>
                            <input
                                type="text"
                                className="data-manage-settings-input"
                                value={aiConfig.apiUrl}
                                onChange={(e) => setAiConfigState({ ...aiConfig, apiUrl: e.target.value })}
                                placeholder="https://api.openai.com/v1"
                            />
                        </div>
                        <div className="data-manage-settings-item">
                            <label className="data-manage-settings-label">API Key</label>
                            <input
                                type="password"
                                className="data-manage-settings-input"
                                value={aiConfig.apiKey}
                                onChange={(e) => setAiConfigState({ ...aiConfig, apiKey: e.target.value })}
                                placeholder="sk-..."
                            />
                        </div>
                        <div className="data-manage-settings-item">
                            <label className="data-manage-settings-label">模型名称</label>
                            <input
                                type="text"
                                className="data-manage-settings-input"
                                value={aiConfig.model}
                                onChange={(e) => setAiConfigState({ ...aiConfig, model: e.target.value })}
                                placeholder="gpt-4o-mini"
                            />
                        </div>
                        <button
                            className="data-manage-btn data-manage-btn-primary"
                            onClick={handleSaveAiConfig}
                            disabled={savingAiConfig}
                        >
                            {savingAiConfig ? <span className="data-manage-spinner" /> : null}
                            {savingAiConfig ? '保存中...' : '保存设置'}
                        </button>
                        <button
                            className="data-manage-btn data-manage-btn-dashed"
                            onClick={handleTestAiConnection}
                            disabled={testingAi}
                        >
                            {testingAi ? <span className="data-manage-spinner" /> : null}
                            {testingAi ? '测试中...' : '测试连接'}
                        </button>
                        {aiTestResult && (
                            <div className={`data-manage-ai-feedback ${aiTestResult.success ? 'success' : 'error'}`}>
                                {aiTestResult.success ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="15" y1="9" x2="9" y2="15" />
                                        <line x1="9" y1="9" x2="15" y2="15" />
                                    </svg>
                                )}
                                <span>{aiTestResult.message}</span>
                                {aiTestResult.success && aiTestResult.model && (
                                    <span className="data-manage-ai-feedback-model">模型: {aiTestResult.model}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 导出区域 */}
            <div className="data-manage-card">
                <h3 className="data-manage-card-title">数据导出</h3>
                <p className="data-manage-card-desc">将你的收藏数据导出为备份文件，可用于数据迁移和恢复。</p>

                <div className="data-manage-actions">
                    <button
                        className="data-manage-btn data-manage-btn-primary"
                        onClick={handleExportJSON}
                        disabled={exportingJSON}
                    >
                        {exportingJSON ? (
                            <span className="data-manage-spinner" />
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                        )}
                        {exportingJSON ? '导出中...' : '导出 JSON 备份'}
                    </button>
                    <span className="data-manage-btn-hint">包含全部收藏、文件夹和标签数据</span>

                    <button
                        className="data-manage-btn data-manage-btn-primary"
                        onClick={handleExportHTML}
                        disabled={exportingHTML}
                    >
                        {exportingHTML ? (
                            <span className="data-manage-spinner" />
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                        )}
                        {exportingHTML ? '导出中...' : '导出 HTML 书签'}
                    </button>
                    <span className="data-manage-btn-hint">浏览器通用格式，可导入 Chrome/Edge/Safari</span>
                </div>
            </div>

            {/* 导入区域 */}
            <div className="data-manage-card">
                <h3 className="data-manage-card-title">数据导入</h3>
                <p className="data-manage-card-desc">从备份文件或浏览器书签文件导入数据。重复的数据将被自动跳过。</p>

                <div className="data-manage-actions">
                    <button
                        className="data-manage-btn data-manage-btn-dashed"
                        onClick={() => jsonInputRef.current?.click()}
                        disabled={importing}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        导入 JSON 备份
                    </button>
                    <span className="data-manage-btn-hint">选择 .json 备份文件</span>

                    <button
                        className="data-manage-btn data-manage-btn-dashed"
                        onClick={() => htmlInputRef.current?.click()}
                        disabled={importing}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        导入浏览器书签
                    </button>
                    <span className="data-manage-btn-hint">选择浏览器导出的 .html 书签文件</span>
                </div>

                {/* 拖拽上传区域 */}
                <div
                    className={`data-manage-dropzone ${dragOver ? 'drag-over' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>拖拽文件到此处上传</span>
                    <span className="data-manage-dropzone-hint">支持 .json 和 .html 文件</span>
                </div>

                {/* 隐藏的文件输入 */}
                <input
                    ref={jsonInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleJsonInputChange}
                />
                <input
                    ref={htmlInputRef}
                    type="file"
                    accept=".html,.htm"
                    style={{ display: 'none' }}
                    onChange={handleHtmlInputChange}
                />
            </div>

            {/* 待导入确认 */}
            {pendingFile && (
                <div className="data-manage-card data-manage-confirm">
                    <div className="data-manage-confirm-info">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="data-manage-confirm-filename">{pendingFile.file.name}</span>
                        <span className="data-manage-confirm-size">
                            ({(pendingFile.file.size / 1024).toFixed(1)} KB)
                        </span>
                    </div>
                    <div className="data-manage-confirm-actions">
                        <button
                            className="data-manage-btn data-manage-btn-primary data-manage-btn-sm"
                            onClick={handleConfirmImport}
                            disabled={importing}
                        >
                            {importing ? <span className="data-manage-spinner" /> : '确定导入'}
                        </button>
                        <button
                            className="data-manage-btn data-manage-btn-cancel data-manage-btn-sm"
                            onClick={handleCancelImport}
                            disabled={importing}
                        >
                            取消
                        </button>
                    </div>
                </div>
            )}

            {/* 导入结果 */}
            {importResult && (
                <div className="data-manage-card data-manage-result">
                    <h4 className="data-manage-result-title">导入结果</h4>
                    <div className="data-manage-result-grid">
                        <div className="data-manage-result-item">
                            <span className="data-manage-result-value">{importResult.collectionsCreated}</span>
                            <span className="data-manage-result-label">收藏项导入</span>
                        </div>
                        <div className="data-manage-result-item">
                            <span className="data-manage-result-value">{importResult.foldersCreated}</span>
                            <span className="data-manage-result-label">文件夹创建</span>
                        </div>
                        <div className="data-manage-result-item">
                            <span className="data-manage-result-value">{importResult.tagsCreated}</span>
                            <span className="data-manage-result-label">标签创建</span>
                        </div>
                        <div className="data-manage-result-item">
                            <span className="data-manage-result-value">{importResult.collectionsSkipped}</span>
                            <span className="data-manage-result-label">重复跳过</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}