/**
 * AI 服务路由 - 文章精读（deep-read）
 * 抓取 HTML 原文 → 存 rawContent → 按模板分块 AI 精读 → 返回 {rawContent, summary, templateType}
 */

import { Router, Request, Response } from 'express';
import { validateExtractedContent } from '../../../shared/src/ai/contentQuality';
import {
    deepReadAiConfig,
    detectTemplateType,
    getTemplatePrompt,
    getMaxTokensForSummaryMode,
    getRefineSystemPrompt,
    buildRefineUserMessage,
    buildDefaultUserMessage,
    prepareContentForAi,
    type DeepReadTemplateType,
} from '../../../shared/src/ai/deepRead';
import type { SummaryMode } from '../../../shared/src/types';
import { extractArticleHtml } from '../ai/contentExtract';
import { isWechatArticleUrl, WECHAT_ARTICLE_USER_AGENT } from '../../../shared/src/metadata/wechatExtract';

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

interface DeepReadRequestBody {
    url?: string;
    rawContent?: string;
    refetch?: boolean;
    templateType?: DeepReadTemplateType;
    userDirection?: string;
    previousSummary?: string;
    summaryMode?: SummaryMode;
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
        let pageHtml: string | undefined;

        if (!refetch && typeof existingRaw === 'string' && existingRaw.trim()) {
            const quality = validateExtractedContent(existingRaw.trim());
            if (!quality.ok) {
                res.json({ code: -1, message: quality.reason || '原文质量不符合精读要求' });
                return;
            }
            rawContent = existingRaw.trim();
        } else {
            pageHtml = await fetchPageHtml(url);
            rawContent = extractArticleHtml(pageHtml, url);

            const quality = validateExtractedContent(rawContent);
            if (!quality.ok) {
                res.json({ code: -1, message: quality.reason || '无法提取页面内容' });
                return;
            }
        }

        const templateType = body.templateType
            ?? detectTemplateType(url, pageHtml);

        const prepared = prepareContentForAi(rawContent);
        const summaryMode = resolveSummaryMode(body.summaryMode);

        let summary: string;
        if (typeof userDirection === 'string' && userDirection.trim()) {
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
            data: { rawContent, summary, templateType },
        });
    } catch (err) {
        console.error('AI 精读失败:', err);
        res.json({ code: -1, message: 'AI 精读失败，请稍后重试' });
    }
});

export default router;
