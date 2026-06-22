/**
 * AI 服务路由 - 文章精读（deep-read）
 * 抓取 HTML 原文 → 存 rawContent → 按模板分块 AI 精读 → 返回 {rawContent, summary, templateType}
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { validateExtractedContent } from '../../../shared/src/ai/contentQuality';
import {
    deepReadAiConfig,
    detectTemplateType,
    getTemplatePrompt,
    getMaxTokensForSummaryMode,
    getRefineSystemPrompt,
    buildRefineUserMessage,
    buildDefaultUserMessage,
    getCompressPrompt,
    getCompressMaxTokens,
    buildCompressUserMessage,
    prepareContentForAi,
    truncateForAi,
    type DeepReadTemplateType,
} from '../../../shared/src/ai/deepRead';
import type { SummaryMode, ArticleImage } from '../../../shared/src/types';
import { extractArticleHtml, extractArticleHtmlWithImages } from '../ai/contentExtract';
import { isWechatArticleUrl, WECHAT_ARTICLE_USER_AGENT } from '../../../shared/src/metadata/wechatExtract';
import {
    extractTitleFromPageHtml,
    extractTitleFromRawContent,
} from '../../../shared/src/metadata/collectionMeta';

const router = Router();

const AI_API_URL = process.env.AI_API_URL || 'https://api.openai.com/v1';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const AI_TIMEOUT = deepReadAiConfig.aiTimeoutMs;
const FETCH_TIMEOUT = deepReadAiConfig.fetchTimeoutMs;

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHUNK_THRESHOLD = deepReadAiConfig.chunkThreshold;
const CHUNK_SIZE = deepReadAiConfig.chunkSize;
const CHUNK_CONCURRENCY = Math.max(1, deepReadAiConfig.chunkConcurrency ?? 3);
const MAX_CHUNKS = deepReadAiConfig.maxChunks ?? 5;
const MAX_HTML_SIZE = deepReadAiConfig.maxHtmlSizeBytes ?? 10485760;
const MAX_AI_CONTENT_CHARS = deepReadAiConfig.maxAiContentChars ?? 40000;

interface DeepReadRequestBody {
    url?: string;
    rawContent?: string;
    images?: string;
    refetch?: boolean;
    templateType?: DeepReadTemplateType;
    userDirection?: string;
    previousSummary?: string;
    summaryMode?: SummaryMode;
    sourceMode?: 'compress';
}

function resolveSummaryMode(mode?: string): SummaryMode {
    return mode === 'brief' ? 'brief' : 'detailed';
}

async function callAiApi(
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);

    const aiResponse = await fetch(`${AI_API_URL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            max_tokens: maxTokens,
            temperature: deepReadAiConfig.temperature,
        }),
    });

    clearTimeout(timeoutId);

    const aiData = await aiResponse.json() as Record<string, unknown>;
    if (!aiData.choices || !Array.isArray(aiData.choices) || aiData.choices.length === 0) {
        throw new Error('AI 服务响应异常');
    }

    const choice = aiData.choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    return (message?.content as string) || '';
}

async function chunkedAiProcess(
    preparedContent: string,
    templateType: DeepReadTemplateType,
    summaryMode: SummaryMode,
): Promise<string> {
    if (preparedContent.length <= CHUNK_THRESHOLD) {
        return callAiApi(
            getTemplatePrompt(templateType, 'full', summaryMode),
            buildDefaultUserMessage(preparedContent),
            getMaxTokensForSummaryMode(summaryMode, {}),
        );
    }

    const paragraphs = preparedContent.split('\n\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
        if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = para;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para;
        }
    }
    if (currentChunk) chunks.push(currentChunk);

    // 超过 chunk 上限时只保留前 maxChunks 个
    if (chunks.length > MAX_CHUNKS) {
        chunks.length = MAX_CHUNKS;
    }

    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
        const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map((chunk) =>
                callAiApi(
                    getTemplatePrompt(templateType, 'chunk', summaryMode),
                    buildDefaultUserMessage(chunk),
                    getMaxTokensForSummaryMode(summaryMode, { isChunk: true }),
                ),
            ),
        );
        chunkSummaries.push(...batchResults);
    }

    const mergedSummaries = chunkSummaries.join('\n\n---\n\n');
    return callAiApi(
        getTemplatePrompt(templateType, 'merge', summaryMode),
        buildDefaultUserMessage(mergedSummaries),
        getMaxTokensForSummaryMode(summaryMode, { isMerge: true }),
    );
}

async function refineAiProcess(
    preparedContent: string,
    previousSummary: string,
    userDirection: string,
    templateType: DeepReadTemplateType,
    summaryMode: SummaryMode,
): Promise<string> {
    return callAiApi(
        getRefineSystemPrompt(templateType, summaryMode),
        buildRefineUserMessage(preparedContent, previousSummary, userDirection),
        getMaxTokensForSummaryMode(summaryMode, { isRefine: true }),
    );
}

async function fetchPageHtml(url: string): Promise<string> {
    const wechat = isWechatArticleUrl(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const headers: Record<string, string> = {
        'User-Agent': wechat ? WECHAT_ARTICLE_USER_AGENT : USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
    if (wechat) headers['Referer'] = 'https://mp.weixin.qq.com/';

    const response = await fetch(url, { signal: controller.signal, headers, redirect: 'follow' });
    clearTimeout(timeoutId);

    if (!response.ok) {
        throw new Error(`页面返回 HTTP ${response.status}，无法获取内容`);
    }
    return response.text();
}

/**
 * POST /api/ai/deep-read
 */
router.post('/deep-read', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as DeepReadRequestBody;
    const { url, userDirection, previousSummary } = body;
    const existingRaw = body.rawContent;
    const existingImages = body.images;
    const refetch = body.refetch === true;

    if (!url || typeof url !== 'string') {
        res.json({ code: -1, message: '缺少 URL 参数' });
        return;
    }

    if (!AI_API_KEY) {
        res.json({ code: -1, message: 'AI 服务未配置（缺少 AI_API_KEY）' });
        return;
    }

    try {
        let rawContent: string;
        let imagesJson: string;
        let pageHtml: string | undefined;

        if (!refetch && typeof existingRaw === 'string' && existingRaw.trim()) {
            const quality = validateExtractedContent(existingRaw.trim());
            if (!quality.ok) {
                res.json({ code: -1, message: quality.reason || '原文质量不符合精读要求' });
                return;
            }
            rawContent = existingRaw.trim();
            imagesJson = existingImages || '';
        } else {
            pageHtml = await fetchPageHtml(url);

            if (pageHtml.length > MAX_HTML_SIZE) {
                res.json({ code: -1, message: '页面体积过大（>10MB），无法精读' });
                return;
            }

            const images: ArticleImage[] = [];
            const { html: extractedHtml } = extractArticleHtmlWithImages(pageHtml, url, images);
            rawContent = extractedHtml;

            const quality = validateExtractedContent(rawContent);
            if (!quality.ok) {
                res.json({ code: -1, message: quality.reason || '无法提取页面内容' });
                return;
            }
            imagesJson = JSON.stringify(images);
        }

        // 下载图片到本地
        let imagesArr: ArticleImage[] = imagesJson ? JSON.parse(imagesJson) : [];
        if (imagesArr.length > 0 && imagesArr.some((img) => !img.localPath)) {
            const imgDir = path.join(process.cwd(), 'uploads', 'img');
            fs.mkdirSync(imgDir, { recursive: true });

            for (const img of imagesArr) {
                if (img.localPath) continue;
                if (!img.src) continue;

                const isWechatImg = img.src.includes('mmbiz.qpic.cn') || img.src.includes('wx.qlogo.cn');
                const imgHeaders: Record<string, string> = {
                    'User-Agent': WECHAT_ARTICLE_USER_AGENT,
                    'Accept': 'image/*,*/*;q=0.8',
                };
                if (isWechatImg) {
                    imgHeaders['Referer'] = 'https://mp.weixin.qq.com/';
                }

                try {
                    const imgResp = await fetch(img.src, { headers: imgHeaders, redirect: 'follow' });
                    if (imgResp.ok) {
                        const buf = Buffer.from(await imgResp.arrayBuffer());
                        const lastSegment = img.src.split('/').pop() || 'unknown';
                        const safeName = lastSegment.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 12);
                        const filename = `img_${img.id}_${safeName}.jpg`;
                        const filePath = path.join(imgDir, filename);
                        fs.writeFileSync(filePath, buf);
                        img.localPath = `uploads/img/${filename}`;
                    }
                } catch {
                    // 下载失败，保留原始 src 兜底
                }
            }
            imagesJson = JSON.stringify(imagesArr);
        }

        const templateType = body.templateType
            ?? detectTemplateType(url, pageHtml);

        const prepared = prepareContentForAi(rawContent, imagesJson);
        const summaryMode = resolveSummaryMode(body.summaryMode);

        const pageTitle = pageHtml
            ? extractTitleFromPageHtml(pageHtml)
            : extractTitleFromRawContent(rawContent);

        let summary: string;
        if (body.sourceMode === 'compress') {
            summary = await callAiApi(
                getCompressPrompt(),
                buildCompressUserMessage(prepared),
                getCompressMaxTokens(),
            );
        } else if (typeof userDirection === 'string' && userDirection.trim()) {
            summary = await refineAiProcess(
                prepared,
                typeof previousSummary === 'string' ? previousSummary : '',
                userDirection.trim(),
                templateType,
                summaryMode,
            );
        } else {
            summary = await chunkedAiProcess(prepared, templateType, summaryMode);
        }

        res.json({
            code: 0,
            data: { rawContent, images: imagesJson, summary, templateType, pageTitle: pageTitle || undefined },
        });
    } catch (err) {
        console.error('AI 精读失败:', err);
        res.json({ code: -1, message: 'AI 精读失败，请稍后重试' });
    }
});

export default router;
