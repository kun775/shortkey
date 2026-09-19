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

/** 认证失败码 → 可读文案。服务端只回传稳定错误码，不回传堆栈或原始异常。 */
const AUTH_ERROR_TEXT: Record<string, string> = {
  Configuration: '认证服务配置异常，请检查 DEX 相关配置后重试。',
  StateInvalid: '登录会话已失效（安全校验未通过），请重新发起登录。',
  StateMismatch: '登录状态校验失败，请重新发起登录。',
  AccessDenied: '该 DEX 账号未获授权访问本后台。',
  OAuthCallback: '认证回调参数异常，请重新发起登录。',
  TokenExchangeFailed: '与认证服务交换凭据失败，请稍后重试。',
  InvalidIdToken: '身份令牌校验失败，请重新发起登录。',
  SubMissing: '认证服务未返回用户标识，无法完成登录。',
};

export const AdminConsole: React.FC<AdminConsoleProps> = ({ showToast }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  // 密码登录入口默认视为开启：接口异常时保持既有行为，不误锁后台
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  // 两个入口都关闭 = 后台整体锁闭。默认按「可用」处理：接口异常时不应谎报锁闭，
  // 那会把一个可用的后台描述成不可用。
  const [anyLoginEnabled, setAnyLoginEnabled] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<'p' | 'd' | null>(null);

  // 数据列表与统计状态
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [links, setLinks] = useState<AdminLinkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '1' | '0'>('all');

  // 编辑模态弹窗与复制状态
  const [editingItem, setEditingItem] = useState<AdminLinkItem | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState<string | null>(null);

  const jsonHeaders = { 'Content-Type': 'application/json' };

  useEffect(() => {
    localStorage.removeItem('sk_admin_token');

    // SSO 回调失败时，服务端以 ?error=<稳定错误码> 重定向回本页
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    if (errorCode) {
      setAuthError(AUTH_ERROR_TEXT[errorCode] || `登录失败（错误码：${errorCode}）`);
      params.delete('error');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }

    const probe = async () => {
      try {
        // SSO 入口的显隐必须在**运行时**向后端求值。若按构建期环境变量判定，
        // 线上会因读不到 Secret 而永久隐藏入口，且不报任何错，极难排查。
        const [statsRes, providersRes] = await Promise.all([
          fetch('/api/admin/stats', { credentials: 'include' }),
          fetch('/api/auth/providers').catch(() => null),
        ]);
        setIsAuthenticated(statsRes.ok);

        if (providersRes && providersRes.ok) {
          const data = (await providersRes.json()) as {
            password?: { enabled?: boolean };
            dex?: { enabled?: boolean };
            session?: { mode?: 'p' | 'd' | null };
            anyEnabled?: boolean;
          };
          setPasswordEnabled(data.password?.enabled !== false);
          setSsoEnabled(Boolean(data.dex?.enabled));
          setAnyLoginEnabled(data.anyEnabled !== false);
          setSessionMode(data.session?.mode ?? null);
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    };
    void probe();
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
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || '密码错误');
      }

      setIsAuthenticated(true);
      setSessionMode('p');
      setAuthError(null);
      setPassword('');
      showToast('管理员登录成功', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '登录失败', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  // 退出登录
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    // dex 没有 end_session_endpoint，登出只能清本站会话；
    // IdP 侧登录态是否保留由 dex 决定，这里不做假定。
    const wasSso = sessionMode === 'd';
    setIsAuthenticated(false);
    setSessionMode(null);
    showToast(
      wasSso ? '已退出本后台（DEX 侧登录状态可能仍然保留）' : '已退出管理后台',
      'info'
    );
  };

  // 加载统计与列表
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, linksRes] = await Promise.all([
        fetch('/api/admin/stats', { credentials: 'include' }),
        fetch(
          `/api/admin/links?page=${page}&limit=15&keyword=${encodeURIComponent(debouncedKeyword)}&status=${statusFilter}`,
          { credentials: 'include' }
        ),
      ]);

      if (statsRes.status === 401 || linksRes.status === 401) {
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
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '获取数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedKeyword, statusFilter, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword((prev) => {
        if (prev !== keyword) setPage(1);
        return keyword;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  useEffect(() => {
    if (!deleteConfirmSlug && !editingItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeleteConfirmSlug(null);
        setEditingItem(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteConfirmSlug, editingItem]);

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
        credentials: 'include',
        headers: jsonHeaders,
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
        credentials: 'include',
      });

      if (!res.ok) throw new Error('删除失败');
      showToast('短链接已删除', 'success');
      setDeleteConfirmSlug(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 导出 CSV（拉取当前筛选下的全量，不只当前页）
  const handleExportCsv = async () => {
    try {
      const res = await fetch(
        `/api/admin/links?page=1&limit=5000&keyword=${encodeURIComponent(debouncedKeyword)}&status=${statusFilter}`,
        { credentials: 'include' }
      );
      if (res.status === 401) {
        setIsAuthenticated(false);
        throw new Error('会话已过期，请重新登录');
      }
      const data = (await res.json()) as { list?: AdminLinkItem[] };
      const rowsSrc = data.list || [];
      if (rowsSrc.length === 0) {
        showToast('暂无数据可导出', 'info');
        return;
      }

      const headers = ['Slug', '目标网址', '备注标题', '点击量', '状态', '创建时间'];
      const rows = rowsSrc.map((l) => [
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
      URL.revokeObjectURL(url);
      showToast(`已导出 ${rowsSrc.length} 条 CSV 报表`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '导出失败', 'error');
    }
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  /*
   * 1a. 两个登录入口都已关闭 —— 后台整体锁闭。
   * 必须与「登录表单」分开渲染：摆一个必然收到 403 的密码框，只会让人以为
   * 是密码错了，而真正原因是服务端策略根本不允许登录。
   */
  if (!isAuthenticated && !anyLoginEnabled) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 animate-fade-in">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Lock className="h-6 w-6 stroke-[2]" />
          </div>
          <h2 className="text-lg font-semibold tracking-title text-slate-900 dark:text-white">
            管理后台当前不可登录
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            管理员密码登录（<code className="font-mono">PASSWORD_ENABLED=false</code>）与 DEX
            单点登录均已关闭。请在服务端至少开启一种登录方式后重试。
          </p>
        </div>
      </div>
    );
  }

  // 1b. 登录表单
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col justify-center px-4 animate-fade-in">
        <div className="rounded-xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900 transition-all">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/70 dark:text-brand-400">
              <Lock className="h-6 w-6 stroke-[2]" />
            </div>
            <h2 className="text-lg font-semibold tracking-title text-slate-900 dark:text-white">
              管理控制台登录
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {ssoEnabled && passwordEnabled
                ? '使用 DEX 单点登录或管理员密码'
                : ssoEnabled
                  ? '请使用管理员身份登录'
                  : '请输入管理员密码'}
            </p>
          </div>

          {authError && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {ssoEnabled && (
            <div className={passwordEnabled ? 'mb-5' : ''}>
              <a
                href="/api/auth/oidc/start?return_to=%2Fadmin"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-500 active:scale-[0.99]"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>使用 DEX 登录</span>
              </a>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                DEX 登录仅供授权管理员使用。DEX 不支持单点登出，共用设备上请勿保持登录状态。
              </p>
              {/* 分隔线只在密码入口也存在时才有意义 */}
              {passwordEnabled && (
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-2 text-[11px] text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                      或使用管理密码
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {passwordEnabled && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  管理密码 (Secret)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full rounded-md border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-brand-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-600 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-500 active:scale-[0.99] disabled:opacity-60"
              >
                {authLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span>验证并进入控制台</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // 2. 控制台主体
  return (
    /*
     * 视口锁定三段式：
     *   Header 区（标题栏 / 指标卡 / 筛选栏）与列表卡片内的分页底栏都是 shrink-0
     *   —— 它们在 flex 主轴上不被压缩，位置天然固定；
     *   中间列表区用 min-h-0 flex-1 + overflow-auto 自己滚。
     * 每一层都必须带 min-h-0：flex 子项默认 min-height:auto，漏一层就会撑成内容
     * 高度，结果是整页滚不动、分页栏被顶出视口。
     */
    <div className="flex min-h-0 flex-1 flex-col gap-4 animate-fade-in">
      {/* ═══ 固定 Header 区（以下三块 shrink-0，不参与滚动）═══ */}

      {/* Console Top Bar */}
      <div className="flex shrink-0 flex-col justify-between gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-title text-slate-900 dark:text-white">
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
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>导出 CSV</span>
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>退出</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (4 Columns) —— 图标取中性灰：品牌靛紫按规范只留给 CTA 与链接，不做装饰 */}
      <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-lg border border-slate-200/80 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">总短链接数</span>
            <Link2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-title text-slate-900 sm:text-2xl dark:text-white">
            {stats?.total_links ?? '--'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">累计跳转次数</span>
            <TrendingUp className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-title text-slate-900 sm:text-2xl dark:text-white">
            {stats?.total_clicks ?? '--'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">当前活跃短链</span>
            <Activity className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-title text-slate-900 sm:text-2xl dark:text-white">
            {stats?.active_links ?? '--'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">今日新增</span>
            <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-title text-slate-900 sm:text-2xl dark:text-white">
            {stats?.today_links ?? '--'}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索短链 Slug、目标网址或备注..."
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-brand-600 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition-colors focus:border-brand-600 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="all">全部状态</option>
            <option value="1">仅看正常启用</option>
            <option value="0">仅看已停用</option>
          </select>
        </div>
      </div>

      {/* ═══ 滚动列表卡片：列表滚动，分页底栏固定在卡片底部 ═══ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Desktop Data Table —— min-h-0 flex-1 overflow-auto 这一段就是滚动区 */}
        <div className="hidden min-h-0 flex-1 overflow-auto md:block">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
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
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-500 mb-2" />
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
                    <td className="py-3.5 pl-4 pr-2 font-mono font-medium text-brand-600 dark:text-brand-400">
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
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          title="复制完整短链"
                          aria-label={`复制短链 ${item.slug}`}
                        >
                          {copiedSlug === item.slug ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>

                        <a
                          href={`/${item.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          title="访问测试"
                          aria-label={`访问测试 ${item.slug}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>

                        <button
                          onClick={() => setEditingItem(item)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          title="编辑短链"
                          aria-label={`编辑短链 ${item.slug}`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(item)}
                          className={`rounded-md p-1.5 ${
                            item.is_active === 1
                              ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                          }`}
                          title={item.is_active === 1 ? '停用链接' : '重新启用'}
                          aria-label={item.is_active === 1 ? `停用 ${item.slug}` : `启用 ${item.slug}`}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => setDeleteConfirmSlug(item.slug)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                          title="删除短链"
                          aria-label={`删除短链 ${item.slug}`}
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

        {/* Mobile Stream Cards (< 768px) —— 与桌面表格同层互斥，各自独立滚动 */}
        <div className="block min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto md:hidden dark:divide-slate-800">
          {loading && links.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-500 mb-1.5" />
              <span className="text-xs">加载中...</span>
            </div>
          ) : links.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">暂无短链接记录</div>
          ) : (
            links.map((item) => (
              <div key={item.slug} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">
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
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Copy className="h-3 w-3" />
                    <span>复制</span>
                  </button>
                  <button
                    onClick={() => setEditingItem(item)}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>编辑</span>
                  </button>
                  <button
                    onClick={() => handleToggleStatus(item)}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Power className="h-3 w-3" />
                    <span>{item.is_active === 1 ? '停用' : '启用'}</span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirmSlug(item.slug)}
                    className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-1 text-xs text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>删除</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Footer —— shrink-0：固定在列表卡片底部，不随列表滚动 */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200/80 bg-slate-50/50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
          <span>
            共 <strong className="text-slate-900 dark:text-white">{totalCount}</strong> 条记录（第 {page}/{totalPages} 页）
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>上一页</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
          role="presentation"
          onClick={() => setDeleteConfirmSlug(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-link-title"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/60">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 id="delete-link-title" className="text-sm font-semibold text-slate-900 dark:text-white">确认删除短链接？</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              删除后短链 <code className="font-mono font-semibold text-brand-600 dark:text-brand-400">sk.gs/{deleteConfirmSlug}</code> 将立即失效无法跳转，该操作不可恢复。
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmSlug(null)}
                className="rounded-md border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmSlug)}
                className="rounded-md bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
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
