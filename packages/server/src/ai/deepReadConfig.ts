import fs from 'fs';
import path from 'path';

interface DeepReadConfig {
    chunkThreshold: number;
    chunkSize: number;
    fetchTimeoutMs: number;
    aiTimeoutMs: number;
    maxHtmlSizeBytes: number;
    maxTokens: { chunk: number; full: number };
    temperature: number;
    userMessagePrefix: string;
    prompts: { full: string; chunk: string; merge: string };
}

const configPath = path.join(__dirname, '../../../shared/src/ai/deep-read.json');

export const deepReadAiConfig: DeepReadConfig = JSON.parse(
    fs.readFileSync(configPath, 'utf-8'),
);

export function getDeepReadSystemPrompt(mode: 'full' | 'chunk' | 'merge'): string {
    return deepReadAiConfig.prompts[mode];
}
