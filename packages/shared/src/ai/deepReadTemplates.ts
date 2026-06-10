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
};

const cfg = config as TemplatesConfig;

const TEMPLATE_LABELS: Record<DeepReadTemplateType, string> = {
    wechat: '公众号文章',
    blog: '博客/专栏',
    news: '新闻资讯',
    tutorial: '教程/技术',
    general: '通用文章',
};

/** 根据 URL 与 HTML 特征推断文章类型 */
export function detectTemplateType(url: string, html?: string): DeepReadTemplateType {
    if (/mp\.weixin\.qq\.com/i.test(url)) return 'wechat';

    const lower = (html || '').toLowerCase();
    const path = url.toLowerCase();

    if (
        /tutorial|docs\.|documentation|guide|how-to|wiki|developer|api\//.test(path)
        || /<code|pre>|class=["'][^"']*(?:hljs|language-|code-block)/.test(lower)
    ) {
        return 'tutorial';
    }

    if (
        /news|xinhuanet|people\.com|thepaper|36kr\.com\/p\/|ithome/.test(path)
        || /class=["'][^"']*news|article-meta|publish-time/.test(lower)
    ) {
        return 'news';
    }

    if (
        /medium\.com|substack|blog|zhihu\.com\/p\/|juejin\.cn|sspai\.com/.test(path)
        || /<article/.test(lower)
    ) {
        return 'blog';
    }

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
