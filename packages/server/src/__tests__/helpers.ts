/**
 * 测试辅助模块
 * 提供测试数据库初始化、Express app 创建、请求辅助函数等功能
 */

import express from 'express';
import supertest from 'supertest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initDatabase, getDb, closeDatabase } from '../database/init';
import registerRoutes from '../routes';

/** 测试数据库目录 */
const TEST_DB_DIR = path.join(os_tmpdir(), 'favorites-test');

/**
 * 获取系统临时目录
 * @returns 临时目录路径
 */
function os_tmpdir(): string {
    return '/tmp';
}

/**
 * 测试上下文接口
 */
export interface TestContext {
    /** supertest 请求对象 */
    request: supertest.SuperTest<supertest.Test>;
    /** 测试数据库路径 */
    dbPath: string;
}

/**
 * 创建独立的测试数据库并初始化 schema
 * @param dbName - 数据库文件名
 * @returns 数据库文件路径
 */
export function createTestDb(dbName: string): string {
    if (!fs.existsSync(TEST_DB_DIR)) {
        fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    const dbPath = path.join(TEST_DB_DIR, dbName);

    // 如果已存在则先删除
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    // 同时删除 WAL 和 SHM 文件
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    return dbPath;
}

/**
 * 初始化测试数据库（设置全局 db 实例）
 * @param dbPath - 数据库文件路径
 */
export function setupTestDb(dbPath: string): void {
    initDatabase(dbPath);
}

/**
 * 关闭测试数据库连接
 */
export function teardownTestDb(): void {
    try {
        closeDatabase();
    } catch {
        // 忽略关闭错误
    }
}

/**
 * 清理测试数据库文件
 * @param dbPath - 数据库文件路径
 */
export function cleanupTestDb(dbPath: string): void {
    try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        const walPath = dbPath + '-wal';
        const shmPath = dbPath + '-shm';
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch {
        // 忽略清理错误
    }
}

/**
 * 创建测试用 Express app（不监听端口）
 * @returns supertest 请求对象
 */
export function createTestApp(): supertest.SuperTest<supertest.Test> {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api', registerRoutes());

    // 404 处理
    app.use((_req, res) => {
        res.status(404).json({
            code: 40401,
            message: '接口不存在',
        });
    });

    // 全局错误处理
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    });

    return supertest(app);
}

/**
 * 创建完整的测试上下文（含数据库初始化）
 * @param testName - 测试名称，用于生成唯一数据库名
 * @returns 测试上下文
 */
export function createTestContext(testName: string): TestContext {
    const dbPath = createTestDb(`${testName}.db`);
    setupTestDb(dbPath);
    const request = createTestApp();
    return { request, dbPath };
}

/**
 * 销毁测试上下文（关闭数据库连接并清理文件）
 * @param ctx - 测试上下文
 */
export function destroyTestContext(ctx: TestContext): void {
    teardownTestDb();
    cleanupTestDb(ctx.dbPath);
}

/**
 * 直接操作测试数据库（用于准备测试数据）
 * @returns 数据库实例
 */
export function getTestDb(): Database.Database {
    return getDb();
}
