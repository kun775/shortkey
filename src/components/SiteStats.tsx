import React, { useEffect, useState } from 'react';
import { Link2, MousePointerClick } from 'lucide-react';

interface SiteStatsProps {
  /** 变化时重新拉取统计（如新建短链成功后） */
  refreshToken?: number;
}

interface PublicStats {
  total_links: number;
  total_clicks: number;
}

export const SiteStats: React.FC<SiteStatsProps> = ({ refreshToken = 0 }) => {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch('/api/stats', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          // 首次加载走 60s 边缘/浏览器缓存；主动刷新（如刚创建了短链）时回源取最新值
          cache: refreshToken > 0 ? 'reload' : 'default',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Partial<PublicStats>;
        if (cancelled) return;
        if (typeof data.total_links !== 'number' || typeof data.total_clicks !== 'number') {
          throw new Error('invalid payload');
        }
        setStats({ total_links: data.total_links, total_clicks: data.total_clicks });
        setFailed(false);
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
        setFailed(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [refreshToken]);

  // 拉取失败或本地开发（无 Worker）时不展示该区块，避免页面上出现无意义的占位
  if (failed || !stats) return null;

  const items = [
    {
      label: '累计短链',
      value: stats.total_links,
      icon: <Link2 className="h-3.5 w-3.5" />,
      accent: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      label: '累计点击',
      value: stats.total_clicks,
      icon: <MousePointerClick className="h-3.5 w-3.5" />,
      accent: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/60 px-2 py-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/40">
      <div className="grid grid-cols-2 divide-x divide-slate-200/80 dark:divide-slate-800/80">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1 px-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              {item.icon}
              <span>{item.label}</span>
            </div>
            <div className={`font-mono text-2xl font-bold tracking-tight ${item.accent}`}>
              {item.value.toLocaleString('en-US')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
