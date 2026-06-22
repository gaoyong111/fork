import type { ArticleImage } from '../types';

/** 判断内容是否为 HTML 原文 */
export function isHtmlContent(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('<') && /<\/[a-z][\s\S]*>/i.test(trimmed);
}

/** 从 HTML 或纯文本提取纯文本（用于质量校验） */
export function contentToPlainText(content: string): string {
    if (!isHtmlContent(content)) {
        return content.trim();
    }
    return content
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 统计段落数（HTML 或纯文本） */
export function countParagraphs(content: string): number {
    if (isHtmlContent(content)) {
        const blockCount = (content.match(/<(p|h[1-6]|li|blockquote|img)[\s>]/gi) || []).length;
        if (blockCount > 0) return blockCount;
        return contentToPlainText(content).split(/\n\n+/).filter(Boolean).length;
    }
    return content.split(/\n\n+/).filter((p) => p.trim().length > 0).length;
}

/** 将 [图N] 占位符替换为 [图N: alt]，便于 AI 理解图片内容 */
function enrichImagePlaceholders(text: string, images: ArticleImage[]): string {
    let result = text;
    for (const img of images) {
        const placeholder = `[图${img.id}]`;
        const enriched = `[图${img.id}: ${img.alt}]`;
        result = result.replace(placeholder, enriched);
    }
    return result;
}

/** 纯文本层面智能截断：保留前60%+后40%，中间标记省略，按段落切割不切断 */
export function truncateForAi(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    const paragraphs = content.split('\n\n');
    const headBudget = Math.floor(maxChars * 0.6);
    const tailBudget = maxChars - headBudget;

    const headParts: string[] = [];
    let headJoinLen = 0;
    for (const para of paragraphs) {
        const sep = headParts.length > 0 ? 2 : 0;
        if (headJoinLen + sep + para.length > headBudget && headParts.length > 0) break;
        headParts.push(para);
        headJoinLen += sep + para.length;
    }

    const tailParts: string[] = [];
    let tailJoinLen = 0;
    const tailLowerBound = headParts.length;
    for (let i = paragraphs.length - 1; i >= tailLowerBound; i--) {
        const para = paragraphs[i];
        const sep = tailParts.length > 0 ? 2 : 0;
        if (tailJoinLen + sep + para.length > tailBudget && tailParts.length > 0) break;
        tailParts.unshift(para);
        tailJoinLen += sep + para.length;
    }

    const middleStart = headParts.length;
    const middleEnd = paragraphs.length - tailParts.length;
    const omitted = middleStart >= middleEnd
        ? 0
        : paragraphs.slice(middleStart, middleEnd).join('\n\n').length;

    if (omitted === 0) {
        const parts = tailParts.length > 0 ? [...headParts, ...tailParts] : headParts;
        return parts.join('\n\n');
    }

    const marker = `\n\n【中间约 ${omitted} 字已省略，主要为展开论述与案例细节】\n\n`;
    return headParts.join('\n\n') + marker + tailParts.join('\n\n');
}

/**
 * 将原文转为 AI 可读的结构化文本（轻量 HTML 解析）
 * images 参数用于将 [图N] 占位符替换为 [图N: alt]
 */
export function prepareContentForAi(content: string, imagesJson?: string): string {
    const images: ArticleImage[] = imagesJson
        ? (() => { try { return JSON.parse(imagesJson); } catch { return []; } })()
        : [];

    if (!isHtmlContent(content)) {
        const enriched = enrichImagePlaceholders(content.trim(), images);
        return truncateForAi(enriched, 40000);
    }

    const lines: string[] = [];
    const blockRegex = /<(h[1-6]|p|li|blockquote|img|hr)[^>]*>([\s\S]*?)<\/\1>|<img[^>]+>|<p>\[图\d+\]<\/p>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(content)) !== null) {
        const full = match[0];

        // [图N] 占位符段落
        const placeholderMatch = full.match(/<p>\[图(\d+)\]<\/p>/i);
        if (placeholderMatch) {
            const imgId = Number(placeholderMatch[1]);
            const img = images.find((i) => i.id === imgId);
            if (img) {
                lines.push(`[图${img.id}: ${img.alt}]`);
            } else {
                lines.push(`[图${imgId}]`);
            }
            continue;
        }

        if (full.startsWith('<img')) {
            const src = full.match(/src=["']([^"']+)["']/i)?.[1] || '';
            const alt = full.match(/alt=["']([^"']*)["']/i)?.[1] || '配图';
            // 老数据兼容：内嵌 img 标签
            const matched = images.find((i) => i.src === src);
            if (matched) {
                lines.push(`[图${matched.id}: ${matched.alt}]`);
            } else {
                lines.push(`[图片: ${alt}]`);
            }
            continue;
        }

        const tag = match[1]?.toLowerCase();
        const inner = match[2]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
        if (!inner && tag !== 'hr') continue;

        // 替换内嵌 [图N] 占位符
        const enrichedInner = enrichImagePlaceholders(inner, images);

        if (tag === 'hr') {
            lines.push('---');
        } else if (tag?.startsWith('h')) {
            const level = Number(tag[1]);
            lines.push(`${'#'.repeat(level)} ${enrichedInner}`);
        } else if (tag === 'li') {
            lines.push(`- ${enrichedInner}`);
        } else {
            lines.push(enrichedInner);
            lines.push('');
        }
    }

    if (lines.length === 0) {
        return contentToPlainText(content);
    }

    const joined = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return truncateForAi(joined, 40000);
}
