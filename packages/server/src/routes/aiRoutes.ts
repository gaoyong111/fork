/**
 * AI 服务路由 - 文章精读、标签推荐等 AI 能力
 */

import { Router, Request, Response } from 'express';
import * as cheerio from 'cheerio';

const router = Router();

/** AI API 配置：兼容 OpenAI 格式 */
const AI_API_URL = process.env.AI_API_URL || 'https://api.openai.com/v1';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

/** AI API 调用超时（长文本生成需要较长时间） */
const AI_TIMEOUT = 120000;

/** 抓取页面超时 */
const FETCH_TIMEOUT = 15000;

/** 模拟浏览器的 User-Agent */
const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 从页面 HTML 中提取可读的文本内容（去除标签、脚本、样式）
 * @param html - 原始 HTML
 * @param maxLength - 最大提取长度
 * @returns 纯文本内容
 */
function extractPageText(html: string, maxLength: number = 8000): string {
    const $ = cheerio.load(html);

    // 移除无用元素
    $('script, style, nav, footer, header, aside, iframe, noscript, svg, form').remove();

    // 优先提取 article 或 main 内容
    let text = '';
    const article = $('article').first();
    const main = $('main').first();

    if (article.length) {
        text = article.text();
    } else if (main.length) {
        text = main.text();
    } else {
        text = $('body').text();
    }

    // 清理空白字符
    text = text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();

    // 截断
    if (text.length > maxLength) {
        text = text.slice(0, maxLength) + '...';
    }

    return text;
}

/**
 * POST /api/ai/summarize
 * 抓取URL内容并用AI整理归纳为详细精读
 * Body: { "url": "https://example.com" }
 * Response: { "code": 0, "data": { "summary": "<html>..." } }
 */
router.post('/summarize', async (req: Request, res: Response): Promise<void> => {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
        res.json({ code: -1, message: '缺少 URL 参数' });
        return;
    }

    if (!AI_API_KEY) {
        res.json({ code: -1, message: 'AI 服务未配置（缺少 AI_API_KEY）' });
        return;
    }

    try {
        // 1. 抓取页面
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
            redirect: 'follow',
        });

        clearTimeout(timeoutId);

        const html = await response.text();
        const pageText = extractPageText(html);

        if (!pageText || pageText.length < 50) {
            res.json({ code: -1, message: '无法提取页面内容，请确认链接可访问' });
            return;
        }

        // 2. 调用 AI API 进行精读归纳（120s 超时适配长文本生成）
        const aiController = new AbortController();
        const aiTimeoutId = setTimeout(() => aiController.abort(), AI_TIMEOUT);

        const aiResponse = await fetch(`${AI_API_URL}/chat/completions`, {
            method: 'POST',
            signal: aiController.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `你是一个专业的深度阅读助手。请对用户提供的文章内容进行精读和归纳总结。

请按照以下结构输出 HTML 格式的精读报告（不要用 markdown，直接用 HTML 标签）：

<h3>📖 核心观点</h3>
<p>用2-3句话概括文章最核心的观点</p>

<h3>🔍 详细分析</h3>
<p>分3-5个要点详细展开分析文章的关键论述，每个要点用 <strong>加粗标题</strong> 开头</p>

<h3>💡 关键洞察</h3>
<p>指出文章中独特或有价值的洞察</p>

<h3>📝 原文金句</h3>
<p>摘录1-2句文章中的精彩原话</p>

要求：
- 内容要详细、有深度，不少于300字
- 使用 HTML 格式输出，不要使用 markdown
- 风格保持客观、专业
- 如果内容不是文章或无法理解，如实说明`,
                    },
                    {
                        role: 'user',
                        content: `请精读并归纳以下文章内容：\n\n${pageText}`,
                    },
                ],
                max_tokens: 2048,
                temperature: 0.7,
            }),
        });

        clearTimeout(aiTimeoutId);

        const aiData = await aiResponse.json() as Record<string, unknown>;

        if (!aiData.choices || !Array.isArray(aiData.choices) || aiData.choices.length === 0) {
            res.json({ code: -1, message: 'AI 服务响应异常' });
            return;
        }

        const choice = aiData.choices[0] as Record<string, unknown>;
        const message = choice.message as Record<string, unknown> | undefined;
        const summary = (message?.content as string) || '';

        res.json({
            code: 0,
            data: { summary },
        });
    } catch (err) {
        console.error('AI 精读失败:', err);
        res.json({ code: -1, message: 'AI 精读失败，请稍后重试' });
    }
});

export default router;
