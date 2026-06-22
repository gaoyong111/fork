import { describe, expect, it } from 'vitest';
import { truncateForAi } from '../../../shared/src/ai/htmlUtils';

describe('truncateForAi', () => {
    it('短内容不截断', () => {
        const content = 'hello';
        expect(truncateForAi(content, 100)).toBe(content);
    });

    it('head/tail 相接时不出现负数或 0 字省略标记', () => {
        const content = 'a\n\nb';
        const result = truncateForAi(content, 3);

        expect(result).toBe(content);
        expect(result).not.toMatch(/中间约 -?\d+ 字已省略/);
    });

    it('省略字数按中间段落实际长度计算', () => {
        const content = 'aa\n\nbb\n\ncc\n\ndd';
        const result = truncateForAi(content, 10);

        expect(result).toContain('【中间约 2 字已省略');
        expect(result.startsWith('aa\n\nbb')).toBe(true);
        expect(result.endsWith('dd')).toBe(true);
        expect(result).not.toContain('\n\nbb\n\ncc\n\n');
    });

    it('marker 字数等于中间段 join 后的实际长度', () => {
        const content = 'aa\n\nbbbb\n\ncc\n\ndd';
        const result = truncateForAi(content, 13);
        const match = result.match(/中间约 (\d+) 字已省略/);

        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe('bbbb'.length);
    });
});
