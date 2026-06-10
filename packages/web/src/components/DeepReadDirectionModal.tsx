/**
 * DeepReadDirectionModal - 定向再次精读弹窗
 * 用户输入阅读方向或问题，基于已有原文重新生成摘要
 */

import { useEffect, useCallback, useState } from 'react';
import './DeepReadDirectionModal.css';

const QUICK_PROMPTS = [
    '更简洁，只要核心结论',
    '加强批判性分析',
    '补充商业/市场影响分析',
    '从技术实现角度解读',
    '列出可执行的行动建议',
];

interface DeepReadDirectionModalProps {
    onClose: () => void;
    onConfirm: (direction: string) => void;
}

export default function DeepReadDirectionModal({ onClose, onConfirm }: DeepReadDirectionModalProps) {
    const [direction, setDirection] = useState('');

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        },
        [onClose],
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleSubmit = () => {
        const trimmed = direction.trim();
        if (!trimmed) return;
        onConfirm(trimmed);
    };

    return (
        <div className="deep-read-direction-overlay" onClick={onClose}>
            <div className="deep-read-direction-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="deep-read-direction-title">定向再次精读</h3>
                <p className="deep-read-direction-desc">
                    将基于已保存的原文重新解读，不会重新抓取网页。描述你的阅读方向或提出问题：
                </p>

                <div className="deep-read-direction-quick">
                    {QUICK_PROMPTS.map((prompt) => (
                        <button
                            key={prompt}
                            type="button"
                            className="deep-read-direction-chip"
                            onClick={() => setDirection(prompt)}
                        >
                            {prompt}
                        </button>
                    ))}
                </div>

                <textarea
                    className="deep-read-direction-input"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    placeholder="例如：重点分析作者的核心论据是否成立；或：用 3 条 bullet 总结对产品经理的启发"
                    rows={4}
                    autoFocus
                />

                <div className="deep-read-direction-actions">
                    <button type="button" className="deep-read-direction-btn" onClick={onClose}>
                        取消
                    </button>
                    <button
                        type="button"
                        className="deep-read-direction-btn primary"
                        disabled={!direction.trim()}
                        onClick={handleSubmit}
                    >
                        开始精读
                    </button>
                </div>
            </div>
        </div>
    );
}
