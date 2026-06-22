/**
 * 收藏项路由单元测试
 * 覆盖 CRUD、星标、移动、批量操作、分页排序筛选等场景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, destroyTestContext, getTestDb } from './helpers';
import type { TestContext } from './helpers';
import { v4 as uuidv4 } from 'uuid';

let ctx: TestContext;

beforeEach(() => {
    ctx = createTestContext('collection-routes');
});

afterEach(() => {
    destroyTestContext(ctx);
});

/**
 * 辅助函数：创建一个文件夹并返回其 ID
 * @param name - 文件夹名称
 * @returns 文件夹 ID
 */
async function createFolder(name: string): Promise<string> {
    const res = await ctx.request
        .post('/api/folders')
        .send({ name });
    return res.body.data.id;
}

/**
 * 辅助函数：创建一个标签并返回其 ID
 * @param name - 标签名称
 * @returns 标签 ID
 */
async function createTag(name: string): Promise<string> {
    const res = await ctx.request
        .post('/api/tags')
        .send({ name });
    return res.body.data.id;
}

describe('GET /api/collections', () => {
    it('应返回空列表', async () => {
        const res = await ctx.request.get('/api/collections');

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.items).toEqual([]);
        expect(res.body.data.pagination.total).toBe(0);
    });

    it('应支持分页参数', async () => {
        // 创建 5 个收藏项
        for (let i = 1; i <= 5; i++) {
            await ctx.request
                .post('/api/collections')
                .send({ title: `收藏项 ${i}`, url: `https://example.com/${i}` });
        }

        // 请求第 1 页，每页 2 条
        const res = await ctx.request
            .get('/api/collections?page=1&limit=2');

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(2);
        expect(res.body.data.pagination.page).toBe(1);
        expect(res.body.data.pagination.pageSize).toBe(2);
        expect(res.body.data.pagination.total).toBe(5);
        expect(res.body.data.pagination.totalPages).toBe(3);
    });

    it('应支持排序参数（按创建时间升序）', async () => {
        await ctx.request.post('/api/collections').send({ title: '第一篇' });
        await ctx.request.post('/api/collections').send({ title: '第二篇' });
        await ctx.request.post('/api/collections').send({ title: '第三篇' });

        const res = await ctx.request
            .get('/api/collections?sort_by=created_at&sort_order=ASC');

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(3);
        expect(res.body.data.items[0].title).toBe('第一篇');
        expect(res.body.data.items[2].title).toBe('第三篇');
    });

    it('应支持排序参数（按标题降序）', async () => {
        await ctx.request.post('/api/collections').send({ title: 'Alpha' });
        await ctx.request.post('/api/collections').send({ title: 'Gamma' });
        await ctx.request.post('/api/collections').send({ title: 'Beta' });

        const res = await ctx.request
            .get('/api/collections?sort_by=title&sort_order=DESC');

        expect(res.status).toBe(200);
        const titles = res.body.data.items.map((item: any) => item.title);
        expect(titles).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('应支持按 folder_id 筛选', async () => {
        const folderId = await createFolder('测试文件夹');

        await ctx.request.post('/api/collections').send({
            title: '文件夹内收藏',
            folder_id: folderId,
        });
        await ctx.request.post('/api/collections').send({
            title: '未分类收藏',
        });

        const res = await ctx.request
            .get(`/api/collections?folder_id=${folderId}`);

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].title).toBe('文件夹内收藏');
    });

    it('按父文件夹筛选应包含子文件夹内的收藏', async () => {
        const parentRes = await ctx.request.post('/api/folders').send({ name: '技术' });
        const childRes = await ctx.request.post('/api/folders').send({
            name: 'AI',
            parent_id: parentRes.body.data.id,
        });
        const parentId = parentRes.body.data.id;
        const childId = childRes.body.data.id;

        await ctx.request.post('/api/collections').send({
            title: '技术根目录',
            folder_id: parentId,
        });
        await ctx.request.post('/api/collections').send({
            title: 'AI 文章一',
            folder_id: childId,
        });
        await ctx.request.post('/api/collections').send({
            title: 'AI 文章二',
            folder_id: childId,
        });

        const parentFilter = await ctx.request.get(`/api/collections?folder_id=${parentId}`);
        expect(parentFilter.status).toBe(200);
        expect(parentFilter.body.data.items).toHaveLength(3);

        const childFilter = await ctx.request.get(`/api/collections?folder_id=${childId}`);
        expect(childFilter.status).toBe(200);
        expect(childFilter.body.data.items).toHaveLength(2);
    });

    it('应支持按 tag_id 筛选', async () => {
        const tagId = await createTag('测试标签');

        await ctx.request.post('/api/collections').send({
            title: '有标签收藏',
            tag_ids: [tagId],
        });
        await ctx.request.post('/api/collections').send({
            title: '无标签收藏',
        });

        const res = await ctx.request
            .get(`/api/collections?tag_id=${tagId}`);

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].title).toBe('有标签收藏');
    });

    it('应支持按 is_favorite 筛选', async () => {
        await ctx.request.post('/api/collections').send({
            title: '星标收藏',
            is_favorite: true,
        });
        await ctx.request.post('/api/collections').send({
            title: '普通收藏',
        });

        const res = await ctx.request
            .get('/api/collections?is_favorite=1');

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].title).toBe('星标收藏');
    });
});

describe('POST /api/collections', () => {
    it('应创建链接类型收藏', async () => {
        const res = await ctx.request
            .post('/api/collections')
            .send({
                title: 'GitHub',
                url: 'https://github.com',
                type: 'link',
            });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe(0);
        expect(res.body.data.title).toBe('GitHub');
        expect(res.body.data.url).toBe('https://github.com');
        expect(res.body.data.type).toBe('link');
        expect(res.body.data.id).toBeDefined();
    });

    it('应创建笔记类型收藏', async () => {
        const res = await ctx.request
            .post('/api/collections')
            .send({
                title: '学习笔记',
                type: 'note',
                content: '这是一段笔记内容',
            });

        expect(res.status).toBe(201);
        expect(res.body.code).toBe(0);
        expect(res.body.data.title).toBe('学习笔记');
        expect(res.body.data.type).toBe('note');
        expect(res.body.data.content).toBe('这是一段笔记内容');
    });

    it('缺少标题应返回 400', async () => {
        const res = await ctx.request
            .post('/api/collections')
            .send({
                url: 'https://example.com',
            });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('标题为空字符串应返回 400', async () => {
        const res = await ctx.request
            .post('/api/collections')
            .send({
                title: '   ',
                url: 'https://example.com',
            });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('应支持创建时关联标签', async () => {
        const tagId = await createTag('前端');

        const res = await ctx.request
            .post('/api/collections')
            .send({
                title: 'Vue.js',
                tag_ids: [tagId],
            });

        expect(res.status).toBe(201);
        expect(res.body.data.tags).toHaveLength(1);
        expect(res.body.data.tags[0].name).toBe('前端');
    });

    it('应支持创建时指定文件夹', async () => {
        const folderId = await createFolder('开发工具');

        const res = await ctx.request
            .post('/api/collections')
            .send({
                title: 'VS Code',
                folder_id: folderId,
            });

        expect(res.status).toBe(201);
        expect(res.body.data.folder_id).toBe(folderId);
    });
});

describe('GET /api/collections/:id', () => {
    it('应获取收藏项详情', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '测试详情', url: 'https://example.com' });

        const id = createRes.body.data.id;
        const res = await ctx.request.get(`/api/collections/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.title).toBe('测试详情');
        expect(res.body.data.url).toBe('https://example.com');
        expect(res.body.data.tags).toEqual([]);
    });

    it('不存在的 ID 应返回 404', async () => {
        const fakeId = uuidv4();
        const res = await ctx.request.get(`/api/collections/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });

    it('应返回关联的标签和文件夹信息', async () => {
        const folderId = await createFolder('我的文件夹');
        const tagId = await createTag('重要');

        const createRes = await ctx.request
            .post('/api/collections')
            .send({
                title: '带标签和文件夹',
                folder_id: folderId,
                tag_ids: [tagId],
            });

        const id = createRes.body.data.id;
        const res = await ctx.request.get(`/api/collections/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.data.tags).toHaveLength(1);
        expect(res.body.data.tags[0].id).toBe(tagId);
        expect(res.body.data.folder).not.toBeNull();
        expect(res.body.data.folder.id).toBe(folderId);
    });
});

describe('PUT /api/collections/:id', () => {
    it('应更新收藏项标题', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '原标题' });

        const id = createRes.body.data.id;
        const res = await ctx.request
            .put(`/api/collections/${id}`)
            .send({ title: '新标题' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.title).toBe('新标题');
    });

    it('更新标题为空应返回 400', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '原标题' });

        const id = createRes.body.data.id;
        const res = await ctx.request
            .put(`/api/collections/${id}`)
            .send({ title: '' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('不存在的 ID 应返回 404', async () => {
        const fakeId = uuidv4();
        const res = await ctx.request
            .put(`/api/collections/${fakeId}`)
            .send({ title: '新标题' });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});

describe('DELETE /api/collections/:id', () => {
    it('应软删除收藏项', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '待删除' });

        const id = createRes.body.data.id;
        const res = await ctx.request.delete(`/api/collections/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);

        // 验证列表中不再出现
        const listRes = await ctx.request.get('/api/collections');
        expect(listRes.body.data.items).toHaveLength(0);

        // 验证回收站中出现
        const trashRes = await ctx.request.get('/api/trash');
        expect(trashRes.body.data.items).toHaveLength(1);
    });

    it('不存在的 ID 应返回 404', async () => {
        const fakeId = uuidv4();
        const res = await ctx.request.delete(`/api/collections/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});

describe('POST /api/collections/:id/favorite', () => {
    it('应切换星标状态（未星标 -> 星标）', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '测试星标' });

        const id = createRes.body.data.id;
        expect(createRes.body.data.is_favorite).toBe(0);

        const res = await ctx.request.post(`/api/collections/${id}/favorite`);

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.is_favorite).toBe(1);
    });

    it('应切换星标状态（星标 -> 未星标）', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '测试取消星标', is_favorite: true });

        const id = createRes.body.data.id;
        expect(createRes.body.data.is_favorite).toBe(1);

        const res = await ctx.request.post(`/api/collections/${id}/favorite`);

        expect(res.status).toBe(200);
        expect(res.body.data.is_favorite).toBe(0);
    });

    it('不存在的 ID 应返回 404', async () => {
        const fakeId = uuidv4();
        const res = await ctx.request.post(`/api/collections/${fakeId}/favorite`);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});

describe('POST /api/collections/:id/move', () => {
    it('应移动收藏项到文件夹', async () => {
        const folderId = await createFolder('目标文件夹');
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '待移动' });

        const id = createRes.body.data.id;
        const res = await ctx.request
            .post(`/api/collections/${id}/move`)
            .send({ folder_id: folderId });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.folder_id).toBe(folderId);
    });

    it('移动到不存在的文件夹应返回 400', async () => {
        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: '待移动' });

        const id = createRes.body.data.id;
        const res = await ctx.request
            .post(`/api/collections/${id}/move`)
            .send({ folder_id: uuidv4() });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('不存在的收藏项应返回 404', async () => {
        const folderId = await createFolder('目标文件夹');
        const res = await ctx.request
            .post(`/api/collections/${uuidv4()}/move`)
            .send({ folder_id: folderId });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe(40401);
    });
});

describe('POST /api/collections/batch-delete', () => {
    it('应批量软删除收藏项', async () => {
        const res1 = await ctx.request.post('/api/collections').send({ title: 'A' });
        const res2 = await ctx.request.post('/api/collections').send({ title: 'B' });
        const res3 = await ctx.request.post('/api/collections').send({ title: 'C' });

        const ids = [res1.body.data.id, res2.body.data.id, res3.body.data.id];

        const res = await ctx.request
            .post('/api/collections/batch-delete')
            .send({ ids });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.deletedCount).toBe(3);

        // 验证列表为空
        const listRes = await ctx.request.get('/api/collections');
        expect(listRes.body.data.items).toHaveLength(0);
    });

    it('空 ID 列表应返回 400', async () => {
        const res = await ctx.request
            .post('/api/collections/batch-delete')
            .send({ ids: [] });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });
});

describe('POST /api/collections/batch-move', () => {
    it('应批量移动收藏项到文件夹', async () => {
        const folderId = await createFolder('批量目标');
        const res1 = await ctx.request.post('/api/collections').send({ title: 'A' });
        const res2 = await ctx.request.post('/api/collections').send({ title: 'B' });

        const ids = [res1.body.data.id, res2.body.data.id];

        const res = await ctx.request
            .post('/api/collections/batch-move')
            .send({ ids, folder_id: folderId });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.movedCount).toBe(2);
    });

    it('移动到不存在的文件夹应返回 400', async () => {
        const res1 = await ctx.request.post('/api/collections').send({ title: 'A' });

        const res = await ctx.request
            .post('/api/collections/batch-move')
            .send({ ids: [res1.body.data.id], folder_id: uuidv4() });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('空 ID 列表应返回 400', async () => {
        const res = await ctx.request
            .post('/api/collections/batch-move')
            .send({ ids: [], folder_id: uuidv4() });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });
});

describe('POST /api/collections/batch-tags', () => {
    it('应批量追加标签', async () => {
        const tagId = await createTag('批量标签');
        const res1 = await ctx.request.post('/api/collections').send({ title: 'A' });
        const res2 = await ctx.request.post('/api/collections').send({ title: 'B' });

        const ids = [res1.body.data.id, res2.body.data.id];

        const res = await ctx.request
            .post('/api/collections/batch-tags')
            .send({ ids, tag_ids: [tagId], action: 'add' });

        expect(res.status).toBe(200);
        expect(res.body.code).toBe(0);
        expect(res.body.data.updatedCount).toBe(2);
    });

    it('应批量替换标签', async () => {
        const tag1 = await createTag('标签1');
        const tag2 = await createTag('标签2');

        const createRes = await ctx.request
            .post('/api/collections')
            .send({ title: 'A', tag_ids: [tag1] });

        const id = createRes.body.data.id;

        // 替换为 tag2
        const res = await ctx.request
            .post('/api/collections/batch-tags')
            .send({ ids: [id], tag_ids: [tag2], action: 'replace' });

        expect(res.status).toBe(200);
        expect(res.body.data.updatedCount).toBe(1);

        // 验证只有 tag2
        const detail = await ctx.request.get(`/api/collections/${id}`);
        expect(detail.body.data.tags).toHaveLength(1);
        expect(detail.body.data.tags[0].id).toBe(tag2);
    });

    it('空 ID 列表应返回 400', async () => {
        const tagId = await createTag('标签');
        const res = await ctx.request
            .post('/api/collections/batch-tags')
            .send({ ids: [], tag_ids: [tagId], action: 'add' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('空标签列表应返回 400', async () => {
        const res1 = await ctx.request.post('/api/collections').send({ title: 'A' });

        const res = await ctx.request
            .post('/api/collections/batch-tags')
            .send({ ids: [res1.body.data.id], tag_ids: [], action: 'add' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });

    it('无效 action 应返回 400', async () => {
        const tagId = await createTag('标签');
        const res1 = await ctx.request.post('/api/collections').send({ title: 'A' });

        const res = await ctx.request
            .post('/api/collections/batch-tags')
            .send({ ids: [res1.body.data.id], tag_ids: [tagId], action: 'invalid' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe(40001);
    });
});
