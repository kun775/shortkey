import React from 'react';
import { Zap, Moon, Sun, Home, Link2 } from 'lucide-react';

interface HeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  currentView: 'home' | 'admin';
  onNavigate: (view: 'home' | 'admin') => void;
}

export const Header: React.FC<HeaderProps> = ({
  darkMode,
  setDarkMode,
  currentView,
  onNavigate,
}) => {
  return (
    /*
     * shrink-0：在视口锁定的工作台外壳里，Header 是 flex 列的固定一端。
     * 少了它会被 flex 压缩 —— 滚动内容一长，Header 高度就被吃掉。
     */
    <header className="z-30 shrink-0 border-b border-slate-200 bg-white transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand Logo & Slogan */}
        <div
          className="flex cursor-pointer select-none items-center gap-2.5"
          onClick={() => onNavigate('home')}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white transition-transform active:scale-95">
            <Link2 className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold tracking-title text-slate-900 dark:text-slate-100">
              sk.gs
            </span>
            {/* 断点原本写作 xs:，但项目并未定义 xs —— 徽标在任何尺寸下都不会出现。
                改用内置的 sm:，恢复"仅窄屏隐藏"的本来意图。 */}
            <span className="hidden items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 sm:inline-flex dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
              <Zap className="h-3 w-3" />
              Go Swift
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {currentView === 'admin' && (
            <button
              onClick={() => onNavigate('home')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              title="返回短链接生成首页"
            >
              <Home className="h-3.5 w-3.5" />
              <span>返回首页</span>
            </button>
          )}

          <button
            onClick={() => setDarkMode((prev) => !prev)}
            aria-label={darkMode ? '切换为浅色模式' : '切换为深色模式'}
            aria-pressed={darkMode}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
