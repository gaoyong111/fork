/**
 * Layout 组件 - 整体布局（可折叠侧边栏 + 主内容区）
 * 注册全局快捷键：N 新建收藏、Ctrl/Cmd+K 聚焦搜索、Escape 退出批量模式
 * 移动端显示快速收藏浮动按钮（FAB）
 */

import { useState, useCallback, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import {
    applyScrollPosition,
    getScrollKey,
    isListRoute,
    saveScrollPosition,
} from '../hooks/useScrollRestoration';
import { LayoutScrollContext } from '../contexts/LayoutScrollContext';
import './Layout.css';

interface LayoutProps {
    /** 侧边栏内容 */
    sidebar: ReactNode;
    /** 主内容区 */
    content: ReactNode;
    /** 快速收藏按钮点击回调 */
    onQuickSave?: () => void;
}

/**
 * 整体布局组件
 * 包含可折叠的侧边栏和主内容区
 * @param props - 组件属性
 * @param props.sidebar - 侧边栏内容
 * @param props.content - 主内容区内容
 * @param props.onQuickSave - 快速收藏回调
 */
export default function Layout({ sidebar, content, onQuickSave }: LayoutProps) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollKey = getScrollKey(location.pathname, location.search);
    const listRoute = isListRoute(location.pathname);

    /** 非列表页：外层 layout-content 滚动并记忆位置 */
    useEffect(() => {
        if (listRoute) return;
        const el = contentRef.current;
        if (!el) return;

        const onScroll = () => saveScrollPosition(scrollKey, el.scrollTop);
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [scrollKey, listRoute]);

    useLayoutEffect(() => {
        if (listRoute) return;
        const el = contentRef.current;
        if (!el) return;
        applyScrollPosition(el, scrollKey);
    }, [scrollKey, listRoute]);

    /**
     * N 键：跳转到新建收藏页
     */
    const handleNew = useCallback(() => {
        navigate('/add');
    }, [navigate]);

    /**
     * Ctrl/Cmd + K：聚焦搜索框
     * 通过自定义事件通知 CollectionList 中的 SearchBar
     */
    const handleFocusSearch = useCallback(() => {
        document.dispatchEvent(new CustomEvent('open-search-overlay'));
    }, []);

    /**
     * Escape：通知子组件退出批量模式
     */
    const handleEscape = useCallback(() => {
        document.dispatchEvent(new CustomEvent('exit-batch-mode'));
    }, []);

    // 注册全局快捷键
    useKeyboardShortcuts({
        onNew: handleNew,
        onFocusSearch: handleFocusSearch,
        onEscape: handleEscape,
    });

    return (
        <div className="layout">
            <aside className={`layout-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
                {sidebar}
            </aside>

            <main className="layout-main">
                <header className="layout-header">
                    <button
                        className="layout-toggle-btn"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            {sidebarCollapsed ? (
                                <>
                                    <line x1="3" y1="6" x2="21" y2="6" />
                                    <line x1="3" y1="12" x2="21" y2="12" />
                                    <line x1="3" y1="18" x2="21" y2="18" />
                                </>
                            ) : (
                                <>
                                    <line x1="3" y1="6" x2="21" y2="6" />
                                    <line x1="3" y1="12" x2="15" y2="12" />
                                    <line x1="3" y1="18" x2="18" y2="18" />
                                </>
                            )}
                        </svg>
                    </button>
                    <div className="layout-header-title">收藏夹</div>
                    <div className="layout-header-actions">
                        <Link to="/settings" className="layout-settings-btn" title="设置">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                            </svg>
                        </Link>
                        <Link to="/add" className="layout-add-btn">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            添加收藏
                        </Link>
                    </div>
                </header>

                <div
                    className={`layout-content${listRoute ? ' layout-content--list' : ''}`}
                    ref={contentRef}
                >
                    <LayoutScrollContext.Provider value={contentRef}>
                        {content}
                    </LayoutScrollContext.Provider>
                </div>
            </main>

            {/* 移动端快速收藏浮动按钮 */}
            {onQuickSave && (
                <button
                    className="layout-fab"
                    onClick={onQuickSave}
                    aria-label="快速收藏"
                    title="从剪贴板快速收藏"
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                </button>
            )}
        </div>
    );
}
