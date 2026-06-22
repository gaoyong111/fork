import { wechatImageReferrerPolicy, isWechatCdnImageUrl } from '@favorites/shared/metadata/wechatExtract';
import type { ArticleImage } from '@favorites/shared/types';

export { wechatImageReferrerPolicy, isWechatCdnImageUrl };

/** 将 [图N] 占位符替换为实际 <img> 标签，localPath 优先，src 兜底 */
export function renderImagePlaceholders(html: string, imagesJson: string | null): string {
    if (!imagesJson) return html;
    let images: ArticleImage[];
    try {
        images = JSON.parse(imagesJson);
    } catch {
        return html;
    }
    if (!images.length) return html;

    const isDesktop = !!((window as unknown as Record<string, unknown>).__TAURI__);

    for (const img of images) {
        const placeholder = `[图${img.id}]`;
        const imgSrc = resolveImageSrc(img, isDesktop);
        const referrerpolicy = img.localPath ? '' : (wechatImageReferrerPolicy(img.src) || '');
        const policyAttr = referrerpolicy ? ` referrerpolicy="${referrerpolicy}"` : '';
        const imgTag = `<img src="${imgSrc}" alt="${img.alt}"${policyAttr} />`;
        html = html.replace(placeholder, imgTag);
    }
    return html;
}

/** 解析图片显示地址：localPath 优先，src 兜底 */
function resolveImageSrc(img: ArticleImage, isDesktop: boolean): string {
    if (img.localPath) {
        if (isDesktop) {
            return convertTauriAssetPath(img.localPath);
        }
        return img.localPath.startsWith('/') ? img.localPath : `/${img.localPath}`;
    }
    return img.src;
}

/** 将桌面端绝对路径转为 Tauri asset:// 协议路径 */
function convertTauriAssetPath(absPath: string): string {
    return `asset://localhost/${absPath}`;
}
