import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Clipboard, X, ChevronDown, ChevronUp, Check, AlertCircle, Loader2 } from 'lucide-react';
import { ShortLink } from '../types';

interface ShortenerFormProps {
  onSuccess: (link: ShortLink) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ShortenerForm: React.FC<ShortenerFormProps> = ({ onSuccess, showToast }) => {
  const [url, setUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customSlug, setCustomSlug] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  // Slug 实时可用性校验状态
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugStatus, setSlugStatus] = useState<{ available: boolean; reason: string } | null>(null);

  const debounceTimerRef = useRef<number | null>(null);

  // 监听 customSlug 变化并防抖校验
  useEffect(() => {
    if (!customSlug || customSlug.trim().length < 2) {
      setSlugStatus(null);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      setSlugChecking(true);
      try {
        const res = await fetch(`/api/check?slug=${encodeURIComponent(customSlug.trim())}`);
        const data = (await res.json()) as { available: boolean; reason: string };
        setSlugStatus(data);
      } catch {
        setSlugStatus(null);
      } finally {
        setSlugChecking(false);
      }
    }, 350);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [customSlug]);

  // 从剪贴板粘贴
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        showToast('已从剪贴板粘贴网址', 'info');
      }
    } catch {
      showToast('无法访问剪贴板，请手动粘贴', 'error');
    }
  };

  // 提交生成短链接
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      showToast('请输入需要缩短的长网址', 'error');
      return;
    }

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    // 拦截自身域名环回死循环
    try {
      const parsed = new URL(targetUrl);
      const curHost = window.location.hostname.toLowerCase();
      const targetHost = parsed.hostname.toLowerCase();
      if (
        targetHost === curHost ||
        targetHost === 'sk.gs' ||
        targetHost === 'www.sk.gs'
      ) {
        showToast('禁止将目标网址指向 sk.gs 自身，防止死循环跳转', 'error');
        return;
      }
    } catch {
      showToast('请输入有效的网址', 'error');
      return;
    }

    if (customSlug && slugStatus && !slugStatus.available) {
      showToast(`自定义短链不可用: ${slugStatus.reason}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          custom_slug: customSlug.trim() || undefined,
          title: title.trim() || undefined,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        throw new Error(data.error || '生成短链接失败');
      }

      onSuccess(data as ShortLink);
      setUrl('');
      setCustomSlug('');
      setTitle('');
      setSlugStatus(null);
      showToast('短链接已生成！', 'success');
    } catch (err: any) {
      showToast(err.message || '网络连接异常，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_15px_40px_rgba(0,0,0,0.05)] sm:p-8 dark:border-slate-800/80 dark:bg-slate-900/90 dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(79,70,229,0.1)] dark:hover:shadow-[0_20px_50px_rgba(99,102,241,0.15)] ring-1 ring-slate-900/5 dark:ring-white/5">
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        {/* Main URL Input */}
        <div className="relative">
          <label htmlFor="url-input" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            原始长链接 (Target URL)
          </label>
          <div className="relative flex items-center">
            <input
              id="url-input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/very/long/url/path..."
              required
              className="w-full rounded-2xl border border-slate-300/90 bg-slate-50/70 px-4 py-3.5 pr-20 text-sm sm:text-base text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-600/10 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-400 dark:focus:bg-slate-800"
            />
            {/* Action buttons inside input */}
            <div className="absolute right-2.5 flex items-center gap-1">
              {url ? (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  aria-label="清空输入"
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePaste}
                  title="粘贴剪贴板网址"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-200/80 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-300 dark:bg-slate-700/80 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  <span>粘贴</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Toggle Advanced / Custom Slug */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer"
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{showAdvanced ? '收起自定义短链与备注' : '自定义短链后缀与备注 (Optional)'}</span>
          </button>
        </div>

        {/* Collapsible Advanced Options */}
        {showAdvanced && (
          <div className="space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 sm:p-5 animate-fade-in dark:border-slate-800/80 dark:bg-slate-950/40">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Custom Slug Input */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  自定义短链后缀
                </label>
                <div className="relative flex items-center">
                  <div className="pointer-events-none absolute left-3 font-mono text-xs text-slate-400">
                    sk.gs /
                  </div>
                  <input
                    type="text"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="my-link"
                    maxLength={30}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-16 pr-8 font-mono text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  {/* Status Indicator */}
                  <div className="absolute right-2.5 flex items-center">
                    {slugChecking && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                    {!slugChecking && slugStatus && slugStatus.available && (
                      <span title="该后缀可用">
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      </span>
                    )}
                    {!slugChecking && slugStatus && !slugStatus.available && (
                      <span title={slugStatus.reason}>
                        <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                      </span>
                    )}
                  </div>
                </div>
                {slugStatus && (
                  <p className={`mt-1.5 text-[11px] font-medium ${slugStatus.available ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                    {slugStatus.reason}
                  </p>
                )}
              </div>

              {/* Title / Note */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  短链备注标题（可选）
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="如：GitHub 仓库主页"
                  maxLength={50}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-sm sm:text-base font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 hover:shadow-indigo-600/35 active:scale-[0.99] disabled:opacity-60 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>正在极速生成...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>生成短链接 (Go Swift)</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
