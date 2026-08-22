import React, { useEffect, useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { AdminLinkItem } from '../types';

interface EditModalProps {
  item: AdminLinkItem;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const EditModal: React.FC<EditModalProps> = ({ item, onClose, onSuccess, showToast }) => {
  const [url, setUrl] = useState(item.url);
  const [title, setTitle] = useState(item.title || '');
  const [isActive, setIsActive] = useState(item.is_active === 1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      showToast('目标网址不能为空', 'error');
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

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/link/${encodeURIComponent(item.slug)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          title: title.trim(),
          is_active: isActive ? 1 : 0,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存修改失败');
      }

      showToast('短链接信息已更新', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || '更新失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-link-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h3 id="edit-link-title" className="text-base font-semibold text-slate-900 dark:text-white">
              编辑短链: <span className="font-mono text-indigo-600 dark:text-indigo-400">sk.gs/{item.slug}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭编辑弹窗"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              目标原始网址 (Target URL)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              备注说明 / 标题
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="填写便于识别的名称"
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Toggle Active Status */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">启用该短链接</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">关闭后访问该短链将显示停用提示</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              aria-label="启用该短链接"
              onClick={() => setIsActive((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isActive ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-all shadow-sm"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>保存修改</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
