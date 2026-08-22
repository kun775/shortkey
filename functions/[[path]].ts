import { Env, LinkRecord } from './types';

// 保留的系统级静态与管理路由前缀
const RESERVED_PREFIXES = ['api', 'admin', 'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html'];

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const pathParts = (params.path as string[]) || [];
  const rawPath = pathParts.join('/');

  if (!rawPath || rawPath.trim() === '') {
    return context.next();
  }

  // 1. 过滤系统保留路径与包含扩展名的静态资源请求
  const firstSegment = pathParts[0]?.toLowerCase();
  if (RESERVED_PREFIXES.includes(firstSegment) || rawPath.includes('.')) {
    return context.next();
  }

  // 2. 查询 D1 数据库
  try {
    const slug = decodeURIComponent(rawPath).trim();
    const record = await env.DB.prepare('SELECT url, is_active FROM links WHERE slug = ?')
      .bind(slug)
      .first<Pick<LinkRecord, 'url' | 'is_active'>>();

    // 3. 不存在或已被管理员停用
    if (!record) {
      return context.next(); // 交给前端 SPA 路由或 404 兜底
    }

    if (record.is_active !== 1) {
      return new Response(
        `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>短链接已停用 · sk.gs</title>
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
            .box { padding: 2rem; background: #1e293b; border-radius: 12px; max-width: 400px; border: 1px solid #334155; }
            h1 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #f43f5e; }
            p { font-size: 0.875rem; color: #94a3b8; line-height: 1.5; }
            a { color: #818cf8; text-decoration: none; font-size: 0.875rem; margin-top: 1rem; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>链接已被停用</h1>
            <p>抱歉，该短链接已被管理员暂时停用或已失效。</p>
            <a href="/">返回 sk.gs 首页 &rarr;</a>
          </div>
        </body>
        </html>`,
        {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    // 4. 异步记录点击量与访问时间（不阻塞重定向响应）
    context.waitUntil(
      env.DB.prepare(
        'UPDATE links SET clicks = clicks + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE slug = ?'
      )
        .bind(slug)
        .run()
        .catch((err) => console.error('Failed to update link clicks:', err))
    );

    // 5. 极速 302 临时重定向
    return new Response(null, {
      status: 302,
      headers: {
        Location: record.url,
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error) {
    console.error('Edge redirect error:', error);
    return context.next();
  }
};
