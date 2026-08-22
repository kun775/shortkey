import { Env } from '../../types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const body = await request.json<{ password?: string }>();
    const inputPassword = body.password?.trim();
    const serverSecret = env.ADMIN_SECRET?.trim();

    if (!serverSecret) {
      return new Response(
        JSON.stringify({ success: false, error: '服务端未配置 ADMIN_SECRET 环境变量，请先在 Cloudflare 后台设置' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!inputPassword || inputPassword !== serverSecret) {
      return new Response(
        JSON.stringify({ success: false, error: '管理员密码错误' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 设置 Cookie（30天有效）
    const cookieHeader = `sk_admin_token=${encodeURIComponent(serverSecret)}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly; ${
      request.url.startsWith('https') ? 'Secure;' : ''
    }`;

    return new Response(
      JSON.stringify({ success: true, message: '登录成功', token: serverSecret }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader,
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || '请求处理失败' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
