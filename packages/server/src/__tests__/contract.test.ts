/**
 * API 契约测试
 * 验证 HTTP 响应结构与 shared 类型定义一致
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validatePaginatedCollections, validateMoveCollectionResult, validateServerCollectionDetail } from '../../../shared/src/contracts/apiShapes';
import { createTestContext, destroyTestContext } from './helpers';
import type { TestContext } from './helpers';

let ctx: TestContext;

beforeEach(() => {
    ctx = createTestContext('contract');
});

afterEach(() => {
    destroyTestContext(ctx);
});

describe('API contract: collections', () => {
    it('GET /api/collections 返回标准分页结构', async () => {
        const res = await ctx.request.get('/api/collections');
        expect(res.status).toBe(200);

        const errors = validatePaginatedCollections(res.body);
        expect(errors).toEqual([]);
    });

    it('POST /api/collections 创建后 GET 详情字段完整', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '契约测试', type: 'link', url: 'https://example.com' });

        expect(createRes.status).toBe(201);
        expect(createRes.body.code).toBe(0);

        const id = createRes.body.data.id;
        const getRes = await ctx.request.get(`/api/collections/${id}`);
        expect(getRes.status).toBe(200);

        const errors = validateServerCollectionDetail(getRes.body.data);
        expect(errors).toEqual([]);
    });

    it('POST /api/collections/:id/move 返回 moveCollection 结构', async () => {
        const folderRes = await ctx.request.post('/api/folders').send({ name: '契约文件夹' });
        const colRes = await ctx.request
            .post('/api/collections')
            .send({ title: '移动测试', type: 'note', content: 'x' });

        const moveRes = await ctx.request
            .post(`/api/collections/${colRes.body.data.id}/move`)
            .send({ folderId: folderRes.body.data.id });

        expect(moveRes.status).toBe(200);
        const errors = validateMoveCollectionResult(moveRes.body.data);
        expect(errors).toEqual([]);
    });
});
