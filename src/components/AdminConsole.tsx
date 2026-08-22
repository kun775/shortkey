import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Link2,
  TrendingUp,
  Activity,
  Calendar,
  Search,
  RefreshCw,
  Download,
  Copy,
  Check,
  Edit3,
  Power,
  Trash2,
  LogOut,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { AdminLinkItem, AdminStats } from '../types';
import { EditModal } from './EditModal';

interface AdminConsoleProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ showToast }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('sk_admin_token');
  });
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // 数据列表与统计状态
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [links, setLinks] = useState<AdminLinkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0'>('all');

  // 编辑模态弹窗与复制状态
  const [editingItem, setEditingItem] = useState<AdminLinkItem | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState<string | null>(null);

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem('sk_admin_token') || '';
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  // 登录
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      showToast('请输入管理员访问密码', 'error');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        throw new Error(data.error || '密码错误');
      }

      localStorage.setItem('sk_admin_token', data.token);
      setIsAuthenticated(true);
      setPassword('');
      showToast('管理员登录成功', 'success');
    } catch (err: any) {
      showToast(err.message || '登录失败', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('sk_admin_token');
    setIsAuthenticated(false);
    showToast('已退出管理后台', 'info');
  };

  // 加载统计与列表
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();

      // 并行请求统计和列表
      const [statsRes, linksRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch(
          `/api/admin/links?page=${page}&limit=15&keyword=${encodeURIComponent(keyword)}&status=${statusFilter}`,
          { headers }
        ),
      ]);

      if (statsRes.status === 401 || linksRes.status === 401) {
        localStorage.removeItem('sk_admin_token');
        setIsAuthenticated(false);
        throw new Error('会话已过期，请重新登录');
      }

      if (statsRes.ok) {
        const statsData = (await statsRes.json()) as AdminStats;
        setStats(statsData);
      }

      if (linksRes.ok) {
        const linksData = (await linksRes.json()) as { list: AdminLinkItem[]; total: number; totalPages: number };
        setLinks(linksData.list || []);
        setTotalCount(linksData.total || 0);
        setTotalPages(linksData.totalPages || 1);
      }
    } catch (err: any) {
      showToast(err.message || '获取数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, keyword, statusFilter, getAuthHeader, showToast]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  // 复制链接
  const handleCopy = async (slug: string) => {
    const fullUrl = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedSlug(slug);
      showToast(`已复制: ${fullUrl}`, 'success');
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      showToast('复制失败', 'error');
    }
  };

  // 启停切换
  const handleToggleStatus = async (item: AdminLinkItem) => {
    const nextStatus = item.is_active === 1 ? 0 : 1;
    try {
      const res = await fetch(`/api/admin/link/${encodeURIComponent(item.slug)}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify({ is_active: nextStatus }),
      });

      if (!res.ok) throw new Error('切换状态失败');
      showToast(`短链已${nextStatus === 1 ? '启用' : '停用'}`, 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 删除短链
  const handleDelete = async (slug: string) => {
    try {
      const res = await fetch(`/api/admin/link/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });

      if (!res.ok) throw new Error('删除失败');
      showToast('短链接已删除', 'success');
      setDeleteConfirmSlug(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 导出 CSV
  const handleExportCsv = () => {
    if (links.length === 0) {
      showToast('暂无数据可导出', 'info');
      return;
    }

    const headers = ['Slug', '目标网址', '备注标题', '点击量', '状态', '创建时间'];
    const rows = links.map((l) => [
      l.slug,
      `"${l.url.replace(/"/g, '""')}"`,
      `"${(l.title || '').replace(/"/g, '""')}"`,
      l.clicks,
      l.is_active === 1 ? '正常' : '已停用',
      l.created_at,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sk_gs_links_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('已导出 CSV 报表', 'success');
  };

  // 1. 登录表单
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400 mb-3">
              <Lock className="h-6 w-6 stroke-[2]" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">管理控制台登录</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              请输入在 Cloudflare 配置的 <code className="text-indigo-600 dark:text-indigo-400">ADMIN_SECRET</code> 访问密钥
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                管理密码 (Secret)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-600/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-60 transition-all cursor-pointer"
            >
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span>验证并进入控制台</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. 控制台主体
  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Console Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            管理控制台 (Admin Console)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            全站短链接数据大盘与配置管理
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>导出 CSV</span>
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>退出</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (4 Columns) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">总短链接数</span>
            <Link2 className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {stats?.total_links ?? '--'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">累计跳转次数</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            {stats?.total_clicks ?? '--'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">当前活跃短链</span>
            <Activity className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {stats?.active_links ?? '--'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">今日新增</span>
            <Calendar className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {stats?.today_links ?? '--'}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="搜索短链 Slug、目标网址或备注..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 outline-none focus:border-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="all">全部状态</option>
            <option value="1">仅看正常启用</option>
            <option value="0">仅看已停用</option>
          </select>
        </div>
      </div>

      {/* Table (Desktop) / Cards (Mobile) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {/* Desktop Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/80 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="py-3.5 pl-4 pr-2 font-semibold">短链 Slug</th>
                <th className="px-3 py-3.5 font-semibold">目标原始网址</th>
                <th className="px-3 py-3.5 font-semibold">点击次数</th>
                <th className="px-3 py-3.5 font-semibold">状态</th>
                <th className="px-3 py-3.5 font-semibold">创建时间</th>
                <th className="py-3.5 pl-2 pr-4 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading && links.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500 mb-2" />
                    <span>加载数据中...</span>
                  </td>
                </tr>
              ) : links.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    暂无匹配的短链接记录
                  </td>
                </tr>
              ) : (
                links.map((item) => (
                  <tr key={item.slug} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 pl-4 pr-2 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      <div className="flex items-center gap-1.5">
                        <span>{item.slug}</span>
                        {item.title && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {item.title}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-3.5 text-slate-600 dark:text-slate-300" title={item.url}>
                      {item.url}
                    </td>
                    <td className="px-3 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {item.clicks.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          item.is_active === 1
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {item.is_active === 1 ? '正常' : '已停用'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-slate-400 dark:text-slate-500">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 pl-2 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleCopy(item.slug)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          title="复制完整短链"
                        >
                          {copiedSlug === item.slug ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>

                        <a
                          href={`/${item.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          title="访问测试"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>

                        <button
                          onClick={() => setEditingItem(item)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          title="编辑短链"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`rounded-lg p-1.5 ${
                            item.is_active === 1
                              ? 'text-slate-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/50'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                          }`}
                          title={item.is_active === 1 ? '停用链接' : '重新启用'}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => setDeleteConfirmSlug(item.slug)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                          title="删除短链"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stream Cards (< 768px) */}
        <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {loading && links.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500 mb-1.5" />
              <span className="text-xs">加载中...</span>
            </div>
          ) : links.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">暂无短链接记录</div>
          ) : (
            links.map((item) => (
              <div key={item.slug} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      sk.gs/{item.slug}
                    </span>
                    {item.title && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {item.title}
                      </span>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      item.is_active === 1
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {item.is_active === 1 ? '正常' : '已停用'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{item.url}</p>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                  <span>点击量: <strong className="text-slate-900 dark:text-white">{item.clicks}</strong></span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>

                {/* Mobile Actions */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2 dark:border-slate-800/80">
                  <button
                    onClick={() => handleCopy(item.slug)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Copy className="h-3 w-3" />
                    <span>复制</span>
                  </button>
                  <button
                    onClick={() => setEditingItem(item)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>编辑</span>
                  </button>
                  <button
                    onClick={() => handleToggleStatus(item)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Power className="h-3 w-3" />
                    <span>{item.is_active === 1 ? '停用' : '启用'}</span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirmSlug(item.slug)}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>删除</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
          <span>
            共 <strong className="text-slate-900 dark:text-white">{totalCount}</strong> 条记录（第 {page}/{totalPages} 页）
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>上一页</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <span>下一页</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={fetchData}
          showToast={showToast}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmSlug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-slide-up">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/60">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">确认删除短链接？</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              删除后短链 <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400">sk.gs/{deleteConfirmSlug}</code> 将立即失效无法跳转，该操作不可恢复。
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmSlug(null)}
                className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmSlug)}
                className="rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 shadow-xs"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
