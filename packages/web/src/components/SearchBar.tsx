/**
 * SearchBar 组件 - 搜索栏组件
 * 支持输入关键词搜索收藏项
 * 支持通过 ref 外部调用 focus()
 */

import React, { useState, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import './SearchBar.css';

interface SearchBarProps {
    /** 搜索回调 */
    onSearch: (keyword: string) => void;
    /** 当前搜索关键词 */
    value?: string;
    /** 占位文字 */
    placeholder?: string;
}

/**
 * SearchBar 暴露的方法
 */
export interface SearchBarRef {
    /** 聚焦搜索输入框 */
    focus: () => void;
}

/**
 * 搜索栏组件
 * @param props - 组件属性
 */
const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(function SearchBar(
    { onSearch, value: externalValue, placeholder = '搜索收藏...' },
    ref,
) {
    const [internalValue, setInternalValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const value = externalValue !== undefined ? externalValue : internalValue;

    useImperativeHandle(ref, () => ({
        focus: () => {
            inputRef.current?.focus();
        },
    }));

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = e.target.value;
            if (externalValue === undefined) {
                setInternalValue(newValue);
            }
            onSearch(newValue);
        },
        [externalValue, onSearch],
    );

    const handleClear = useCallback(() => {
        if (externalValue === undefined) {
            setInternalValue('');
        }
        onSearch('');
    }, [externalValue, onSearch]);

    return (
        <div className="search-bar">
            <svg
                className="search-bar-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
                ref={inputRef}
                type="text"
                className="search-bar-input"
                value={value}
                onChange={handleChange}
                placeholder={placeholder}
            />

            {value && (
                <button className="search-bar-clear" onClick={handleClear}>
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            )}
        </div>
    );
});

export default SearchBar;
