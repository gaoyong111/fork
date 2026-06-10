import { deepReadAiConfig } from './deepRead';
import { contentToPlainText, countParagraphs } from './htmlUtils';

/** 登录页 / 错误页常见关键词 */
const NOISE_PATTERNS = [
    /请登录/i,
    /sign in/i,
    /log in/i,
    /403 forbidden/i,
    /access denied/i,
    /页面不存在/i,
    /404/i,
    /验证码/i,
    /captcha/i,
];

export interface ContentQualityResult {
    ok: boolean;
    reason?: string;
}

/**
 * 校验提取的正文是否适合送 AI 精读
 */
export function validateExtractedContent(content: string): ContentQualityResult {
    const trimmed = content.trim();
    const text = contentToPlainText(trimmed);
    const minLength = deepReadAiConfig.minContentLength ?? 50;
    const minParagraphs = deepReadAiConfig.minParagraphCount ?? 2;

    if (text.length < minLength) {
        return { ok: false, reason: `正文过短（${text.length} 字），可能未成功提取页面内容` };
    }

    const paragraphCount = countParagraphs(trimmed);
    if (paragraphCount < minParagraphs && text.length < minLength * 3) {
        return { ok: false, reason: '正文段落过少，可能是导航页或登录页' };
    }

    const preview = text.slice(0, 500);
    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(preview)) {
            return { ok: false, reason: '页面疑似需要登录或为错误页，无法精读' };
        }
    }

    // 重复字符占比过高（乱码 / 模板页）
    const uniqueRatio = new Set(text.replace(/\s/g, '')).size / Math.max(text.replace(/\s/g, '').length, 1);
    if (uniqueRatio < 0.05 && text.length > 200) {
        return { ok: false, reason: '正文内容异常，可能提取失败' };
    }

    return { ok: true };
}
