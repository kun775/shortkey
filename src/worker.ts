export interface Env {
  DB: D1Database;
  ADMIN_SECRET?: string;
  ASSETS?: Fetcher;
}

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'logout', 'dashboard', 'stats', 'static', 'assets',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html', 'terms', 'privacy',
  'help', 'about', 'null', 'undefined'
]);

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_DAY = 100;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const SESSION_COOKIE = 'sk_admin_session';

function generateRandomSlug(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS.charAt(bytes[i] % BASE62_CHARS.length);
  }
  return result;
}

function getCookie(request: Request, name: string): string | null {
  const cookieString = request.headers.get('Cookie');
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let out = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    out |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return out === 0;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bufferToBase64Url(digest);
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return bufferToBase64Url(sig);
}

async function createSessionToken(secret: string): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
  const sig = await hmacSign(secret, exp);
  return `${exp}.${sig}`;
}

async function verifySessionToken(secret: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expNum = parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  if (!/^\d+$/.test(exp) || !/^[A-Za-z0-9_-]+$/.test(sig)) return false;
  const expected = await hmacSign(secret, exp);
  return timingSafeEqual(sig, expected);
}

function sessionCookieHeader(token: string, isHttps: boolean, maxAge = SESSION_MAX_AGE): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly;${isHttps ? ' Secure;' : ''}`;
}

function clearSessionCookie(isHttps: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly;${isHttps ? ' Secure;' : ''}`;
}

function sanitizeHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
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

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 内部静态资源回源，避免 SPA fallback 递归打 Worker
    if (request.headers.get('X-Internal-Assets') === '1') {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not Found', { status: 404 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const isHttps = request.url.startsWith('https');

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    // 1. API: 创建短链接 POST /api/shorten
    if (pathname === '/api/shorten' && method === 'POST') {
      try {
        const body = await request.json<{ url?: string; custom_slug?: string; title?: string }>();
        const rawUrl = body.url?.trim();
        const customSlug = body.custom_slug?.trim();
        const title = (body.title?.trim() || '').slice(0, 80);
        const host = request.headers.get('host') || 'sk.gs';
        const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

        const targetUrl = rawUrl ? sanitizeHttpUrl(rawUrl) : null;
        if (!targetUrl) {
          return jsonResponse({ success: false, error: '网址格式不正确，必须以 http:// 或 https:// 开头' }, 400);
        }
        if (isSelfReferencing(targetUrl, host)) {
          return jsonResponse({ success: false, error: '禁止将目标网址指向 sk.gs 自身，防止死循环重定向' }, 400);
        }

        const [minuteCount, dayCount] = await Promise.all([
          env.DB.prepare(
            "SELECT COUNT(*) as count FROM links WHERE created_ip = ? AND created_at > datetime('now', '-1 minute')"
          ).bind(clientIp).first<{ count: number }>(),
          env.DB.prepare(
            "SELECT COUNT(*) as count FROM links WHERE created_ip = ? AND created_at > datetime('now', '-1 day')"
          ).bind(clientIp).first<{ count: number }>(),
        ]);
        if ((minuteCount?.count || 0) >= RATE_LIMIT_PER_MINUTE) {
          return jsonResponse({ success: false, error: '请求过于频繁，请稍后再试' }, 429);
        }
        if ((dayCount?.count || 0) >= RATE_LIMIT_PER_DAY) {
          return jsonResponse({ success: false, error: '今日创建次数已达上限' }, 429);
        }

        let finalSlug = '';

        if (customSlug) {
          if (!/^[a-zA-Z0-9_-]{2,30}$/.test(customSlug)) {
            return jsonResponse({ success: false, error: '自定义短链仅支持 2-30 位字母、数字、下划线或连字符' }, 400);
          }
          if (RESERVED_SLUGS.has(customSlug.toLowerCase())) {
            return jsonResponse({ success: false, error: '该名称为系统保留字' }, 400);
          }
          try {
            await env.DB.prepare(
              'INSERT INTO links (slug, url, title, clicks, is_active, created_at, created_ip) VALUES (?, ?, ?, 0, 1, CURRENT_TIMESTAMP, ?)'
            ).bind(customSlug, targetUrl, title, clientIp).run();
            finalSlug = customSlug;
          } catch {
            return jsonResponse({ success: false, error: '该短链已被占用' }, 409);
          }
        } else {
          for (let attempt = 0; attempt < 8 && !finalSlug; attempt++) {
            const len = attempt < 3 ? 4 : attempt < 6 ? 5 : 6;
            const candidate = generateRandomSlug(len);
            if (RESERVED_SLUGS.has(candidate.toLowerCase())) continue;
            try {
              await env.DB.prepare(
                'INSERT INTO links (slug, url, title, clicks, is_active, created_at, created_ip) VALUES (?, ?, ?, 0, 1, CURRENT_TIMESTAMP, ?)'
              ).bind(candidate, targetUrl, title, clientIp).run();
              finalSlug = candidate;
            } catch {
              // PRIMARY KEY 冲突，换一个再试
            }
          }
          if (!finalSlug) {
            return jsonResponse({ success: false, error: '短链生成失败，请重试' }, 500);
          }
        }

        const protocol = isHttps ? 'https' : 'http';
        return jsonResponse({
          success: true,
          slug: finalSlug,
          short_url: `${protocol}://${host}/${finalSlug}`,
          url: targetUrl,
          title,
          created_at: new Date().toISOString(),
        }, 201);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '服务器内部错误';
        return jsonResponse({ success: false, error: message }, 500);
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

    // 2b. API: 公开站点统计 GET /api/stats（仅暴露总量，不含任何明细）
    if (pathname === '/api/stats' && method === 'GET') {
      const summary = await env.DB.prepare(
        'SELECT COUNT(*) as total_links, COALESCE(SUM(clicks), 0) as total_clicks FROM links'
      ).first<{ total_links: number; total_clicks: number }>();
      return jsonResponse(
        {
          success: true,
          total_links: summary?.total_links || 0,
          total_clicks: summary?.total_clicks || 0,
        },
        200,
        { 'Cache-Control': 'public, max-age=60' }
      );
    }

    // 3. API: 管理后台登录 POST /api/admin/login
    if (pathname === '/api/admin/login' && method === 'POST') {
      const body = await request.json<{ password?: string }>().catch(() => ({ password: '' }));
      const secret = env.ADMIN_SECRET?.trim();
      if (!secret) {
        return jsonResponse({ success: false, error: '未配置管理员密钥' }, 500);
      }
      const input = body.password?.trim() || '';
      const [inputHash, secretHash] = await Promise.all([sha256Hex(input), sha256Hex(secret)]);
      if (!input || !timingSafeEqual(inputHash, secretHash)) {
        return jsonResponse({ success: false, error: '管理员密码错误' }, 401);
      }
      const token = await createSessionToken(secret);
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': sessionCookieHeader(token, isHttps) });
    }

    // 3b. 退出登录（无需已登录）
    if (pathname === '/api/admin/logout' && method === 'POST') {
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': clearSessionCookie(isHttps) });
    }

    // 4. 管理后台受保护 API 路由 (/api/admin/*)
    if (pathname.startsWith('/api/admin/')) {
      const secret = env.ADMIN_SECRET?.trim();
      const sessionOk = secret ? await verifySessionToken(secret, getCookie(request, SESSION_COOKIE)) : false;
      if (!secret || !sessionOk) {
        return jsonResponse({ error: '未授权访问' }, 401);
      }

      // GET /api/admin/stats
      if (pathname === '/api/admin/stats' && method === 'GET') {
        const [summary, today] = await Promise.all([
          env.DB.prepare(
            'SELECT COUNT(*) as total_links, SUM(clicks) as total_clicks, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_links FROM links'
          ).first<{ total_links: number; total_clicks: number | null; active_links: number }>(),
          env.DB.prepare(
            "SELECT COUNT(*) as today_links FROM links WHERE date(created_at, '+8 hours') = date('now', '+8 hours')"
          ).first<{ today_links: number }>(),
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
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
        const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '15', 10) || 15));
        const keyword = url.searchParams.get('keyword')?.trim() || '';
        const status = url.searchParams.get('status');
        const offset = (page - 1) * limit;

        const whereClauses: string[] = [];
        const params: (string | number)[] = [];
        if (keyword) {
          whereClauses.push('(slug LIKE ? OR url LIKE ? OR title LIKE ?)');
          params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        if (status === '1' || status === '0') {
          whereClauses.push('is_active = ?');
          params.push(parseInt(status, 10));
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
          let nextUrl: string | null = null;
          if (body.url !== undefined) {
            nextUrl = sanitizeHttpUrl(body.url);
            if (!nextUrl) {
              return jsonResponse({ success: false, error: '目标网址格式不正确' }, 400);
            }
            const host = request.headers.get('host') || 'sk.gs';
            if (isSelfReferencing(nextUrl, host)) {
              return jsonResponse({ success: false, error: '禁止将目标网址指向 sk.gs 自身，防止死循环重定向' }, 400);
            }
          }
          const nextTitle = body.title !== undefined ? body.title.trim().slice(0, 80) : null;
          const nextActive = body.is_active === 0 || body.is_active === 1 ? body.is_active : null;
          await env.DB.prepare(
            'UPDATE links SET url = COALESCE(?, url), title = COALESCE(?, title), is_active = COALESCE(?, is_active) WHERE slug = ?'
          ).bind(nextUrl, nextTitle, nextActive, slug).run();
          return jsonResponse({ success: true, message: '更新成功' });
        }
        if (method === 'DELETE') {
          await env.DB.prepare('DELETE FROM links WHERE slug = ?').bind(slug).run();
          return jsonResponse({ success: true, message: '已删除' });
        }
      }

      return jsonResponse({ error: '接口不存在' }, 404);
    }

    // 5. 短链接 302 重定向查询 (GET /:slug)
    const cleanSlug = pathname.replace(/^\//, '').split('/')[0];
    if (cleanSlug && !RESERVED_SLUGS.has(cleanSlug.toLowerCase()) && !cleanSlug.includes('.')) {
      const record = await env.DB.prepare('SELECT url, is_active FROM links WHERE slug = ?')
        .bind(cleanSlug)
        .first<{ url: string; is_active: number }>();

      if (record) {
        const safeTarget = sanitizeHttpUrl(record.url);
        if (!safeTarget) {
          return new Response('该短链接目标地址无效', { status: 410, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        }
        if (record.is_active === 1) {
          ctx.waitUntil(
            env.DB.prepare('UPDATE links SET clicks = clicks + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE slug = ?')
              .bind(cleanSlug)
              .run()
          );
          return new Response(null, {
            status: 302,
            headers: { Location: safeTarget, 'Cache-Control': 'private, no-store' },
          });
        }
        return new Response('该短链接已被管理员停用', { status: 403, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
      }
    }

    // 6. 静态前端资源托管与 SPA 单页应用路由分发
    if (env.ASSETS) {
      const isAssetFile = pathname.startsWith('/assets/') || (pathname.includes('.') && !pathname.endsWith('.html'));
      if (isAssetFile) {
        return env.ASSETS.fetch(request);
      }

      if (method === 'GET' || method === 'HEAD') {
        const rootUrl = new URL('/', request.url);
        const htmlRes = await env.ASSETS.fetch(new Request(rootUrl.toString(), {
          method: 'GET',
          headers: { 'X-Internal-Assets': '1', Accept: 'text/html' },
        }));

        return new Response(method === 'HEAD' ? null : htmlRes.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
