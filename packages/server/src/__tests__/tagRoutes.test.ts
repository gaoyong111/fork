/**
 * 标签路由单元测试
 * 覆盖标签 CRUD 和唯一性校验场景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, destroyTestContext } from './helpers';
import type { TestContext } from './helpers';
import { v4 as uuidv4 } from 'uuid';

let ctx: TestContext;

beforeEach(() => {
    ctx = createTestContext('tag-routes');
});

afterEach(() => {
    destroyTestContext(ctx);
});

describe('GET /api/tags', () => {
    it('应返回空列表', async () => {
        const res = await ctx.request.get('/api/tags');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data).toEqual([]);
    });

    it('应返回标签列表（按使用数量排序）', async () => {
        // 创建标签
        await ctx.request.post('/api/tags').send({ name: '标签A' });
        await ctx.request.post('/api/tags').send({ name: '标签B' });

        const res = await ctx.request.get('/api/tags');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].name).toBeDefined();
        expect(res.body.data[0].collection_count).toBeDefined();
    });
});

describe('POST /api/tags', () => {
    it('应创建标签', async () => {
        const res = await ctx.request
            .post('/api/tags')
            .send({ name: '前端', color: '#ff0000' });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe(0);
        expect(res.body.data.name).toBe('前端');
        expect(res.body.data.color).toBe('#ff0000');
        expect(res.body.data.id).toBeDefined();
    });

    it('应使用默认颜色', async () => {
        const res = await ctx.request
            .post('/api/tags')
            .send({ name: '无颜色标签' });

        expect(res.status).toBe(201);
        expect(res.body.data.color).toBe('#6366f1');
    });

    it('重复名称应返回 409', async () => {
        await ctx.request
            .post('/api/tags')
            .send({ name: '重复标签' });

        const res = await ctx.request
            .post('/api/tags')
            .send({ name: '重复标签' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe(40901);
    });

    it('名称为空应返回 400', async () => {
        const res = await ctx.request
            .post('/api/tags')
            .send({ name: '' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });
});

describe('PUT /api/tags/:id', () => {
    it('应更新标签名称', async () => {
        const createRes = await ctx.request
            .post('/api/tags')
            .send({ name: '旧名称' });
        const id = createRes.body.data.id;

        const res = await ctx.request
            .put(`/api/tags/${id}`)
            .send({ name: '新名称' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.name).toBe('新名称');
    });

    it('应更新标签颜色', async () => {
        const createRes = await ctx.request
            .post('/api/tags')
            .send({ name: '标签' });
        const id = createRes.body.data.id;

        const res = await ctx.request
            .put(`/api/tags/${id}`)
            .send({ color: '#00ff00' });

        expect(res.status).toBe(200);
        expect(res.body.data.color).toBe('#00ff00');
    });

    it('更新为重复名称应返回 409', async () => {
        await ctx.request.post('/api/tags').send({ name: '已存在标签' });
        const createRes = await ctx.request.post('/api/tags').send({ name: '待更新标签' });
        const id = createRes.body.data.id;

        const res = await ctx.request
            .put(`/api/tags/${id}`)
            .send({ name: '已存在标签' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe(40901);
    });

    it('不存在的 ID 应返回 404', async () => {
        const res = await ctx.request
            .put(`/api/tags/${uuidv4()}`)
            .send({ name: '新名称' });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });

    it('没有更新字段应返回 400', async () => {
        const createRes = await ctx.request
            .post('/api/tags')
            .send({ name: '标签' });
        const id = createRes.body.data.id;

        const res = await ctx.request
            .put(`/api/tags/${id}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });
});

describe('DELETE /api/tags/:id', () => {
    it('应删除标签', async () => {
        const createRes = await ctx.request
            .post('/api/tags')
            .send({ name: '待删除标签' });
        const id = createRes.body.data.id;

        const res = await ctx.request.delete(`/api/tags/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        // 验证标签列表为空
        const listRes = await ctx.request.get('/api/tags');
        expect(listRes.body.data).toHaveLength(0);
    });

    it('删除标签应级联删除关联记录', async () => {
        const tagRes = await ctx.request
            .post('/api/tags')
            .send({ name: '关联标签' });
        const tagId = tagRes.body.data.id;

        // 创建收藏项并关联标签
        await ctx.request
            .post('/api/collections')
            .send({ title: '测试', tag_ids: [tagId] });

        // 删除标签
        await ctx.request.delete(`/api/tags/${tagId}`);

        // 验证收藏项的标签已清空
        const collections = await ctx.request.get('/api/collections');
        expect(collections.body.data.items[0].tags).toEqual([]);
    });

    it('不存在的 ID 应返回 404', async () => {
        const res = await ctx.request.delete(`/api/tags/${uuidv4()}`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});
