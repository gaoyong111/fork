import config from './deep-read.json';
import type { DeepReadAiConfig } from './deepRead';
import type { SummaryMode } from '../types';

export type DeepReadTemplateType = 'wechat' | 'blog' | 'news' | 'tutorial' | 'general';

export interface DeepReadTemplateMeta {
    label: string;
    prompts: { full: string; chunk: string; merge: string };
}

interface BriefModeConfig {
    maxTokens?: { chunk: number; full: number; merge?: number; refine?: number };
    refinePrompt?: string;
    prompts?: { full: string; chunk: string; merge: string };
    templates?: Record<DeepReadTemplateType, DeepReadTemplateMeta>;
}

type TemplatesConfig = DeepReadAiConfig & {
    refinePrompt?: string;
    templates?: Record<DeepReadTemplateType, DeepReadTemplateMeta>;
    brief?: BriefModeConfig;
    compressPrompt?: string;
    compressMaxTokens?: number;
};

const cfg = config as TemplatesConfig;

const TEMPLATE_LABELS: Record<DeepReadTemplateType, string> = {
    wechat: '公众号文章',
    blog: '博客/专栏',
    news: '新闻资讯',
    tutorial: '教程/技术',
    general: '通用文章',
};

/** 内容/URL 是否像教程或技术文档 */
function looksLikeTutorial(url: string, html: string): boolean {
    const path = url.toLowerCase();
    const lower = html.toLowerCase();
    const codeBlocks = (lower.match(/<pre|<code/g) || []).length;

    if (/tutorial|docs\.|documentation|guide|how-to|wiki|developer|api\//.test(path)) {
        return true;
    }
    if (/(?:步骤|安装|配置|教程|手把手|入门指南|快速开始)/.test(html)) {
        return true;
    }
    return codeBlocks >= 3
        || (codeBlocks >= 1 && /class=["'][^"']*(?:hljs|language-|code-block)/.test(lower));
}

/** 内容/URL 是否像新闻资讯 */
function looksLikeNews(url: string, html: string): boolean {
    const path = url.toLowerCase();
    const lower = html.toLowerCase();

    if (/news|xinhuanet|people\.com|thepaper|36kr\.com\/news|ithome|huxiu\.com|caixin|cls\.cn|stcn\.com|yicai\.com|infzm\.com|jiemian\.com|bbc\.|reuters\.|cnbc\.com/.test(path)) {
        return true;
    }
    return /class=["'][^"']*news|article-meta|publish-time|发布时间|讯\s*\(|记者\s/.test(lower);
}

/** URL 是否像博客/专栏（不用宽泛的 article 标签，避免误判） */
function looksLikeBlog(url: string): boolean {
    const path = url.toLowerCase();
    return /medium\.com|substack|\/blog\/|zhihu\.com\/p\/|juejin\.cn|sspai\.com|douban\.com\/note|xiaohongshu\.com\/explore|mp\.163\.com|bilibili\.com\/read/.test(path);
}

/** 根据 URL 与 HTML 特征推断文章类型 */
export function detectTemplateType(url: string, html?: string): DeepReadTemplateType {
    const pageHtml = html || '';

    if (/mp\.weixin\.qq\.com/i.test(url)) {
        if (looksLikeTutorial(url, pageHtml)) return 'tutorial';
        if (looksLikeNews(url, pageHtml)) return 'news';
        return 'wechat';
    }

    if (looksLikeTutorial(url, pageHtml)) return 'tutorial';
    if (looksLikeNews(url, pageHtml)) return 'news';
    if (looksLikeBlog(url)) return 'blog';

    return 'general';
}

export function getTemplateLabel(type: DeepReadTemplateType): string {
    return cfg.templates?.[type]?.label ?? TEMPLATE_LABELS[type];
}

function getModeConfig(summaryMode: SummaryMode): {
    prompts: { full: string; chunk: string; merge: string };
    templates?: Record<DeepReadTemplateType, DeepReadTemplateMeta>;
    refinePrompt?: string;
} {
    if (summaryMode === 'brief' && cfg.brief) {
        return {
            prompts: cfg.brief.prompts ?? cfg.prompts,
            templates: cfg.brief.templates,
            refinePrompt: cfg.brief.refinePrompt,
        };
    }
    return {
        prompts: cfg.prompts,
        templates: cfg.templates,
        refinePrompt: cfg.refinePrompt,
    };
}

export function getTemplatePrompt(
    type: DeepReadTemplateType,
    mode: 'full' | 'chunk' | 'merge',
    summaryMode: SummaryMode = 'detailed',
): string {
    const modeCfg = getModeConfig(summaryMode);
    const template = modeCfg.templates?.[type];
    if (template?.prompts[mode]) return template.prompts[mode];
    return modeCfg.prompts[mode];
}

export function getMaxTokensForSummaryMode(
    summaryMode: SummaryMode,
    options: { isChunk?: boolean; isMerge?: boolean; isRefine?: boolean },
): number {
    const tokens = summaryMode === 'brief' && cfg.brief?.maxTokens
        ? cfg.brief.maxTokens
        : cfg.maxTokens;
    if (options.isRefine) {
        return tokens.refine ?? tokens.full;
    }
    if (options.isMerge) {
        return tokens.merge ?? tokens.full;
    }
    if (options.isChunk) {
        return tokens.chunk;
    }
    return tokens.full;
}

export function getRefineSystemPrompt(
    templateType: DeepReadTemplateType,
    summaryMode: SummaryMode = 'detailed',
): string {
    const modeCfg = getModeConfig(summaryMode);
    const templateHint = getTemplatePrompt(templateType, 'full', summaryMode);
    const refine = modeCfg.refinePrompt ?? cfg.refinePrompt ?? '';
    return `${refine}\n\n---\n\n该文章默认精读模板参考（可按用户诉求调整结构）：\n${templateHint}`;
}

export function buildRefineUserMessage(
    preparedContent: string,
    previousSummary: string,
    userDirection: string,
): string {
    return [
        '【用户调整诉求】',
        userDirection.trim(),
        '',
        '【先前的精读摘要】',
        previousSummary.trim(),
        '',
        '【原文内容】',
        preparedContent,
    ].join('\n');
}

export function buildDefaultUserMessage(preparedContent: string, prefix?: string): string {
    const p = prefix ?? cfg.userMessagePrefix;
    return `${p}${preparedContent}`;
}

/** 从详细摘要压缩为简略版的 system prompt */
export function getCompressPrompt(): string {
    return cfg.compressPrompt ?? cfg.brief?.prompts?.full ?? cfg.prompts.full;
}

/** 压缩模式 max_tokens */
export function getCompressMaxTokens(): number {
    return cfg.compressMaxTokens ?? cfg.brief?.maxTokens?.full ?? 2560;
}

/** 压缩模式 user message */
export function buildCompressUserMessage(preparedSummary: string): string {
    return `请将以下详细摘要压缩为简略版（保留所有核心信息与关键细节，不要过度压缩）：\n\n${preparedSummary}`;
}
