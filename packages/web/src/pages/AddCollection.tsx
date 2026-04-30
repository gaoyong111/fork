/**
 * AddCollection 页面组件 - 添加收藏
 * 表单：输入 URL/标题/选择文件夹/标签
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TagSelector from '../components/TagSelector';
import { CollectionType } from '../types';
import type { Tag, Folder } from '../types';
import * as api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import './AddCollection.css';

/**
 * 添加收藏页面组件
 * 提供表单创建新的收藏项
 */
export default function AddCollection() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    // 表单状态
    const [type, setType] = useState<CollectionType>(CollectionType.Link);
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [description, setDescription] = useState('');
    const [content, setContent] = useState('');
    const [folderId, setFolderId] = useState<string>('');
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [thumbnailUrl, setThumbnailUrl] = useState('');

    // 辅助数据
    const [folders, setFolders] = useState<Folder[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [fetchingMetadata, setFetchingMetadata] = useState(false);

    useEffect(() => {
        loadFormData();
    }, []);

    /**
     * 加载表单所需的辅助数据（文件夹和标签）
     */
    async function loadFormData() {
        try {
            const [folderData, tagData] = await Promise.all([
                api.getFolderTree(),
                api.getTags(),
            ]);
            setFolders(folderData);
            setTags(tagData);
        } catch (err) {
            console.error('加载表单数据失败:', err);
        }
    }

    /**
     * 提交表单
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim()) {
            showToast('请输入标题', 'warning');
            return;
        }

        try {
            setSubmitting(true);

            if (type === 'file' && file) {
                // 文件上传
                await api.uploadFile(file, folderId || undefined);
            } else {
                // 创建收藏
                await api.createCollection({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    url: type === 'link' ? url.trim() : undefined,
                    type,
                    content: type === 'note' ? content : undefined,
                    thumbnailUrl: thumbnailUrl || undefined,
                    folderId: folderId || undefined,
                    tagIds: tagIds.length > 0 ? tagIds : undefined,
                });
            }

            navigate('/');
        } catch (err) {
            console.error('创建收藏失败:', err);
            showToast('创建收藏失败，请重试', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * 扁平化文件夹树
     */
    const flattenFolders = (folderList: Folder[], depth: number = 0): { id: string; name: string; depth: number }[] => {
        const result: { id: string; name: string; depth: number }[] = [];
        for (const folder of folderList) {
            result.push({ id: folder.id, name: folder.name, depth });
            if (folder.children) {
                result.push(...flattenFolders(folder.children, depth + 1));
            }
        }
        return result;
    };

    /**
     * 处理文件选择
     */
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            if (!title) {
                setTitle(selectedFile.name);
            }
        }
    };

    /**
     * URL 输入框失焦时自动提取页面元数据
     * 仅在 URL 有效且用户未手动填写对应字段时才回填
     */
    const handleUrlBlur = async () => {
        const trimmedUrl = url.trim();
        if (!trimmedUrl || !trimmedUrl.startsWith('http')) return;

        setFetchingMetadata(true);
        try {
            const metadata = await api.fetchMetadata(trimmedUrl);
            // 回填逻辑：只填充用户未手动输入的字段
            if (metadata.title && !title.trim()) {
                setTitle(metadata.title);
            }
            if (metadata.description && !description.trim()) {
                setDescription(metadata.description);
            }
            if (metadata.coverUrl && !thumbnailUrl) {
                setThumbnailUrl(metadata.coverUrl);
            }
        } catch {
            // 静默忽略，不影响用户手动输入
        } finally {
            setFetchingMetadata(false);
        }
    };

    return (
        <div className="add-collection">
            <div className="add-collection-header">
                <h1 className="add-collection-title">添加收藏</h1>
                <p className="add-collection-desc">收藏网页链接、上传文件或创建笔记</p>
            </div>

            <form className="add-collection-form" onSubmit={handleSubmit}>
                {/* 类型选择 */}
                <div className="form-group">
                    <label className="form-label">收藏类型</label>
                    <div className="type-selector">
                        <button
                            type="button"
                            className={`type-btn ${type === CollectionType.Link ? 'active' : ''}`}
                            onClick={() => setType(CollectionType.Link)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                            网页链接
                        </button>
                        <button
                            type="button"
                            className={`type-btn ${type === CollectionType.File ? 'active' : ''}`}
                            onClick={() => setType(CollectionType.File)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            文件上传
                        </button>
                        <button
                            type="button"
                            className={`type-btn ${type === CollectionType.Note ? 'active' : ''}`}
                            onClick={() => setType(CollectionType.Note)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="17" y1="10" x2="3" y2="10" />
                                <line x1="21" y1="6" x2="3" y2="6" />
                                <line x1="21" y1="14" x2="3" y2="14" />
                                <line x1="17" y1="18" x2="3" y2="18" />
                            </svg>
                            笔记
                        </button>
                    </div>
                </div>

                {/* 标题 */}
                <div className="form-group">
                    <label className="form-label">
                        标题 <span className="form-required">*</span>
                    </label>
                    <input
                        type="text"
                        className="form-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="请输入标题"
                        required
                    />
                </div>

                {/* URL（仅链接类型） */}
                {type === 'link' && (
                    <div className="form-group">
                        <label className="form-label">URL</label>
                        <div className="url-input-wrapper">
                            <input
                                type="url"
                                className="form-input"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onBlur={handleUrlBlur}
                                placeholder="https://example.com"
                            />
                            {fetchingMetadata && (
                                <span className="url-input-spinner" />
                            )}
                        </div>
                    </div>
                )}

                {/* 文件上传（仅文件类型） */}
                {type === 'file' && (
                    <div className="form-group">
                        <label className="form-label">选择文件</label>
                        <div className="file-upload-area">
                            <input
                                type="file"
                                className="file-upload-input"
                                onChange={handleFileChange}
                            />
                            {file ? (
                                <div className="file-upload-selected">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    <span>{file.name}</span>
                                    <span className="file-upload-size">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </span>
                                </div>
                            ) : (
                                <div className="file-upload-placeholder">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                    <span>点击选择文件或拖拽到此处</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 笔记内容（仅笔记类型） */}
                {type === 'note' && (
                    <div className="form-group">
                        <label className="form-label">笔记内容</label>
                        <textarea
                            className="form-textarea form-textarea-large"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="在此输入笔记内容..."
                            rows={10}
                        />
                    </div>
                )}

                {/* 描述 */}
                <div className="form-group">
                    <label className="form-label">描述</label>
                    <textarea
                        className="form-textarea"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="添加描述（可选）"
                        rows={3}
                    />
                </div>

                {/* 文件夹选择 */}
                <div className="form-group">
                    <label className="form-label">文件夹</label>
                    <select
                        className="form-select"
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                    >
                        <option value="">未分类</option>
                        {flattenFolders(folders).map((folder) => (
                            <option key={folder.id} value={folder.id}>
                                {'  '.repeat(folder.depth)}{folder.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 标签选择 */}
                <div className="form-group">
                    <label className="form-label">标签</label>
                    <TagSelector
                        tags={tags}
                        selectedTagIds={tagIds}
                        onChange={setTagIds}
                        onCreateTag={async (name, color) => {
                            try {
                                const newTag = await api.createTag({ name, color });
                                setTags([...tags, newTag]);
                                setTagIds([...tagIds, newTag.id]);
                            } catch (err) {
                                console.error('创建标签失败:', err);
                            }
                        }}
                    />
                </div>

                {/* 提交按钮 */}
                <div className="form-actions">
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting || !title.trim()}
                    >
                        {submitting ? '创建中...' : '创建收藏'}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate('/')}
                    >
                        取消
                    </button>
                </div>
            </form>
        </div>
    );
}
