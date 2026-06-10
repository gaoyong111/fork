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

/**
 * 将原文转为 AI 可读的结构化文本（轻量 HTML 解析）
 */
export function prepareContentForAi(content: string): string {
    if (!isHtmlContent(content)) {
        return content.trim();
    }

    const lines: string[] = [];
    const blockRegex = /<(h[1-6]|p|li|blockquote|img|hr)[^>]*>([\s\S]*?)<\/\1>|<img[^>]+>/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(content)) !== null) {
        const full = match[0];
        if (full.startsWith('<img')) {
            const src = full.match(/src=["']([^"']+)["']/i)?.[1] || '';
            const alt = full.match(/alt=["']([^"']*)["']/i)?.[1] || '配图';
            lines.push(`[图片: ${alt}${src ? ` (${src})` : ''}]`);
            continue;
        }

        const tag = match[1]?.toLowerCase();
        const inner = match[2]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
        if (!inner && tag !== 'hr') continue;

        if (tag === 'hr') {
            lines.push('---');
        } else if (tag?.startsWith('h')) {
            const level = Number(tag[1]);
            lines.push(`${'#'.repeat(level)} ${inner}`);
        } else if (tag === 'li') {
            lines.push(`- ${inner}`);
        } else {
            lines.push(inner);
            lines.push('');
        }
    }

    if (lines.length === 0) {
        return contentToPlainText(content);
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
