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
    const brief = collection.contentBrief?.trim();
    const detailed = collection.contentDetailed?.trim();
    const content = collection.content?.trim();

    if (mode === 'brief') {
        if (brief) return brief;
        // 旧数据：仅有 content 且当前即为简略模式
        if (collection.summaryMode === 'brief' && content) return content;
        return null;
    }

    if (detailed) return detailed;
    // 旧数据：仅有 content 且从未存过简略版
    if (!brief && collection.summaryMode !== 'brief' && content) return content;
    return null;
}

/** 是否已有目标模式的历史摘要（切换模式时用，不含「再次精读」） */
export function hasCachedSummary(
    collection: Pick<Collection, 'content' | 'contentBrief' | 'contentDetailed' | 'summaryMode'>,
    mode: SummaryMode,
): boolean {
    return getCachedSummary(collection, mode) !== null;
}

/** 精读完成后写入对应模式缓存 */
export function buildDeepReadCollectionUpdate(
    mode: SummaryMode,
    summary: string,
    rawContent: string,
    images: string,
    existing?: Pick<Collection, 'contentBrief' | 'contentDetailed'>,
    options?: { skipRawContentUpdate?: boolean },
): UpdateCollectionParams {
    const update: UpdateCollectionParams = {
        content: summary,
        summaryMode: mode,
    };
    if (!options?.skipRawContentUpdate) {
        update.rawContent = rawContent;
        update.images = images;
    }
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
