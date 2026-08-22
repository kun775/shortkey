import { Env } from '../types';

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'logout', 'dashboard', 'stats', 'static', 'assets',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html', 'terms', 'privacy',
  'help', 'about', 'null', 'undefined'
]);

// Base62 字符集
const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateRandomSlug(length = 4): string {
  let result = '';
  const charsLength = BASE62_CHARS.length;
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charsLength);
    result += BASE62_CHARS.charAt(randomIndex);
  }
  return result;
}

function isValidUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const body = await request.json<{
      url?: string;
      custom_slug?: string;
      title?: string;
    }>();

    const rawUrl = body.url?.trim();
    const customSlug = body.custom_slug?.trim();
    const title = body.title?.trim() || '';

    // 1. URL 校验
    if (!rawUrl) {
      return new Response(JSON.stringify({ success: false, error: '请输入有效的目标网址' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!isValidUrl(rawUrl)) {
      return new Response(JSON.stringify({ success: false, error: '网址格式不正确，必须以 http:// 或 https:// 开头' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const host = request.headers.get('host') || 'sk.gs';
    try {
      const parsed = new URL(rawUrl);
      const targetHost = parsed.hostname.toLowerCase();
      const serverHost = host.toLowerCase().split(':')[0];
      if (targetHost === serverHost || targetHost === 'sk.gs' || targetHost === 'www.sk.gs') {
        return new Response(JSON.stringify({ success: false, error: '禁止将目标网址指向 sk.gs 自身，防止死循环重定向' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      return new Response(JSON.stringify({ success: false, error: '目标网址格式无效' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientIp = request.headers.get('cf-connecting-ip') || '';
    let finalSlug = '';

    // 2. 自定义 Slug 处理
    if (customSlug) {
      if (!/^[a-zA-Z0-9_-]{2,30}$/.test(customSlug)) {
        return new Response(JSON.stringify({ success: false, error: '自定义短链仅支持 2-30 位的字母、数字、下划线或连字符' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (RESERVED_SLUGS.has(customSlug.toLowerCase())) {
        return new Response(JSON.stringify({ success: false, error: '该短链名称为系统保留字，请换一个名称' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 检查冲突
      const existing = await env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(customSlug).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: '该短链后缀已被占用，请尝试其他名称' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      finalSlug = customSlug;
    } else {
      // 3. 随机 Slug 生成（带碰撞自动重试与自适应扩容）
      let attempts = 0;
      let slugLength = 4;
      while (attempts < 5) {
        const candidate = generateRandomSlug(slugLength);
        if (RESERVED_SLUGS.has(candidate.toLowerCase())) {
          attempts++;
          continue;
        }

        const existing = await env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(candidate).first();
        if (!existing) {
          finalSlug = candidate;
          break;
        }
        attempts++;
        if (attempts >= 3) {
          slugLength = 5; // 发生碰撞时增加长度
        }
      }

      if (!finalSlug) {
        finalSlug = generateRandomSlug(6);
      }
    }

    // 4. 写入 D1
    await env.DB.prepare(
      'INSERT INTO links (slug, url, title, clicks, is_active, created_at, created_ip) VALUES (?, ?, ?, 0, 1, CURRENT_TIMESTAMP, ?)'
    )
      .bind(finalSlug, rawUrl, title, clientIp)
      .run();

    const host = request.headers.get('host') || 'sk.gs';
    const protocol = request.url.startsWith('https') ? 'https' : 'http';
    const shortUrl = `${protocol}://${host}/${finalSlug}`;

    return new Response(
      JSON.stringify({
        success: true,
        slug: finalSlug,
        short_url: shortUrl,
        url: rawUrl,
        title,
        created_at: new Date().toISOString(),
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Create short link error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
