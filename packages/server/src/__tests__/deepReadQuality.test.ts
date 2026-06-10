import { describe, it, expect } from 'vitest';
import { validateExtractedContent } from '../../../shared/src/ai/contentQuality';
import { classifyDeepReadError } from '../../../shared/src/ai/deepReadErrors';

describe('validateExtractedContent', () => {
    it('拒绝过短正文', () => {
        const result = validateExtractedContent('太短');
        expect(result.ok).toBe(false);
    });

    it('接受正常多段落正文', () => {
        const text = '第一段内容足够长，包含若干文字描述。\n\n第二段继续展开论述，确保段落数量达标。';
        const result = validateExtractedContent(text.repeat(3));
        expect(result.ok).toBe(true);
    });

    it('拒绝登录页关键词', () => {
        const result = validateExtractedContent('请登录后查看完整内容 '.repeat(10));
        expect(result.ok).toBe(false);
    });
});

describe('classifyDeepReadError', () => {
    it('429 可重试', () => {
        expect(classifyDeepReadError(new Error('HTTP 429 rate limit')).retryable).toBe(true);
    });

    it('API Key 错误不可重试', () => {
        expect(classifyDeepReadError(new Error('AI 服务未配置')).retryable).toBe(false);
    });
});
