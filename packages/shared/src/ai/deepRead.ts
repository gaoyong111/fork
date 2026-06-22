import config from './deep-read.json';

export interface DeepReadAiConfig {
    chunkThreshold: number;
    chunkSize: number;
    chunkConcurrency: number;
    minContentLength: number;
    minParagraphCount: number;
    processIntervalMs: number;
    maxAutoRetries: number;
    retryBackoffMs: number;
    fetchTimeoutMs: number;
    aiTimeoutMs: number;
    maxHtmlSizeBytes: number;
    maxAiContentChars: number;
    maxChunks: number;
    maxTokens: { chunk: number; full: number; merge?: number; refine?: number };
    temperature: number;
    userMessagePrefix: string;
    refinePrompt?: string;
    compressPrompt?: string;
    compressMaxTokens?: number;
    prompts: { full: string; chunk: string; merge: string };
}

export const deepReadAiConfig = config as DeepReadAiConfig;

export function getDeepReadSystemPrompt(mode: 'full' | 'chunk' | 'merge'): string {
    return deepReadAiConfig.prompts[mode];
}

export type { DeepReadTemplateType } from './deepReadTemplates';
export type { SummaryMode } from '../types';
export {
    detectTemplateType,
    getTemplateLabel,
    getTemplatePrompt,
    getMaxTokensForSummaryMode,
    getRefineSystemPrompt,
    buildRefineUserMessage,
    buildDefaultUserMessage,
    getCompressPrompt,
    getCompressMaxTokens,
    buildCompressUserMessage,
} from './deepReadTemplates';
export {
    resolveSummaryMode,
    getCachedSummary,
    hasCachedSummary,
    buildDeepReadCollectionUpdate,
} from './summaryMode';
export {
    isHtmlContent,
    contentToPlainText,
    countParagraphs,
    prepareContentForAi,
    truncateForAi,
} from './htmlUtils';
