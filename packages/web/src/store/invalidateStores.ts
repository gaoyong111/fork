/**
 * 统一 store 刷新 helper
 * mutation 后调用，避免各组件重复 invalidate 三件套
 */

import { useCollectionStore } from './collectionStore';
import { useFolderStore } from './folderStore';
import { useTagStore } from './tagStore';

export type InvalidateTarget = 'collections' | 'folders' | 'tags';

/**
 * 刷新指定 store 数据
 * @param targets - 要刷新的 store，默认全部
 */
export async function invalidateStores(targets?: InvalidateTarget[]): Promise<void> {
    const refreshAll = !targets || targets.length === 0;
    const ops: Promise<void>[] = [];

    if (refreshAll || targets.includes('collections')) {
        ops.push(useCollectionStore.getState().invalidate());
    }
    if (refreshAll || targets.includes('folders')) {
        ops.push(useFolderStore.getState().invalidate());
    }
    if (refreshAll || targets.includes('tags')) {
        ops.push(useTagStore.getState().invalidate());
    }

    await Promise.all(ops);
}
