/**
 * 数据管理页面 - 提供数据导入/导出功能
 * 包含 JSON 备份导出/导入和浏览器书签 HTML 导出/导入
 */

import { useState, useRef, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import type { ImportResult } from '../types';
import * as api from '../services/api';
import './DataManage.css';

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

    // 文件输入引用
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const htmlInputRef = useRef<HTMLInputElement>(null);

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
        // 重置 input 以允许重复选择同一文件
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
