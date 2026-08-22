import { Env } from '../../../types';

// PUT: 更新链接属性（URL、标题备注、启停状态）
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const slug = params.slug as string;

  if (!slug) {
    return new Response(JSON.stringify({ success: false, error: '缺少 slug 参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json<{
      url?: string;
      title?: string;
      is_active?: number;
    }>();

    const existing = await env.DB.prepare('SELECT slug FROM links WHERE slug = ?').bind(slug).first();
    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: '短链接不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.url && !/^https?:\/\//i.test(body.url)) {
      return new Response(JSON.stringify({ success: false, error: '目标网址格式不正确' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await env.DB.prepare(`
      UPDATE links 
      SET url = COALESCE(?, url),
          title = COALESCE(?, title),
          is_active = COALESCE(?, is_active)
      WHERE slug = ?
    `)
      .bind(
        body.url !== undefined ? body.url.trim() : null,
        body.title !== undefined ? body.title.trim() : null,
        body.is_active !== undefined ? body.is_active : null,
        slug
      )
      .run();

    return new Response(JSON.stringify({ success: true, message: '更新成功' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// DELETE: 删除短链
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const slug = params.slug as string;

  if (!slug) {
    return new Response(JSON.stringify({ success: false, error: '缺少 slug 参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await env.DB.prepare('DELETE FROM links WHERE slug = ?').bind(slug).run();
    return new Response(JSON.stringify({ success: true, message: '短链接已删除' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
