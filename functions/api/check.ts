import { Env } from '../types';

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'logout', 'dashboard', 'stats', 'static', 'assets',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html', 'terms', 'privacy',
  'help', 'about', 'null', 'undefined'
]);

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug')?.trim();

  if (!slug) {
    return new Response(JSON.stringify({ available: false, reason: 'Slug 不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(slug)) {
    return new Response(JSON.stringify({ available: false, reason: '格式错误（需 2-30 位字母/数字/下划线）' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return new Response(JSON.stringify({ available: false, reason: '系统保留字不可用' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const existing = await env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(slug).first();
    if (existing) {
      return new Response(JSON.stringify({ available: false, reason: '已被占用' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ available: true, reason: '可以使用' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ available: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
