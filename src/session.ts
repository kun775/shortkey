/**
 * 管理员会话：HMAC 票据 + HttpOnly Cookie。
 *
 * 票据格式（v2）：
 *     <exp>.<mode>.<hmac(secret, "<exp>.<mode>")>
 *
 * 其中 mode 标记登录方式：`p` = 密码会话，`d` = dex SSO 会话。
 * 票据内**不承载 sub 等身份明文**（Cookie 可被本地读取），权限判定留在服务端。
 *
 * v1 格式 `<exp>.<hmac(secret, exp)>` 仍然可用，按密码会话处理 —— 引入第二种
 * 登录方式时若直接改格式，会让升级瞬间所有已登录设备被踢出。
 */

import { hmacSignBase64Url, timingSafeEqual } from './crypto-utils';

export const SESSION_COOKIE = 'sk_admin_session';

/** 密码会话有效期：30 天（保持既有行为不变） */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * dex 会话有效期：12 小时。
 *
 * dex 没有 `end_session_endpoint`（实测，2026-09-19），登出只清本站会话、
 * IdP 侧登录态仍在。缩短 SSO 会话窗口是这一硬约束下为数不多的缓解手段。
 */
export const DEX_SESSION_MAX_AGE = 12 * 60 * 60;

export type SessionMode = 'p' | 'd';

export interface SessionVerdict {
  valid: boolean;
  mode: SessionMode | null;
}

export function getCookie(request: Request, name: string): string | null {
  const cookieString = request.headers.get('Cookie');
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/** 签发会话票据 */
export async function createSessionToken(
  secret: string,
  mode: SessionMode,
  maxAge: number
): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + maxAge);
  const sig = await hmacSignBase64Url(secret, `${exp}.${mode}`);
  return `${exp}.${mode}.${sig}`;
}

/** 校验会话票据，同时回传登录方式供上层决策 */
export async function verifySessionToken(secret: string, token: string | null): Promise<SessionVerdict> {
  if (!token) return { valid: false, mode: null };

  const parts = token.split('.');
  let exp: string;
  let mode: SessionMode;
  let signedPayload: string;

  if (parts.length === 3) {
    exp = parts[0];
    const rawMode = parts[1];
    if (rawMode !== 'p' && rawMode !== 'd') return { valid: false, mode: null };
    mode = rawMode;
    signedPayload = `${exp}.${mode}`;
  } else if (parts.length === 2) {
    // v1 兼容分支：视为密码会话。删掉它会让线上所有既有会话立即失效。
    exp = parts[0];
    mode = 'p';
    signedPayload = exp;
  } else {
    return { valid: false, mode: null };
  }

  const sig = parts[parts.length - 1];
  if (!/^\d+$/.test(exp) || !/^[A-Za-z0-9_-]+$/.test(sig)) return { valid: false, mode: null };

  const expNum = parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return { valid: false, mode: null };
  }

  const expected = await hmacSignBase64Url(secret, signedPayload);
  if (!timingSafeEqual(sig, expected)) return { valid: false, mode: null };

  return { valid: true, mode };
}

export function sessionCookieHeader(
  token: string,
  isHttps: boolean,
  maxAge = SESSION_MAX_AGE
): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly;${isHttps ? ' Secure;' : ''}`;
}

export function clearSessionCookie(isHttps: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly;${isHttps ? ' Secure;' : ''}`;
}
