import { contentToPlainText } from '../ai/htmlUtils';
import type { Collection } from '../types';

/** 元数据缺口状态 */
export type MetadataGapStatus = 'ok' | 'incomplete' | 'fetch_failed';

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/**
 * 判断标题是否为占位（仅域名、URL 路径等），而非真实文章标题
 */
export function isPlaceholderTitle(
    title: string | null | undefined,
    url: string | null | undefined,
): boolean {
    const value = title?.trim();
    if (!value) return true;
    if (!url) return false;

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, '');
        const hosts = new Set([host, parsed.hostname, `www.${host}`]);
        if (hosts.has(value)) return true;
        if (value === url || value === parsed.href) return true;
        if (value.startsWith(`${host}/`) || value.startsWith(`${parsed.hostname}/`)) return true;
    } catch {
        // ignore invalid url
    }

    return false;
}

/**
 * 从页面 HTML 提取标题
 */
export function extractTitleFromPageHtml(html: string): string {
    const ogPatterns = [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    ];
    for (const pattern of ogPatterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
            return decodeHtmlEntities(match[1]);
        }
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
        return decodeHtmlEntities(titleMatch[1]);
    }

    return '';
}

/**
 * 从精读原文 HTML 提取标题
 */
export function extractTitleFromRawContent(rawContent: string): string {
    const headingPatterns = [
        /<h1[^>]*>([\s\S]*?)<\/h1>/i,
        /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    ];
    for (const pattern of headingPatterns) {
        const match = rawContent.match(pattern);
        if (match?.[1]) {
            const text = contentToPlainText(match[1]).trim();
            if (text) return text;
        }
    }
    return '';
}

/**
 * 从摘要首行提取候选标题
 */
function extractTitleFromSummary(summary: string): string {
    const plain = contentToPlainText(summary).trim();
    if (!plain) return '';
    const firstLine = plain.split('\n').find((line) => line.trim())?.trim() || plain;
    return firstLine.length > 120 ? firstLine.slice(0, 120) : firstLine;
}

/**
 * 精读完成后推断应回填的标题与描述
 */
export function inferTitleUpdate(
    collection: Pick<Collection, 'title' | 'url' | 'description'>,
    deepRead: { pageTitle?: string; rawContent: string; summary: string },
): { title?: string; description?: string } {
    const patch: { title?: string; description?: string } = {};

    if (isPlaceholderTitle(collection.title, collection.url)) {
        const candidates = [
            deepRead.pageTitle,
            extractTitleFromRawContent(deepRead.rawContent),
            extractTitleFromSummary(deepRead.summary),
        ]
            .map((item) => item?.trim())
            .filter(Boolean) as string[];

        const title = candidates.find((item) => !isPlaceholderTitle(item, collection.url));
        if (title) {
            patch.title = title;
        }
    }

    if (!collection.description?.trim() && deepRead.summary?.trim()) {
        const plain = contentToPlainText(deepRead.summary).replace(/\s+/g, ' ').trim();
        if (plain) {
            patch.description = plain.length > 200 ? `${plain.slice(0, 200)}…` : plain;
        }
    }

    return patch;
}

/**
 * 列表/卡片展示用标题（占位时从 URL 推断可读文本）
 */
export function getDisplayTitle(collection: Pick<Collection, 'title' | 'url'>): string {
    if (!isPlaceholderTitle(collection.title, collection.url)) {
        return collection.title.trim();
    }

    if (collection.url) {
        try {
            const parsed = new URL(collection.url);
            if (parsed.hostname.includes('github.com')) {
                const parts = parsed.pathname.split('/').filter(Boolean);
                if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
                if (parts.length === 1) return parts[0];
            }
            const path = parsed.pathname.replace(/\/$/, '');
            if (path && path !== '/') return path.replace(/^\//, '');
        } catch {
            // ignore invalid url
        }
    }

    return collection.title?.trim() || '未命名';
}

/**
 * 列表视图内容预览（前 N 字）
 */
export function getListContentPreview(
    collection: Pick<Collection, 'contentBrief' | 'content' | 'description'>,
    maxLen = 60,
): string {
    const sources = [collection.contentBrief, collection.content, collection.description];
    for (const source of sources) {
        if (!source?.trim()) continue;
        const plain = contentToPlainText(source).replace(/\s+/g, ' ').trim();
        if (plain.length <= 8) continue;
        return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
    }
    return '';
}

/**
 * 判断元数据/原文获取是否存在缺口（供前端标记）
 */
export function getMetadataGapStatus(
    collection: Pick<Collection, 'title' | 'url' | 'description' | 'content' | 'rawContent' | 'type'>,
    deepReadTask?: { status: string; error?: string },
): MetadataGapStatus {
    if (collection.type !== 'link') return 'ok';

    if (deepReadTask?.status === 'error') {
        return 'fetch_failed';
    }

    if (isPlaceholderTitle(collection.title, collection.url) && !collection.content) {
        return 'incomplete';
    }

    if (
        isPlaceholderTitle(collection.title, collection.url)
        && collection.content
        && !collection.description
    ) {
        return 'incomplete';
    }

    if (
        !collection.content
        && !collection.rawContent
        && !collection.description
        && isPlaceholderTitle(collection.title, collection.url)
    ) {
        return 'incomplete';
    }

    return 'ok';
}

export function getMetadataGapLabel(status: MetadataGapStatus): string {
    if (status === 'fetch_failed') return '原文获取失败';
    if (status === 'incomplete') return '信息不全';
    return '';
}
