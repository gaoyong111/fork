/** 微信公众号文章专用 User-Agent（与精读抓取一致） */
export const WECHAT_ARTICLE_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function isWechatArticleUrl(url: string): boolean {
    return /mp\.weixin\.qq\.com/i.test(url);
}

/** 微信 CDN 域名 */
export function isWechatCdnImageUrl(url: string): boolean {
    return /mmbiz\.qpic\.cn|wx\.qlogo\.cn|wx\.qpic\.cn/i.test(url);
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

/**
 * 从微信公众号文章 HTML 提取封面图 URL
 * 微信封面多在 mmbiz.qpic.cn，且常用 data-src 懒加载
 */
export function extractWechatCoverFromHtml(html: string): string | null {
    const ogPatterns = [
        /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    ];
    for (const pattern of ogPatterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
            const url = decodeHtmlEntities(match[1].trim());
            if (url.startsWith('http')) return url;
        }
    }

    const cdnVar = html.match(/(?:var\s+)?msg_cdn_url\s*=\s*["']([^"']+)["']/i);
    if (cdnVar?.[1]) {
        const url = cdnVar[1].replace(/\\\/\//g, '//').trim();
        if (url.startsWith('http')) return url;
    }

    const jsCoverStyle = html.match(
        /id=["']js_cover["'][^>]*style=["'][^"']*background(?:-image)?:\s*url\(['"]?(https?:\/\/[^'")\s]+)/i,
    );
    if (jsCoverStyle?.[1]) return jsCoverStyle[1];

    const thumbImg = html.match(
        /class=["'][^"']*rich_media_thumb[^"']*["'][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=["'](https?:\/\/[^"']+)["']/i,
    );
    if (thumbImg?.[1]) return decodeHtmlEntities(thumbImg[1]);

    const qpicImg = html.match(/(?:data-src|src)=["'](https?:\/\/mmbiz\.qpic\.cn[^"']+)["']/i);
    if (qpicImg?.[1]) return decodeHtmlEntities(qpicImg[1]);

    return null;
}

/**
 * img 标签属性：微信 CDN 需 no-referrer 才能在浏览器中显示
 */
export function wechatImageReferrerPolicy(
    url: string | null | undefined,
): ReactImgReferrerPolicy | undefined {
    if (url && isWechatCdnImageUrl(url)) {
        return 'no-referrer';
    }
    return undefined;
}

type ReactImgReferrerPolicy =
    | ''
    | 'no-referrer'
    | 'origin'
    | 'no-referrer-when-downgrade'
    | 'origin-when-cross-origin'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url';
