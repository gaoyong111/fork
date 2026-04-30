/**
 * 回收站路由单元测试
 * 覆盖查看、恢复、永久删除、清空等场景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, destroyTestContext } from './helpers';
import type { TestContext } from './helpers';
import { v4 as uuidv4 } from 'uuid';

let ctx: TestContext;

beforeEach(() => {
    ctx = createTestContext('trash-routes');
});

afterEach(() => {
    destroyTestContext(ctx);
});

/**
 * 辅助函数：创建一个收藏项并软删除到回收站
 * @param title - 收藏项标题
 * @returns 收藏项 ID
 */
async function createAndDelete(title: string): Promise<string> {
    const res = await ctx.request
        .post('/api/collections')
        .send({ title });
    const id = res.body.data.id;
    await ctx.request.delete(`/api/collections/${id}`);
    return id;
}

describe('GET /api/trash', () => {
    it('应返回空回收站', async () => {
        const res = await ctx.request.get('/api/trash');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.items).toEqual([]);
        expect(res.body.data.pagination.total).toBe(0);
    });

    it('应返回已删除的收藏项', async () => {
        await createAndDelete('待回收项');

        const res = await ctx.request.get('/api/trash');

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].title).toBe('待回收项');
        expect(res.body.data.pagination.total).toBe(1);
    });

    it('应支持分页', async () => {
        for (let i = 1; i <= 5; i++) {
            await createAndDelete(`回收项 ${i}`);
        }

        const res = await ctx.request.get('/api/trash?page=1&limit=2');

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(2);
        expect(res.body.data.pagination.total).toBe(5);
        expect(res.body.data.pagination.totalPages).toBe(3);
    });
});

describe('POST /api/trash/:id/restore', () => {
    it('应恢复收藏项', async () => {
        const id = await createAndDelete('待恢复');

        const res = await ctx.request.post(`/api/trash/${id}/restore`);

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        // 验证回收站为空
        const trashRes = await ctx.request.get('/api/trash');
        expect(trashRes.body.data.items).toHaveLength(0);

        // 验证收藏列表中存在
        const listRes = await ctx.request.get('/api/collections');
        expect(listRes.body.data.items).toHaveLength(1);
        expect(listRes.body.data.items[0].title).toBe('待恢复');
    });

    it('恢复不存在的项应返回 404', async () => {
        const res = await ctx.request.post(`/api/trash/${uuidv4()}/restore`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});

describe('DELETE /api/trash/:id', () => {
    it('应永久删除收藏项', async () => {
        const id = await createAndDelete('待永久删除');

        const res = await ctx.request.delete(`/api/trash/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        // 验证回收站为空
        const trashRes = await ctx.request.get('/api/trash');
        expect(trashRes.body.data.items).toHaveLength(0);

        // 验证收藏列表中也不存在
        const listRes = await ctx.request.get('/api/collections');
        expect(listRes.body.data.items).toHaveLength(0);
    });

    it('永久删除不存在的项应返回 404', async () => {
        const res = await ctx.request.delete(`/api/trash/${uuidv4()}`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});

describe('DELETE /api/trash/empty', () => {
    it('应清空回收站', async () => {
        await createAndDelete('项A');
        await createAndDelete('项B');
        await createAndDelete('项C');

        const res = await ctx.request.delete('/api/trash/empty');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.deletedCount).toBe(3);

        // 验证回收站为空
        const trashRes = await ctx.request.get('/api/trash');
        expect(trashRes.body.data.items).toHaveLength(0);
    });

    it('空回收站清空应返回 0', async () => {
        const res = await ctx.request.delete('/api/trash/empty');

        expect(res.status).toBe(200);
        expect(res.body.data.deletedCount).toBe(0);
    });
});

describe('POST /api/trash/restore-all', () => {
    it('应恢复全部已删除项', async () => {
        await createAndDelete('项A');
        await createAndDelete('项B');

        const res = await ctx.request.post('/api/trash/restore-all');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.restoredCount).toBe(2);

        // 验证回收站为空
        const trashRes = await ctx.request.get('/api/trash');
        expect(trashRes.body.data.items).toHaveLength(0);

        // 验证收藏列表中有 2 项
        const listRes = await ctx.request.get('/api/collections');
        expect(listRes.body.data.items).toHaveLength(2);
    });

    it('空回收站恢复应返回 0', async () => {
        const res = await ctx.request.post('/api/trash/restore-all');

        expect(res.status).toBe(200);
        expect(res.body.data.restoredCount).toBe(0);
    });
});
