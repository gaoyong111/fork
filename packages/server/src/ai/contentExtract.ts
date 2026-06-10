import * as cheerio from 'cheerio';
import { isWechatArticleUrl } from '../../../shared/src/metadata/wechatExtract';
import { contentToPlainText, countParagraphs, isHtmlContent } from '../../../shared/src/ai/htmlUtils';

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

function normalizeImages($: cheerio.CheerioAPI, container: ReturnType<typeof findArticleRoot>, pageUrl: string): void {
    container.find('img').each((_i, el) => {
        const $img = $(el);
        const src = $img.attr('data-src') || $img.attr('data-original') || $img.attr('src');
        const resolved = resolveUrl(src, pageUrl);
        if (resolved) {
            $img.attr('src', resolved);
        }
        $img.removeAttr('data-src');
        $img.removeAttr('data-original');
        $img.removeAttr('style');
    });
}

function buildHtmlFromContainer($: cheerio.CheerioAPI, container: ReturnType<typeof findArticleRoot>): string {
    const blockSelector = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, figure, img, hr, section';
    const parts: string[] = [];

    container.find(blockSelector).each((_i, el) => {
        const $el = $(el);
        const tag = el.type === 'tag' ? el.tagName.toLowerCase() : '';

        if (tag === 'img') {
            const src = $el.attr('src');
            if (src) {
                const alt = $el.attr('alt') || '配图';
                parts.push(`<img src="${src}" alt="${alt}" />`);
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

/** 从页面 HTML 提取保留格式与图片的原文 */
export function extractArticleHtml(html: string, pageUrl: string): string {
    const $ = cheerio.load(html);

    for (const sel of NOISE_SELECTORS) {
        $(sel).remove();
    }

    const root = findArticleRoot($, pageUrl);
    if (!root.length) return '';

    normalizeImages($, root, pageUrl);
    return buildHtmlFromContainer($, root).trim();
}

export { prepareContentForAi } from '../../../shared/src/ai/htmlUtils';
