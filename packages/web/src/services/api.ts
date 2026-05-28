/**
 * API 服务层 - 适配器 facade
 * 根据运行环境自动选择 HTTP 或 Tauri IPC 适配器
 * 保留原有的命名导出模式，确保所有组件调用无需改动
 */

import { createApi } from '@favorites/shared/services/createApi';

const adapter = createApi();

// ==================== 收藏项 ====================

export const getCollections = adapter.getCollections.bind(adapter);
export const getCollectionById = adapter.getCollectionById.bind(adapter);
export const createCollection = adapter.createCollection.bind(adapter);
export const updateCollection = adapter.updateCollection.bind(adapter);
export const deleteCollection = adapter.deleteCollection.bind(adapter);
export const batchDeleteCollections = adapter.batchDeleteCollections.bind(adapter);
export const batchMoveCollections = adapter.batchMoveCollections.bind(adapter);
export const batchAddTags = adapter.batchAddTags.bind(adapter);
export const toggleFavorite = adapter.toggleFavorite.bind(adapter);
export const toggleArchive = adapter.toggleArchive.bind(adapter);
export const incrementReadCount = adapter.incrementReadCount.bind(adapter);
export const moveCollection = adapter.moveCollection.bind(adapter);

// ==================== 文件夹 ====================

export const getFolderTree = adapter.getFolderTree.bind(adapter);
export const createFolder = adapter.createFolder.bind(adapter);
export const updateFolder = adapter.updateFolder.bind(adapter);
export const deleteFolder = adapter.deleteFolder.bind(adapter);

// ==================== 标签 ====================

export const getTags = adapter.getTags.bind(adapter);
export const createTag = adapter.createTag.bind(adapter);
export const updateTag = adapter.updateTag.bind(adapter);
export const deleteTag = adapter.deleteTag.bind(adapter);

// ==================== 搜索 ====================

export const searchCollections = adapter.searchCollections.bind(adapter);

// ==================== 文件上传 ====================

export const uploadFile = adapter.uploadFile.bind(adapter);

// ==================== 回收站 ====================

export const getTrashCollections = adapter.getTrashCollections.bind(adapter);
export const restoreCollection = adapter.restoreCollection.bind(adapter);
export const restoreAllCollections = adapter.restoreAllCollections.bind(adapter);
export const permanentDeleteCollection = adapter.permanentDeleteCollection.bind(adapter);
export const emptyTrash = adapter.emptyTrash.bind(adapter);

// ==================== 元数据 ====================

export const fetchMetadata = adapter.fetchMetadata.bind(adapter);

// ==================== AI ====================

export const extractSummary = adapter.extractSummary.bind(adapter);

// ==================== 导入/导出 ====================

export const exportJSON = adapter.exportJSON.bind(adapter);
export const exportHTML = adapter.exportHTML.bind(adapter);
export const importJSON = adapter.importJSON.bind(adapter);
export const importHTML = adapter.importHTML.bind(adapter);

// ==================== 数据管理 ====================

export const getStorageInfo = adapter.getStorageInfo.bind(adapter);
export const backupDatabase = adapter.backupDatabase.bind(adapter);
export const restoreDatabase = adapter.restoreDatabase.bind(adapter);
export const listBackups = adapter.listBackups.bind(adapter);
export const deleteBackup = adapter.deleteBackup.bind(adapter);
export const getDataDir = adapter.getDataDir.bind(adapter);

// ==================== AI 设置 ====================

export const getAiConfig = adapter.getAiConfig.bind(adapter);
export const setAiConfig = adapter.setAiConfig.bind(adapter);
export const testAiConnection = adapter.testAiConnection.bind(adapter);