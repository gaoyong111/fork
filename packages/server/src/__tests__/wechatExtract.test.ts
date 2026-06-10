import { describe, it, expect } from 'vitest';
import { extractWechatCoverFromHtml, isWechatArticleUrl } from '../../../shared/src/metadata/wechatExtract';

describe('wechatExtract', () => {
    it('识别公众号链接', () => {
        expect(isWechatArticleUrl('https://mp.weixin.qq.com/s/abc')).toBe(true);
        expect(isWechatArticleUrl('https://example.com')).toBe(false);
    });

    it('从 msg_cdn_url 提取封面', () => {
        const html = '<script>var msg_cdn_url = "https://mmbiz.qpic.cn/mmbiz_jpg/cover/0";</script>';
        expect(extractWechatCoverFromHtml(html)).toBe('https://mmbiz.qpic.cn/mmbiz_jpg/cover/0');
    });

    it('从 og:image 提取封面', () => {
        const html = '<meta property="og:image" content="https://mmbiz.qpic.cn/og.jpg" />';
        expect(extractWechatCoverFromHtml(html)).toBe('https://mmbiz.qpic.cn/og.jpg');
    });

    it('从 data-src 提取 mmbiz 图片', () => {
        const html = '<img data-src="https://mmbiz.qpic.cn/sz_mmbiz_png/test.png" />';
        expect(extractWechatCoverFromHtml(html)).toBe('https://mmbiz.qpic.cn/sz_mmbiz_png/test.png');
    });
});
