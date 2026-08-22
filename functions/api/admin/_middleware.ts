import { Env } from '../../types';

function getCookie(request: Request, name: string): string | null {
  const cookieString = request.headers.get('Cookie');
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 放行登录接口
  if (url.pathname.endsWith('/admin/login')) {
    return context.next();
  }

  const configuredSecret = env.ADMIN_SECRET?.trim();
  if (!configuredSecret) {
    return new Response(
      JSON.stringify({ error: '服务端未配置 ADMIN_SECRET 环境变量，管理后台已锁定' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 提取 Bearer Token 或 Cookie
  const authHeader = request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  const cookieToken = getCookie(request, 'sk_admin_token');

  const token = bearerToken || cookieToken;

  if (!token || token !== configuredSecret) {
    return new Response(
      JSON.stringify({ error: '未授权访问，管理员密码错误或已失效' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return context.next();
};
