import { deepReadAiConfig } from './deepRead';

export interface ClassifiedDeepReadError {
    message: string;
    retryable: boolean;
}

/**
 * 将精读错误分类为用户可读提示，并判断是否可自动重试
 */
export function classifyDeepReadError(err: unknown): ClassifiedDeepReadError {
    const raw = err instanceof Error ? err.message : String(err ?? '精读失败');
    const msg = raw.toLowerCase();

    if (msg.includes('abort') || msg.includes('取消')) {
        return { message: '精读已取消', retryable: false };
    }

    if (msg.includes('api key') || msg.includes('未配置') || msg.includes('401') || msg.includes('403')) {
        return { message: raw.includes('未配置') ? raw : 'AI 服务未配置或 Key 无效，请检查设置', retryable: false };
    }

    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('限流')) {
        return { message: 'AI 服务限流，将自动重试', retryable: true };
    }

    if (msg.includes('timeout') || msg.includes('超时')) {
        return { message: '请求超时，将自动重试', retryable: true };
    }

    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('网络')) {
        return { message: raw, retryable: true };
    }

    if (msg.includes('正文') || msg.includes('提取') || msg.includes('登录')) {
        return { message: raw, retryable: false };
    }

    return { message: raw, retryable: false };
}

export function getMaxAutoRetries(): number {
    return deepReadAiConfig.maxAutoRetries ?? 2;
}

export function getRetryBackoffMs(retryCount: number): number {
    const base = deepReadAiConfig.retryBackoffMs ?? 5000;
    return base * Math.pow(2, retryCount);
}
