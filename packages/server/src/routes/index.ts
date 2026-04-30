import { Router } from 'express';
import collectionRoutes from './collectionRoutes';
import folderRoutes from './folderRoutes';
import tagRoutes from './tagRoutes';
import searchRoutes from './searchRoutes';
import uploadRoutes from './uploadRoutes';
import metadataRoutes from './metadataRoutes';
import exportRoutes from './exportRoutes';
import importRoutes from './importRoutes';
import trashRoutes from './trashRoutes';

/**
 * 注册所有 API 路由
 * @returns 配置好所有路由的 Router 实例
 */
function registerRoutes(): Router {
    const router = Router();

    // 收藏项管理
    router.use('/collections', collectionRoutes);

    // 文件夹管理
    router.use('/folders', folderRoutes);

    // 标签管理
    router.use('/tags', tagRoutes);

    // 全文搜索
    router.use('/search', searchRoutes);

    // 文件上传
    router.use('/upload', uploadRoutes);

    // 元数据提取
    router.use('/metadata', metadataRoutes);

    // 数据导出
    router.use('/export', exportRoutes);

    // 数据导入
    router.use('/import', importRoutes);

    // 回收站
    router.use('/trash', trashRoutes);

    return router;
}

export default registerRoutes;
