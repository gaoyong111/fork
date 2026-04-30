/**
 * 日期格式化工具函数
 */

/**
 * 格式化日期为可读字符串
 * @param dateStr - ISO 8601 格式的日期字符串
 * @returns 格式化后的日期字符串，如 "2026-04-13 10:00"
 */
export function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 计算相对时间（如 "3 分钟前"、"2 天前"）
 * @param dateStr - ISO 8601 格式的日期字符串
 * @returns 相对时间描述
 */
export function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
        return '刚刚';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} 分钟前`;
    }
    if (diffHours < 24) {
        return `${diffHours} 小时前`;
    }
    if (diffDays < 30) {
        return `${diffDays} 天前`;
    }

    return formatDate(dateStr);
}

/**
 * 截断文本
 * @param text - 原始文本
 * @param maxLength - 最大长度，默认 100
 * @returns 截断后的文本，超出部分用省略号代替
 */
export function truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength) + '...';
}
