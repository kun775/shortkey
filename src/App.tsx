import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ShortenerForm } from './components/ShortenerForm';
import { ResultCard } from './components/ResultCard';
import { HistoryList } from './components/HistoryList';
import { AdminConsole } from './components/AdminConsole';
import { ShortLink } from './types';
import { getLocalHistory, saveLocalHistory, removeHistoryItem, clearAllHistory } from './utils/storage';
import { Zap, Shield, Sparkles, CheckCircle2, AlertCircle, Info, Github } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'home' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
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
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 监听浏览器前进后退与 URL 变化
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/admin' || path.startsWith('/admin/') || hash === '#/admin' || hash === '#admin') {
        setCurrentView('admin');
      } else {
        setCurrentView('home');
      }
    };

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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navigation */}
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentView={currentView}
        onNavigate={handleViewChange}
      />

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className={`mx-auto transition-all duration-300 ${currentView === 'admin' ? 'max-w-6xl' : 'max-w-2xl'}`}>
          {currentView === 'home' ? (
            <div className="space-y-8">
              {/* Hero Title Section */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40">
                  <Zap className="h-3.5 w-3.5 text-indigo-500 fill-indigo-500" />
                  <span>sk.gs · 边缘极速短链</span>
                </div>

                <h1 className="font-mono text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                  Short key, <span className="text-indigo-600 dark:text-indigo-400">Go swift.</span>
                </h1>

                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                  基于 Cloudflare 全球边缘网络与 D1 驱动，毫秒级 302 直达跳转，纯粹、安全、无冗余。
                </p>
              </div>

              {/* Shortener Input Form */}
              <ShortenerForm onSuccess={handleShortenSuccess} showToast={showToast} />

              {/* Latest Result Card */}
              {currentResult && (
                <ResultCard link={currentResult} showToast={showToast} />
              )}

              {/* Feature Badges */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-2">
                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white/60 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/40">
                  <Zap className="h-4 w-4 text-indigo-500 mb-1" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">边缘直达</span>
                  <span className="text-[10px] text-slate-400">&lt;10ms 全球响应</span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white/60 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/40">
                  <Shield className="h-4 w-4 text-emerald-500 mb-1" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">安全防冲突</span>
                  <span className="text-[10px] text-slate-400">D1 原生唯一约束</span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/60 bg-white/60 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/40">
                  <Sparkles className="h-4 w-4 text-amber-500 mb-1" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">自定义 Slug</span>
                  <span className="text-[10px] text-slate-400">个性化定制后缀</span>
                </div>
              </div>

              {/* Local History Section */}
              <HistoryList
                history={history}
                onClear={handleClearAllHistory}
                onRemove={handleRemoveHistory}
                showToast={showToast}
              />
            </div>
          ) : (
            <AdminConsole showToast={showToast} />
          )}
        </div>
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-200/80 py-6 text-center text-xs text-slate-400 dark:border-slate-800/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">sk.gs</span>
            <span>·</span>
            <span>Short key, Go swift.</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/kun775/shortkey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
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
