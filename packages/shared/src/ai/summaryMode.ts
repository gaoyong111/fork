import type { Collection, SummaryMode, UpdateCollectionParams } from '../types';

/** 解析收藏项当前展示的摘要模式 */
export function resolveSummaryMode(collection: Pick<Collection, 'summaryMode'>): SummaryMode {
    return collection.summaryMode === 'brief' ? 'brief' : 'detailed';
}

/** 读取已缓存的某模式摘要（兼容旧数据仅 content 字段） */
export function getCachedSummary(
    collection: Pick<Collection, 'content' | 'contentBrief' | 'contentDetailed' | 'summaryMode'>,
    mode: SummaryMode,
): string | null {
    if (mode === 'brief') {
        if (collection.contentBrief) return collection.contentBrief;
        if (collection.summaryMode === 'brief' && collection.content) return collection.content;
        return null;
    }
    if (collection.contentDetailed) return collection.contentDetailed;
    if (collection.content) return collection.content;
    return null;
}

/** 精读完成后写入对应模式缓存 */
export function buildDeepReadCollectionUpdate(
    mode: SummaryMode,
    summary: string,
    rawContent: string,
    existing?: Pick<Collection, 'contentBrief' | 'contentDetailed'>,
): UpdateCollectionParams {
    const update: UpdateCollectionParams = {
        content: summary,
        rawContent,
        summaryMode: mode,
    };
    if (mode === 'brief') {
        update.contentBrief = summary;
        if (existing?.contentDetailed) {
            update.contentDetailed = existing.contentDetailed;
        }
    } else {
        update.contentDetailed = summary;
        if (existing?.contentBrief) {
            update.contentBrief = existing.contentBrief;
        }
    }
    return update;
}
