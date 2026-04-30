import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase, closeDatabase } from './database/init';
import registerRoutes from './routes';

/** 服务端口 */
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

/**
 * 启动 Express 服务器
 */
function startServer(): void {
    const app = express();

    // 初始化数据库
    initDatabase();

    // CORS 中间件
    app.use(cors());

    // JSON 解析中间件
    app.use(express.json({ limit: '50mb' }));

    // 静态文件服务（uploads 目录）
    const uploadsDir = path.join(process.cwd(), 'uploads');
    app.use('/uploads', express.static(uploadsDir));

    // 注册 API 路由
    app.use('/api', registerRoutes());

    // 健康检查接口
    app.get('/api/health', (_req, res) => {
        res.json({
            code: 0,
            message: 'success',
            data: {
                status: 'ok',
                timestamp: new Date().toISOString(),
            },
        });
    });

    // 404 处理
    app.use((_req, res) => {
        res.status(404).json({
            code: 40401,
            message: '接口不存在',
        });
    });

    // 全局错误处理
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error('[错误]', err);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    });

    // 启动服务
    app.listen(PORT, () => {
        console.log(`[服务器] 收藏夹后端服务已启动: http://localhost:${PORT}`);
        console.log(`[服务器] API 地址: http://localhost:${PORT}/api`);
    });

    // 优雅关闭
    process.on('SIGINT', () => {
        console.log('\n[服务器] 正在关闭...');
        closeDatabase();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n[服务器] 正在关闭...');
        closeDatabase();
        process.exit(0);
    });
}

// 启动服务
startServer();
