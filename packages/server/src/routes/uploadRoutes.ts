import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/init';

const router = Router();

/** 上传文件存储目录 */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/** 允许的文件 MIME 类型白名单 */
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/markdown',
        'application/json',
    ],
    archive: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
};

/** 所有允许的 MIME 类型 */
const ALL_ALLOWED_MIME_TYPES = Object.values(ALLOWED_MIME_TYPES).flat();

/** 最大文件大小：50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * 确保上传目录存在
 */
function ensureUploadDir(): void {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
}

/**
 * 按日期生成子目录路径（如 2026/04/13）
 * @returns 日期子目录路径
 */
function getDateSubDir(): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return path.join(year, month, day);
}

/**
 * 生成唯一文件名
 * @param originalName - 原始文件名
 * @returns 唯一文件名（uuid-原始文件名）
 */
function generateUniqueFileName(originalName: string): string {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    return `${uuidv4()}-${name}${ext}`;
}

/**
 * 文件过滤器，只允许白名单中的文件类型
 */
const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    callback: multer.FileFilterCallback,
): void => {
    if (ALL_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        callback(null, true);
    } else {
        callback(new Error(`不支持的文件类型: ${file.mimetype}`));
    }
};

/**
 * 配置 multer 存储
 */
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        ensureUploadDir();
        const dateDir = path.join(UPLOAD_DIR, getDateSubDir());
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        cb(null, dateDir);
    },
    filename: (_req, file, cb) => {
        const uniqueName = generateUniqueFileName(file.originalname);
        cb(null, uniqueName);
    },
});

/** multer 实例 */
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
});

/**
 * 上传文件
 * POST /api/upload
 */
router.post('/', upload.single('file'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({
                code: 40001,
                message: '请选择要上传的文件',
            });
            return;
        }

        const db = getDb();
        const { folder_id } = req.body;
        const now = new Date().toISOString();

        // 构建文件相对路径（用于前端访问）
        const dateSubDir = getDateSubDir();
        const relativePath = path.join(dateSubDir, req.file.filename).replace(/\\/g, '/');

        // 创建文件类型的收藏项
        const id = uuidv4();
        db.prepare(`
            INSERT INTO collections (id, title, url, type, content, summary, cover_url, folder_id, is_favorite, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            req.file.originalname,
            null,
            'file',
            null,
            null,
            null,
            folder_id || null,
            0,
            now,
            now,
        );

        res.status(201).json({
            code: 0,
            message: 'success',
            data: {
                id,
                title: req.file.originalname,
                type: 'file',
                filePath: `/${relativePath}`,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                createdAt: now,
            },
        });
    } catch (error) {
        // 上传失败时清理已保存的文件
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('[上传] 清理文件失败:', unlinkError);
            }
        }
        console.error('[上传] 文件上传失败:', error);
        res.status(500).json({
            code: 50001,
            message: '服务器内部错误',
        });
    }
});

export default router;
