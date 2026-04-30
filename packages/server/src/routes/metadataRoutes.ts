/**
 * 元数据提取路由 - 从 URL 自动提取页面标题、描述、封面图和 favicon
 */

import { Router, Request, Response } from 'express';
import * as cheerio from 'cheerio';

const router = Router();

/** 最大响应体大小（500KB） */
const MAX_RESPONSE_SIZE = 500 * 1024;

/** 请求超时时间（8秒） */
const FETCH_TIMEOUT = 8000;

/** 模拟浏览器的 User-Agent */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * URL 元数据提取结果
 */
interface MetadataResult {
    title: string;
    description: string;
    coverUrl: string;
    favicon: string;
}

/**
 * 校验 URL 格式，必须是 http 或 https 协议
 * @param url - 待校验的 URL 字符串
 * @returns 是否为合法的 http/https URL
 */
function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * 从 HTML 中提取页面元数据
 * 提取优先级：
 * - title: <title> 标签 → og:title
 * - description: og:description → meta description → twitter:description
 * - coverUrl: og:image → twitter:image → 第一张同域 <img>
 * - favicon: <link rel="icon"> → /favicon.ico
 * @param html - HTML 字符串
 * @param pageUrl - 页面原始 URL，用于解析相对路径和同域判断
 * @returns 提取到的元数据
 */
function extractMetadata(html: string, pageUrl: string): MetadataResult {
    const $ = cheerio.load(html);
    const baseUrl = new URL(pageUrl);

    // 提取 title：<title> 优先，og:title 作为备选
    let title = $('title').text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';

    // 提取 description：og:description → meta description → twitter:description
    let description =
        $('meta[property="og:description"]').attr('content')?.trim() ||
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[name="twitter:description"]').attr('content')?.trim() ||
        '';

    // 提取 coverUrl：og:image → twitter:image → 第一张同域 <img>
    let coverUrl =
        $('meta[property="og:image"]').attr('content')?.trim() ||
        $('meta[name="twitter:image"]').attr('content')?.trim() ||
        '';

    // 如果没有 og/twitter 图片，尝试取第一张同域 <img>
    if (!coverUrl) {
        const firstImg = $('img').first();
        const src = firstImg.attr('src')?.trim();
        if (src) {
            try {
                const imgAbsUrl = new URL(src, pageUrl).href;
                const imgHost = new URL(imgAbsUrl).hostname;
                if (imgHost === baseUrl.hostname) {
                    coverUrl = imgAbsUrl;
                }
            } catch {
                // 忽略无效的图片 URL
            }
        }
    }

    // 将相对路径转为绝对路径
    if (coverUrl && !coverUrl.startsWith('http')) {
        try {
            coverUrl = new URL(coverUrl, pageUrl).href;
        } catch {
            coverUrl = '';
        }
    }

    // 提取 favicon：<link rel="icon"> → /favicon.ico
    let favicon =
        $('link[rel="icon"]').attr('href')?.trim() ||
        $('link[rel="shortcut icon"]').attr('href')?.trim() ||
        $('link[rel="apple-touch-icon"]').attr('href')?.trim() ||
        '';

    if (!favicon) {
        favicon = `${baseUrl.origin}/favicon.ico`;
    } else if (!favicon.startsWith('http')) {
        try {
            favicon = new URL(favicon, pageUrl).href;
        } catch {
            favicon = `${baseUrl.origin}/favicon.ico`;
        }
    }

    return { title, description, coverUrl, favicon };
}

/**
 * POST /api/metadata
 * 根据 URL 提取页面元数据
 * Body: { "url": "https://example.com" }
 * Response: { "code": 0, "data": { "title", "description", "coverUrl", "favicon" } }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    const { url } = req.body;

    // URL 格式校验
    if (!url || typeof url !== 'string' || !isValidUrl(url)) {
        res.json({
            code: 0,
            data: { title: '', description: '', coverUrl: '', favicon: '' },
        });
        return;
    }

    try {
        // 使用 AbortController 实现超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            redirect: 'follow',
        });

        clearTimeout(timeoutId);

        // 只解析 HTML 内容类型
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            res.json({
                code: 0,
                data: { title: '', description: '', coverUrl: '', favicon: '' },
            });
            return;
        }

        // 限制响应体大小（只读取前 500KB）
        const reader = response.body?.getReader();
        if (!reader) {
            res.json({
                code: 0,
                data: { title: '', description: '', coverUrl: '', favicon: '' },
            });
            return;
        }

        const chunks: Uint8Array[] = [];
        let totalSize = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            totalSize += value.byteLength;
            if (totalSize > MAX_RESPONSE_SIZE) {
                reader.cancel();
                break;
            }
            chunks.push(value);
        }

        const html = Buffer.concat(chunks).toString('utf-8');
        const metadata = extractMetadata(html, url);

        res.json({
            code: 0,
            data: metadata,
        });
    } catch {
        // 任何错误都返回空数据，不影响用户手动输入
        res.json({
            code: 0,
            data: { title: '', description: '', coverUrl: '', favicon: '' },
        });
    }
});

export default router;
