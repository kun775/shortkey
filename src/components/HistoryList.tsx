import React, { useState } from 'react';
import { History, Trash2, Copy, Check, ExternalLink } from 'lucide-react';
import { ShortLink } from '../types';

interface HistoryListProps {
  history: ShortLink[];
  onClear: () => void;
  onRemove: (slug: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({
  history,
  onClear,
  onRemove,
  showToast,
}) => {
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  if (history.length === 0) {
    return null;
  }

  const handleCopy = async (item: ShortLink) => {
    try {
      await navigator.clipboard.writeText(item.short_url);
      setCopiedSlug(item.slug);
      showToast(`已复制: ${item.short_url}`, 'success');
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      showToast('复制失败，请手动复制', 'error');
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <History className="h-3.5 w-3.5" />
          <span>本地生成记录 ({history.length})</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
        >
          清空记录
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {history.map((item) => {
          const isCopied = copiedSlug === item.slug;
          return (
            <div
              key={item.slug}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 transition-all"
            >
              {/* Left Content */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    sk.gs/{item.slug}
                  </span>
                  {item.title && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {item.title}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {item.url}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                <button
                  onClick={() => handleCopy(item)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    isCopied
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                  title="复制短链接"
                >
                  {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{isCopied ? '已复制' : '复制'}</span>
                </button>

                <a
                  href={item.short_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                  title="测试跳转"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>

                <button
                  onClick={() => onRemove(item.slug)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors"
                  title="移除记录"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
