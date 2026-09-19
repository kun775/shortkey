import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ShortenerForm } from './components/ShortenerForm';
import { ResultCard } from './components/ResultCard';
import { HistoryList } from './components/HistoryList';
import { SiteStats } from './components/SiteStats';
import { AdminConsole } from './components/AdminConsole';
import { ShortLink } from './types';
import { getLocalHistory, saveLocalHistory, removeHistoryItem, clearAllHistory } from './utils/storage';
import { CheckCircle2, AlertCircle, Info, Github } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'home' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
      const hash = window.location.hash.toLowerCase();
      if (path === '/admin' || path.startsWith('/admin/') || hash === '#/admin' || hash === '#admin') {
        return 'admin';
      }
    }
    return 'home';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [currentResult, setCurrentResult] = useState<ShortLink | null>(null);
  const [history, setHistory] = useState<ShortLink[]>([]);
  const [statsToken, setStatsToken] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 监听浏览器前进后退与 URL 变化
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
      const hash = window.location.hash.toLowerCase();
      if (path === '/admin' || path.startsWith('/admin/') || hash === '#/admin' || hash === '#admin') {
        setCurrentView('admin');
      } else {
        setCurrentView('home');
      }
    };

    handleLocationChange();

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const handleViewChange = (view: 'home' | 'admin') => {
    setCurrentView(view);
    if (view === 'admin') {
      window.history.pushState(null, '', '/admin');
    } else {
      window.history.pushState(null, '', '/');
    }
  };

  // 暗黑模式切换
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // 加载本地历史
  useEffect(() => {
    setHistory(getLocalHistory());
  }, []);

  // Toast 通知函数
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  // 生成成功回调
  const handleShortenSuccess = (link: ShortLink) => {
    setCurrentResult(link);
    const updated = saveLocalHistory(link);
    setHistory(updated);
    setStatsToken((t) => t + 1);
  };

  const handleRemoveHistory = (slug: string) => {
    const updated = removeHistoryItem(slug);
    setHistory(updated);
    if (currentResult?.slug === slug) {
      setCurrentResult(null);
    }
    showToast('已移除该记录', 'info');
  };

  const handleClearAllHistory = () => {
    clearAllHistory();
    setHistory([]);
    setCurrentResult(null);
    showToast('本地记录已清空', 'info');
  };

  const isAdminView = currentView === 'admin';

  return (
    /*
     * 工作台外壳：视口锁定 + 内部滚动。
     * Header 与 Footer 是 flex 列的两端（shrink-0，天然固定），只有中间区域滚动 ——
     * 这就是「固定 header/footer + 列表滚动」的落点。
     * 链路上每一层都带 `min-h-0`：flex 子项默认 min-height:auto，漏掉它会让
     * flex-1 撑成内容高度，结果是整页滚不动、底栏被挤出视口。
     */
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Navigation */}
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentView={currentView}
        onNavigate={handleViewChange}
      />

      {/* Main Content Area */}
      <main
        className={`min-h-0 flex-1 ${isAdminView ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        <div
          className={`mx-auto flex w-full min-h-0 flex-col transition-all duration-300 ${
            isAdminView
              ? 'h-full max-w-6xl px-4 pb-4 pt-4 sm:px-6'
              : 'max-w-2xl px-4 py-6 sm:px-6 sm:py-10'
          }`}
        >
          {currentView === 'home' ? (
            <div className="space-y-8">
              {/* Hero Title Section */}
              <div className="text-center pt-2 sm:pt-6 pb-1">
                <h1 className="font-mono text-3xl font-semibold tracking-display sm:whitespace-nowrap sm:text-5xl md:text-6xl">
                  <span className="text-brand-600 dark:text-brand-400">Short</span>{' '}
                  <span className="text-slate-900 dark:text-slate-100">Key,</span>{' '}
                  <span className="text-brand-600 dark:text-brand-400">Go</span>{' '}
                  <span className="text-slate-900 dark:text-slate-100">Swift.</span>
                </h1>
                <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                  极速、安全、无冗余的边缘短链接生成与管理
                </p>
              </div>

              {/* Shortener Floating Input Form */}
              <ShortenerForm onSuccess={handleShortenSuccess} showToast={showToast} />

              {/* Latest Result Card */}
              {currentResult && (
                <ResultCard link={currentResult} showToast={showToast} />
              )}

              {/* Local History Section */}
              <HistoryList
                history={history}
                onClear={handleClearAllHistory}
                onRemove={handleRemoveHistory}
                showToast={showToast}
              />

              {/* Global Site Statistics */}
              <SiteStats refreshToken={statsToken} />
            </div>
          ) : (
            <AdminConsole showToast={showToast} />
          )}
        </div>
      </main>

      {/* Global Footer */}
      <footer className="shrink-0 border-t border-slate-200 py-4 text-xs text-slate-500 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">sk.gs</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="font-mono text-slate-500 dark:text-slate-400">
              <span className="text-brand-600 dark:text-brand-400">Short</span> Key,{' '}
              <span className="text-brand-600 dark:text-brand-400">Go</span> Swift.
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/kun775/shortkey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <Github className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </footer>

      {/* Toast Notifications Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium text-white shadow-lg animate-slide-up ${
              toast.type === 'success'
                ? 'bg-emerald-600'
                : toast.type === 'error'
                ? 'bg-rose-600'
                : 'bg-slate-800 dark:bg-slate-700'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {toast.type === 'error' && <AlertCircle className="h-4 w-4" />}
            {toast.type === 'info' && <Info className="h-4 w-4" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
