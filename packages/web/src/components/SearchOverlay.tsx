/**
 * SearchOverlay 组件 - Cmd+K 全局搜索面板
 * 支持 300ms 防抖搜索、键盘导航、结果高亮
 * 当 collectionStore 创建后可切换为 store 调用
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollectionStore } from '../store/collectionStore';
import type { SearchResultItem } from '../types';
import './SearchOverlay.css';

/** SearchOverlay 组件 props */
interface SearchOverlayProps {
    /** 是否显示搜索面板 */
    visible: boolean;
    /** 关闭回调 */
    onClose: () => void;
}

/** 类型标签映射 */
const TYPE_LABELS: Record<string, string> = {
    link: '链接',
    file: '文件',
    note: '笔记',
};

/**
 * 全局搜索面板组件
 * 提供防抖搜索、键盘上下选择、Enter 导航、ESC 关闭
 */
export default function SearchOverlay({ visible, onClose }: SearchOverlayProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined!)
    const navigate = useNavigate();

    /** 防抖搜索 */
    const doSearch = useCallback(async (keyword: string) => {
        if (!keyword.trim()) {
            setResults([]);
            setSelectedIndex(-1);
            return;
        }
        setLoading(true);
        try {
            const items = await useCollectionStore.getState().searchCollections(keyword.trim());
            setResults(items);
            setSelectedIndex(-1);
        } catch (err) {
            console.error('搜索失败:', err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    /** 输入变更，触发 300ms 防抖 */
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
            doSearch(value);
        }, 300);
    }, [doSearch]);

    /** 键盘导航 */
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
            return;
        }
        if (results.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % results.length);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
            return;
        }
        if (e.key === 'Enter' && selectedIndex >= 0) {
            const item = results[selectedIndex];
            navigate(`/collection/${item.id}`);
            onClose();
            return;
        }
    }, [results, selectedIndex, navigate, onClose]);

    /** 点击遮罩背景关闭 */
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    /** 点击结果项导航 */
    const handleResultClick = useCallback((item: SearchResultItem) => {
        navigate(`/collection/${item.id}`);
        onClose();
    }, [navigate, onClose]);

    /** visible 变化时聚焦/重置 */
    useEffect(() => {
        if (visible) {
            setQuery('');
            setResults([]);
            setSelectedIndex(-1);
            // 等面板渲染后聚焦
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
        if (!visible && debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
    }, [visible]);

    /** 清理防抖定时器 */
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    if (!visible) return null;

    /** 判断当前状态 */
    const showHint = !query.trim() && results.length === 0 && !loading;
    const showEmpty = query.trim() && !loading && results.length === 0;
    const showLoading = loading;
    const showResults = !loading && results.length > 0;

    return (
        <div className="search-overlay" onClick={handleBackdropClick}>
            <div className="search-panel">
                <div className="search-input-wrapper">
                    <svg className="search-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        className="search-input"
                        type="text"
                        placeholder="搜索收藏项..."
                        value={query}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                    />
                    {query && (
                        <button className="search-clear-btn" onClick={() => { setQuery(''); setResults([]); setSelectedIndex(-1); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="search-results">
                    {showHint && (
                        <div className="search-hint">
                            <p>输入关键词搜索收藏项</p>
                            <p className="search-hint-keys">
                                <kbd>↑</kbd> <kbd>↓</kbd> 选择
                                <kbd>Enter</kbd> 打开
                                <kbd>Esc</kbd> 关闭
                            </p>
                        </div>
                    )}

                    {showLoading && (
                        <div className="search-loading">
                            <div className="search-spinner" />
                            <span>正在搜索...</span>
                        </div>
                    )}

                    {showEmpty && (
                        <div className="search-empty">
                            未找到与 "{query}" 相关的收藏项
                        </div>
                    )}

                    {showResults && (
                        <ul className="search-result-list">
                            {results.map((item, index) => (
                                <li
                                    key={item.id}
                                    className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                                    onClick={() => handleResultClick(item)}
                                >
                                    <span className={`search-result-type type-${item.type}`}>
                                        {TYPE_LABELS[item.type] || item.type}
                                    </span>
                                    <span className="search-result-title">{item.title}</span>
                                    {item.isFavorite && (
                                        <svg className="search-result-fav" width="14" height="14" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="var(--color-primary)" strokeWidth="2">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                        </svg>
                                    )}
                                    {item.matchSnippet && (
                                        <span
                                            className="search-result-snippet"
                                            dangerouslySetInnerHTML={{ __html: item.matchSnippet }}
                                        />
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}