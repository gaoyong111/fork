/**
 * 元数据提取路由 - 从 URL 自动提取页面标题、描述、封面图和 favicon
 */

import { Router, Request, Response } from 'express';
import * as cheerio from 'cheerio';
import {
    extractWechatCoverFromHtml,
    isWechatArticleUrl,
    WECHAT_ARTICLE_USER_AGENT,
} from '../../../shared/src/metadata/wechatExtract';

const router = Router();

/** 最大响应体大小（500KB） */
const MAX_RESPONSE_SIZE = 500 * 1024;

/** 请求超时时间（8秒） */
const FETCH_TIMEOUT = 8000;

/** 模拟浏览器的 User-Agent */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface MetadataResult {
    title: string;
    description: string;
    coverUrl: string;
    favicon: string;
}

function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function resolveAbsoluteUrl(relative: string, pageUrl: string): string {
    if (!relative) return '';
    if (relative.startsWith('http')) return relative;
    try {
        return new URL(relative, pageUrl).href;
    } catch {
        return '';
    }
}

function extractImgSrc($img: cheerio.Cheerio<cheerio.Element>): string {
    return (
        $img.attr('data-src')?.trim() ||
        $img.attr('src')?.trim() ||
        ''
    );
}

function extractMetadata(html: string, pageUrl: string): MetadataResult {
    const $ = cheerio.load(html);
    const baseUrl = new URL(pageUrl);
    const isWechat = isWechatArticleUrl(pageUrl);

    let title =
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('title').text().trim() ||
        '';

    let description =
        $('meta[property="og:description"]').attr('content')?.trim() ||
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[name="twitter:description"]').attr('content')?.trim() ||
        '';

    let coverUrl =
        $('meta[property="og:image"]').attr('content')?.trim() ||
        $('meta[name="twitter:image"]').attr('content')?.trim() ||
        '';

    if (isWechat) {
        if (!coverUrl) {
            coverUrl = extractWechatCoverFromHtml(html) || '';
        }
        if (!coverUrl) {
            const jsCover = $('#js_cover');
            const style = jsCover.attr('style') || '';
            const bgMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)/i);
            if (bgMatch?.[1]) coverUrl = bgMatch[1];

            if (!coverUrl) {
                const thumbImg = $('.rich_media_thumb img, #js_article img, #img-content img').first();
                coverUrl = extractImgSrc(thumbImg);
            }
        }
    } else if (!coverUrl) {
        const firstImg = $('img').first();
        const src = extractImgSrc(firstImg);
        if (src) {
            try {
                const imgAbsUrl = new URL(src, pageUrl).href;
                const imgHost = new URL(imgAbsUrl).hostname;
                if (imgHost === baseUrl.hostname) {
                    coverUrl = imgAbsUrl;
                }
            } catch {
                // ignore
            }
        }
    }

    coverUrl = resolveAbsoluteUrl(coverUrl, pageUrl);

    let favicon =
        $('link[rel="icon"]').attr('href')?.trim() ||
        $('link[rel="shortcut icon"]').attr('href')?.trim() ||
        $('link[rel="apple-touch-icon"]').attr('href')?.trim() ||
        '';

    if (!favicon) {
        favicon = `${baseUrl.origin}/favicon.ico`;
    } else {
        favicon = resolveAbsoluteUrl(favicon, pageUrl) || `${baseUrl.origin}/favicon.ico`;
    }

    return { title, description, coverUrl, favicon };
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || !isValidUrl(url)) {
        res.json({
            code: 0,
            data: { title: '', description: '', coverUrl: '', favicon: '' },
        });
        return;
    }

    const isWechat = isWechatArticleUrl(url);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const headers: Record<string, string> = {
            'User-Agent': isWechat ? WECHAT_ARTICLE_USER_AGENT : USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        };
        if (isWechat) {
            headers['Referer'] = 'https://mp.weixin.qq.com/';
        }

        const response = await fetch(url, {
            signal: controller.signal,
            headers,
            redirect: 'follow',
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            res.json({
                code: 0,
                data: { title: '', description: '', coverUrl: '', favicon: '' },
            });
            return;
        }

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
        res.json({
            code: 0,
            data: { title: '', description: '', coverUrl: '', favicon: '' },
        });
    }
});

export default router;
