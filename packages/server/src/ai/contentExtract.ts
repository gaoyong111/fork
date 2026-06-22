import * as cheerio from 'cheerio';
import { isWechatArticleUrl } from '../../../shared/src/metadata/wechatExtract';
import { contentToPlainText, countParagraphs, isHtmlContent } from '../../../shared/src/ai/htmlUtils';
import type { ArticleImage } from '../../../shared/src/types';

export { contentToPlainText, countParagraphs, isHtmlContent };

const NOISE_SELECTORS = [
    'script', 'style', 'nav', 'footer', 'header', 'aside',
    'iframe', 'noscript', 'svg', 'form', 'button',
    '.qr_code_pc', '.rich_media_tool', '.rich_media_area_extra',
    '.ct_mpda_wrp', '#js_pc_qr_code',
];

function resolveUrl(raw: string | undefined, baseUrl: string): string | undefined {
    if (!raw?.trim()) return undefined;
    const value = raw.trim();
    try {
        return new URL(value, baseUrl).href;
    } catch {
        return value.startsWith('http') ? value : undefined;
    }
}

function findArticleRoot($: cheerio.CheerioAPI, pageUrl: string) {
    const isWechat = isWechatArticleUrl(pageUrl);
    if (isWechat) {
        const wechat = $('#js_content');
        if (wechat.length) return wechat;
        const rich = $('.rich_media_content');
        if (rich.length) return rich;
    }
    const article = $('article').first();
    if (article.length) return article;
    const main = $('main').first();
    if (main.length) return main;
    return $('body');
}

function buildHtmlFromContainer(
    $: cheerio.CheerioAPI,
    container: ReturnType<typeof findArticleRoot>,
    pageUrl: string,
    images: ArticleImage[],
): string {
    const blockSelector = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, figure, img, hr, section';
    const parts: string[] = [];

    container.find(blockSelector).each((_i, el) => {
        const $el = $(el);
        const tag = el.type === 'tag' ? el.tagName.toLowerCase() : '';

        if (tag === 'img') {
            const src = $el.attr('data-src') || $el.attr('data-original') || $el.attr('src');
            const resolved = resolveUrl(src, pageUrl);
            if (resolved) {
                const alt = $el.attr('alt') || '配图';
                const id = images.length + 1;
                images.push({ id, src: resolved, alt });
                parts.push(`<p>[图${id}]</p>`);
            }
            return;
        }

        if (tag === 'hr') {
            parts.push('<hr />');
            return;
        }

        const text = $el.text().trim();
        if (text && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'ul', 'ol', 'figure', 'section'].includes(tag)) {
            parts.push(`<${tag}>${text}</${tag}>`);
        }
    });

    if (parts.length === 0) {
        const text = container.text().trim();
        if (!text) return '';
        return `<p>${text}</p>`;
    }

    return parts.join('\n');
}

/** 从页面 HTML 提取正文（兼容旧调用，仅返回 HTML） */
export function extractArticleHtml(html: string, pageUrl: string): string {
    const images: ArticleImage[] = [];
    const { html: extractedHtml } = extractArticleHtmlWithImages(html, pageUrl, images);
    return extractedHtml;
}

/** 从页面 HTML 提取正文 + 图片列表（图文分离版） */
export function extractArticleHtmlWithImages(html: string, pageUrl: string, images: ArticleImage[]): { html: string; images: ArticleImage[] } {
    const $ = cheerio.load(html);

    for (const sel of NOISE_SELECTORS) {
        $(sel).remove();
    }

    const root = findArticleRoot($, pageUrl);
    if (!root.length) return { html: '', images };

    const extractedHtml = buildHtmlFromContainer($, root, pageUrl, images).trim();
    return { html: extractedHtml, images };
}

export { prepareContentForAi } from '../../../shared/src/ai/htmlUtils';
