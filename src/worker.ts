export interface Env {
  DB: D1Database;
  ADMIN_SECRET?: string;
  ASSETS?: Fetcher; // 静态资产绑定 (Cloudflare Workers + Assets)
}

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'logout', 'dashboard', 'stats', 'static', 'assets',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html', 'terms', 'privacy',
  'help', 'about', 'null', 'undefined'
]);

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateRandomSlug(length = 4): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS.charAt(Math.floor(Math.random() * BASE62_CHARS.length));
  }
  return result;
}

function getCookie(request: Request, name: string): string | null {
  const cookieString = request.headers.get('Cookie');
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function isSelfReferencing(targetUrl: string, host: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const targetHost = parsed.hostname.toLowerCase();
    const serverHost = host.toLowerCase().split(':')[0];
    return (
      targetHost === serverHost ||
      targetHost === 'sk.gs' ||
      targetHost === 'www.sk.gs'
    );
  } catch {
    return true;
  }
}

function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. API: 创建短链接 POST /api/shorten
    if (pathname === '/api/shorten' && method === 'POST') {
      try {
        const body = await request.json<{ url?: string; custom_slug?: string; title?: string }>();
        const rawUrl = body.url?.trim();
        const customSlug = body.custom_slug?.trim();
        const title = body.title?.trim() || '';

        if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
          return jsonResponse({ success: false, error: '网址格式不正确，必须以 http:// 或 https:// 开头' }, 400);
        }

        const host = request.headers.get('host') || 'sk.gs';
        if (isSelfReferencing(rawUrl, host)) {
          return jsonResponse({ success: false, error: '禁止将目标网址指向 sk.gs 自身，防止死循环重定向' }, 400);
        }

        const clientIp = request.headers.get('cf-connecting-ip') || '';
        let finalSlug = '';

        if (customSlug) {
          if (!/^[a-zA-Z0-9_-]{2,30}$/.test(customSlug)) {
            return jsonResponse({ success: false, error: '自定义短链仅支持 2-30 位字母、数字、下划线或连字符' }, 400);
          }
          if (RESERVED_SLUGS.has(customSlug.toLowerCase())) {
            return jsonResponse({ success: false, error: '该名称为系统保留字' }, 400);
          }
          const existing = await env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(customSlug).first();
          if (existing) {
            return jsonResponse({ success: false, error: '该短链已被占用' }, 409);
          }
          finalSlug = customSlug;
        } else {
          let attempts = 0;
          let len = 4;
          while (attempts < 5) {
            const candidate = generateRandomSlug(len);
            if (RESERVED_SLUGS.has(candidate.toLowerCase())) { attempts++; continue; }
            const existing = await env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(candidate).first();
            if (!existing) { finalSlug = candidate; break; }
            attempts++;
            if (attempts >= 3) len = 5;
          }
          if (!finalSlug) finalSlug = generateRandomSlug(6);
        }

        await env.DB.prepare(
          'INSERT INTO links (slug, url, title, clicks, is_active, created_at, created_ip) VALUES (?, ?, ?, 0, 1, CURRENT_TIMESTAMP, ?)'
        ).bind(finalSlug, rawUrl, title, clientIp).run();

        const protocol = request.url.startsWith('https') ? 'https' : 'http';

        return jsonResponse({
          success: true,
          slug: finalSlug,
          short_url: `${protocol}://${host}/${finalSlug}`,
          url: rawUrl,
          title,
          created_at: new Date().toISOString(),
        }, 201);
      } catch (err: any) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 2. API: 校验 Slug 可用性 GET /api/check
    if (pathname === '/api/check' && method === 'GET') {
      const slug = url.searchParams.get('slug')?.trim();
      if (!slug || !/^[a-zA-Z0-9_-]{2,30}$/.test(slug)) {
        return jsonResponse({ available: false, reason: '格式错误（需 2-30 位字母/数字/下划线）' });
      }
      if (RESERVED_SLUGS.has(slug.toLowerCase())) {
        return jsonResponse({ available: false, reason: '系统保留字不可用' });
      }
      const existing = await env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(slug).first();
      return jsonResponse({ available: !existing, reason: existing ? '已被占用' : '可以使用' });
    }

    // 3. API: 管理后台登录 POST /api/admin/login
    if (pathname === '/api/admin/login' && method === 'POST') {
      const body = await request.json<{ password?: string }>();
      const secret = env.ADMIN_SECRET?.trim();
      if (!secret) {
        return jsonResponse({ success: false, error: '未配置 ADMIN_SECRET 环境变量' }, 500);
      }
      if (body.password?.trim() !== secret) {
        return jsonResponse({ success: false, error: '管理员密码错误' }, 401);
      }
      const cookieHeader = `sk_admin_token=${encodeURIComponent(secret)}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly; ${
        request.url.startsWith('https') ? 'Secure;' : ''
      }`;
      return jsonResponse({ success: true, token: secret }, 200, { 'Set-Cookie': cookieHeader });
    }

    // 4. 管理后台受保护 API 路由 (/api/admin/*)
    if (pathname.startsWith('/api/admin/')) {
      const secret = env.ADMIN_SECRET?.trim();
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '').trim() || getCookie(request, 'sk_admin_token');

      if (!secret || token !== secret) {
        return jsonResponse({ error: '未授权访问' }, 401);
      }

      // GET /api/admin/stats
      if (pathname === '/api/admin/stats' && method === 'GET') {
        const [summary, today] = await Promise.all([
          env.DB.prepare(
            'SELECT COUNT(*) as total_links, SUM(clicks) as total_clicks, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_links FROM links'
          ).first<{ total_links: number; total_clicks: number | null; active_links: number }>(),
          env.DB.prepare("SELECT COUNT(*) as today_links FROM links WHERE date(created_at) = date('now')").first<{ today_links: number }>(),
        ]);
        return jsonResponse({
          total_links: summary?.total_links || 0,
          total_clicks: summary?.total_clicks || 0,
          active_links: summary?.active_links || 0,
          today_links: today?.today_links || 0,
        });
      }

      // GET /api/admin/links
      if (pathname === '/api/admin/links' && method === 'GET') {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '15')));
        const keyword = url.searchParams.get('keyword')?.trim() || '';
        const status = url.searchParams.get('status');
        const offset = (page - 1) * limit;

        let whereClauses: string[] = [];
        let params: any[] = [];
        if (keyword) {
          whereClauses.push('(slug LIKE ? OR url LIKE ? OR title LIKE ?)');
          params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        if (status === '1' || status === '0') {
          whereClauses.push('is_active = ?');
          params.push(parseInt(status));
        }
        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const [dataResult, countResult] = await Promise.all([
          env.DB.prepare(`SELECT * FROM links ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
          env.DB.prepare(`SELECT COUNT(*) as total FROM links ${whereSql}`).bind(...params).first<{ total: number }>(),
        ]);
        return jsonResponse({
          list: dataResult.results,
          total: countResult?.total || 0,
          page,
          limit,
          totalPages: Math.ceil((countResult?.total || 0) / limit),
        });
      }

      // PUT/DELETE /api/admin/link/:slug
      const linkMatch = pathname.match(/^\/api\/admin\/link\/([^/]+)$/);
      if (linkMatch) {
        const slug = decodeURIComponent(linkMatch[1]);
        if (method === 'PUT') {
          const body = await request.json<{ url?: string; title?: string; is_active?: number }>();
          if (body.url) {
            const host = request.headers.get('host') || 'sk.gs';
            if (isSelfReferencing(body.url, host)) {
              return jsonResponse({ success: false, error: '禁止将目标网址指向 sk.gs 自身，防止死循环重定向' }, 400);
            }
          }
          await env.DB.prepare(
            'UPDATE links SET url = COALESCE(?, url), title = COALESCE(?, title), is_active = COALESCE(?, is_active) WHERE slug = ?'
          ).bind(body.url ?? null, body.title ?? null, body.is_active ?? null, slug).run();
          return jsonResponse({ success: true, message: '更新成功' });
        }
        if (method === 'DELETE') {
          await env.DB.prepare('DELETE FROM links WHERE slug = ?').bind(slug).run();
          return jsonResponse({ success: true, message: '已删除' });
        }
      }
    }

    // 5. 短链接 302 重定向查询 (GET /:slug)
    const cleanSlug = pathname.replace(/^\//, '').split('/')[0];
    if (cleanSlug && !RESERVED_SLUGS.has(cleanSlug.toLowerCase()) && !cleanSlug.includes('.')) {
      const record = await env.DB.prepare('SELECT url, is_active FROM links WHERE slug = ?')
        .bind(cleanSlug)
        .first<{ url: string; is_active: number }>();

      if (record) {
        if (record.is_active === 1) {
          ctx.waitUntil(
            env.DB.prepare('UPDATE links SET clicks = clicks + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE slug = ?')
              .bind(cleanSlug)
              .run()
          );
          return new Response(null, {
            status: 302,
            headers: { Location: record.url, 'Cache-Control': 'public, max-age=60' },
          });
        } else {
          return new Response('该短链接已被管理员停用', { status: 403, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        }
      }
    }

    // 6. 静态前端资源托管与 SPA 单页应用路由分发
    if (env.ASSETS) {
      // 若请求前端页面路由（如 /admin, /admin/, / 或无物理扩展名的页面路径），直接分发 index.html 交由前端 React 渲染
      const isAssetFile = pathname.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(pathname);
      if (!isAssetFile && method === 'GET') {
        const indexUrl = new URL('/index.html', request.url);
        return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404 && method === 'GET') {
        const indexUrl = new URL('/index.html', request.url);
        return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      }

      return assetResponse;
    }

    return new Response('Not Found', { status: 404 });
  },
};
