/**
 * 文件夹路由单元测试
 * 覆盖树形结构、创建、更新、删除等场景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, destroyTestContext } from './helpers';
import type { TestContext } from './helpers';
import { v4 as uuidv4 } from 'uuid';

let ctx: TestContext;

beforeEach(() => {
    ctx = createTestContext('folder-routes');
});

afterEach(() => {
    destroyTestContext(ctx);
});

describe('GET /api/folders', () => {
    it('应返回空树', async () => {
        const res = await ctx.request.get('/api/folders');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data).toEqual([]);
    });

    it('应返回树形结构', async () => {
        // 创建根文件夹
        const rootRes = await ctx.request
            .post('/api/folders')
            .send({ name: '根文件夹' });
        const rootId = rootRes.body.data.id;

        // 创建子文件夹
        const childRes = await ctx.request
            .post('/api/folders')
            .send({ name: '子文件夹', parent_id: rootId });
        const childId = childRes.body.data.id;

        const res = await ctx.request.get('/api/folders');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].name).toBe('根文件夹');
        expect(res.body.data[0].children).toHaveLength(1);
        expect(res.body.data[0].children[0].name).toBe('子文件夹');
        expect(res.body.data[0].children[0].id).toBe(childId);
    });
});

describe('POST /api/folders', () => {
    it('应创建根文件夹', async () => {
        const res = await ctx.request
            .post('/api/folders')
            .send({ name: '我的文件夹' });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe(0);
        expect(res.body.data.name).toBe('我的文件夹');
        expect(res.body.data.parent_id).toBeNull();
        expect(res.body.data.id).toBeDefined();
    });

    it('应创建子文件夹', async () => {
        const parentRes = await ctx.request
            .post('/api/folders')
            .send({ name: '父文件夹' });
        const parentId = parentRes.body.data.id;

        const res = await ctx.request
            .post('/api/folders')
            .send({ name: '子文件夹', parent_id: parentId });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe(0);
        expect(res.body.data.name).toBe('子文件夹');
        expect(res.body.data.parent_id).toBe(parentId);
    });

    it('名称为空应返回 400', async () => {
        const res = await ctx.request
            .post('/api/folders')
            .send({ name: '' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });
});

describe('PUT /api/folders/:id', () => {
    it('应重命名文件夹', async () => {
        const createRes = await ctx.request
            .post('/api/folders')
            .send({ name: '旧名称' });
        const id = createRes.body.data.id;

        const res = await ctx.request
            .put(`/api/folders/${id}`)
            .send({ name: '新名称' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.name).toBe('新名称');
    });

    it('应移动文件夹（更改父文件夹）', async () => {
        const parentRes = await ctx.request
            .post('/api/folders')
            .send({ name: '目标父文件夹' });
        const parentId = parentRes.body.data.id;

        const childRes = await ctx.request
            .post('/api/folders')
            .send({ name: '待移动文件夹' });
        const childId = childRes.body.data.id;

        const res = await ctx.request
            .put(`/api/folders/${childId}`)
            .send({ parent_id: parentId });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.parent_id).toBe(parentId);
    });

    it('不能将文件夹设为自己的子文件夹', async () => {
        const createRes = await ctx.request
            .post('/api/folders')
            .send({ name: '文件夹' });
        const id = createRes.body.data.id;

        const res = await ctx.request
            .put(`/api/folders/${id}`)
            .send({ parent_id: id });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('不存在的 ID 应返回 404', async () => {
        const res = await ctx.request
            .put(`/api/folders/${uuidv4()}`)
            .send({ name: '新名称' });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});

describe('DELETE /api/folders/:id', () => {
    it('应删除文件夹，收藏项移至未分类', async () => {
        // 创建文件夹
        const folderRes = await ctx.request
            .post('/api/folders')
            .send({ name: '待删除文件夹' });
        const folderId = folderRes.body.data.id;

        // 在文件夹中创建收藏项
        await ctx.request
            .post('/api/collections')
            .send({ title: '文件夹内收藏', folder_id: folderId });

        // 删除文件夹
        const res = await ctx.request.delete(`/api/folders/${folderId}`);
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        // 验证文件夹已删除
        const folderList = await ctx.request.get('/api/folders');
        expect(folderList.body.data).toHaveLength(0);

        // 验证收藏项仍在但 folder_id 为 null
        const collections = await ctx.request.get('/api/collections');
        expect(collections.body.data.items).toHaveLength(1);
        expect(collections.body.data.items[0].folder_id).toBeNull();
    });

    it('应级联删除子文件夹', async () => {
        const parentRes = await ctx.request
            .post('/api/folders')
            .send({ name: '父文件夹' });
        const parentId = parentRes.body.data.id;

        await ctx.request
            .post('/api/folders')
            .send({ name: '子文件夹', parent_id: parentId });

        // 删除父文件夹
        const res = await ctx.request.delete(`/api/folders/${parentId}`);
        expect(res.status).toBe(200);

        // 验证所有文件夹都已删除
        const folderList = await ctx.request.get('/api/folders');
        expect(folderList.body.data).toHaveLength(0);
    });

    it('不存在的 ID 应返回 404', async () => {
        const res = await ctx.request.delete(`/api/folders/${uuidv4()}`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});
