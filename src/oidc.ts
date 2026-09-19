/**
 * dex 单点登录（OIDC）客户端 —— 手写实现，不依赖 Auth.js 等框架。
 *
 * 为什么手写：本站运行在 Cloudflare Workers + Assets 上，认证栈是自建的
 * （HMAC 票据 Cookie），引入完整认证框架的收益不足以抵偿运行时风险。
 *
 * dex 侧硬约束（2026-09-19 实测 `https://auth.zkun.de/dex/.well-known/openid-configuration`）：
 *   1. `token_endpoint_auth_methods_supported` 不含 `none` → **必须机密客户端**，client_secret 不可省；
 *   2. **缺少 `end_session_endpoint`** → 无法实现单点登出，登出只清本站会话；
 *   3. `code_challenge_methods_supported` 含 `S256` → 使用 S256，不用 plain；
 *   4. `response_types_supported` 仅 `code` → 仅授权码流程；
 *   5. JWKS 有多把密钥（实测 4 把，存在轮换）→ 必须按 `kid` 动态选取，不得落静态文件。
 *
 * 白名单为 **fail-closed**：未配置任何白名单时拒绝全部 dex 登录，而不是放行。
 */

import {
  base64UrlToBytes,
  base64UrlToUtf8,
  hmacSignBase64Url,
  randomBase64Url,
  sha256Base64Url,
  timingSafeEqual,
  utf8ToBase64Url,
} from './crypto-utils';
import {
  DEX_SESSION_MAX_AGE,
  SESSION_COOKIE,
  createSessionToken,
  getCookie,
  sessionCookieHeader,
  verifySessionToken,
  type SessionMode,
} from './session';

/** OIDC 接入涉及的环境变量子集 */
export interface OidcEnv {
  /** 复用既有管理员密钥作为票据与 state Cookie 的签名密钥 */
  ADMIN_SECRET?: string;
  DEX_ISSUER?: string;
  DEX_CLIENT_ID?: string;
  DEX_CLIENT_SECRET?: string;
  /** 逗号分隔的 dex `sub` 白名单（不可变 id，首选） */
  DEX_ALLOWED_SUBS?: string;
  /** 逗号分隔的邮箱白名单（便捷项；仅在 dex 侧邮箱可信时使用） */
  DEX_ALLOWED_EMAILS?: string;
  /** 设为 'false' 可临时隐藏登录入口，不必删除凭据 */
  DEX_ENABLED?: string;
}

const DEFAULT_DEX_ISSUER = 'https://auth.zkun.de/dex';

/** 不申请 offline_access：本站不调用 dex 的下游 API，无需 refresh token */
const OIDC_SCOPE = 'openid profile email';

const CALLBACK_PATH = '/api/auth/oidc/callback';
const OIDC_STATE_COOKIE = 'sk_oidc_state';
/** state Cookie 短 TTL：授权往返通常几秒，10 分钟足够 */
const OIDC_STATE_MAX_AGE = 10 * 60;

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;

/** 允许的时钟偏移（秒），仅用于 exp / iat 判读 */
const CLOCK_SKEW_SEC = 60;

export type OidcErrorCode =
  | 'Configuration'
  | 'StateInvalid'
  | 'StateMismatch'
  | 'AccessDenied'
  | 'OAuthCallback'
  | 'TokenExchangeFailed'
  | 'InvalidIdToken'
  | 'SubMissing';

export class OidcError extends Error {
  code: OidcErrorCode;

  constructor(code: OidcErrorCode, message: string) {
    super(message);
    this.name = 'OidcError';
    this.code = code;
  }
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
}

interface OidcStatePayload {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  /** 过期时间（Unix 秒） */
  exp: number;
}

/**
 * JWKS 中每把密钥都带 `kid`，但 lib.dom 的 `JsonWebKey` 类型未声明该字段。
 * dex 侧密钥存在轮换（实测 4 把），必须按 `kid` 选取，所以这里显式扩展。
 */
interface JwkWithKid extends JsonWebKey {
  kid?: string;
}

export interface DexConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  adminSecret: string;
  credsReady: boolean;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// isolate 级缓存：discovery 与 JWKS 都走内存缓存，避免每次登录往返 IdP 元数据。
// 注意 JWKS 必须按 kid 动态选取，缓存到期即刷新；kid 未命中时强制刷新一次。
// ---------------------------------------------------------------------------

let discoveryCache: { key: string; value: Discovery; expiresAt: number } | null = null;
let jwksCache: { key: string; keys: Map<string, JwkWithKid>; expiresAt: number } | null = null;

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function parseList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readDexConfig(env: OidcEnv): DexConfig {
  const issuer = (env.DEX_ISSUER?.trim() || DEFAULT_DEX_ISSUER).replace(/\/+$/, '');
  const clientId = env.DEX_CLIENT_ID?.trim() || '';
  const clientSecret = env.DEX_CLIENT_SECRET?.trim() || '';
  const adminSecret = env.ADMIN_SECRET?.trim() || '';
  const credsReady = Boolean(clientId && clientSecret);
  const explicitlyDisabled = env.DEX_ENABLED?.trim().toLowerCase() === 'false';

  return {
    issuer,
    clientId,
    clientSecret,
    adminSecret,
    credsReady,
    enabled: credsReady && !explicitlyDisabled,
  };
}

/**
 * 管理员白名单判定。
 *
 * fail-closed：两个白名单都为空时拒绝登录。开放登录会把整个短链后台
 * （含全部短链的编辑与删除权）交给任意一个 dex 账号。
 *
 * subs 与 emails 是**或**关系，不是互斥关系 —— 填了 subs 不会让 emails 失效。
 */
export function evaluateDexAccess(
  env: OidcEnv,
  claims: Record<string, unknown>
): { allowed: boolean; reason?: string } {
  const allowedSubs = parseList(env.DEX_ALLOWED_SUBS);
  const allowedEmails = parseList(env.DEX_ALLOWED_EMAILS).map((item) => item.toLowerCase());

  if (allowedSubs.length === 0 && allowedEmails.length === 0) {
    return {
      allowed: false,
      reason: '未配置 dex 管理员白名单（DEX_ALLOWED_SUBS 或 DEX_ALLOWED_EMAILS 均为空）',
    };
  }

  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (sub && allowedSubs.includes(sub)) return { allowed: true };

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (email && allowedEmails.includes(email)) return { allowed: true };

  return { allowed: false, reason: '该 dex 账号不在管理员白名单内' };
}

// ---------------------------------------------------------------------------
// discovery 与 JWKS
// ---------------------------------------------------------------------------

async function fetchDiscovery(issuer: string, force = false): Promise<Discovery> {
  const now = Date.now();
  if (!force && discoveryCache && discoveryCache.key === issuer && discoveryCache.expiresAt > now) {
    return discoveryCache.value;
  }

  const url = `${issuer}/.well-known/openid-configuration`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new OidcError('Configuration', `discovery 拉取失败：HTTP ${res.status}`);
  }

  const doc = (await res.json()) as Partial<Discovery>;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new OidcError('Configuration', 'discovery 文档缺少必需端点');
  }

  const declaredIssuer = (doc.issuer || issuer).replace(/\/+$/, '');
  if (declaredIssuer !== issuer) {
    throw new OidcError(
      'Configuration',
      `discovery 声明的 issuer (${declaredIssuer}) 与配置 (${issuer}) 不一致`
    );
  }

  const value: Discovery = {
    issuer: declaredIssuer,
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    jwks_uri: doc.jwks_uri,
    userinfo_endpoint: doc.userinfo_endpoint,
    end_session_endpoint: doc.end_session_endpoint,
  };

  discoveryCache = { key: issuer, value, expiresAt: now + DISCOVERY_TTL_MS };
  return value;
}

async function fetchJwks(jwksUri: string, force = false): Promise<Map<string, JwkWithKid>> {
  const now = Date.now();
  if (!force && jwksCache && jwksCache.key === jwksUri && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }

  const res = await fetch(jwksUri, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new OidcError('InvalidIdToken', `JWKS 拉取失败：HTTP ${res.status}`);
  }

  const doc = (await res.json()) as { keys?: JwkWithKid[] };
  const keys = new Map<string, JwkWithKid>();
  for (const key of doc.keys || []) {
    if (key && typeof key.kid === 'string' && key.kid) keys.set(key.kid, key);
  }
  if (keys.size === 0) {
    throw new OidcError('InvalidIdToken', 'JWKS 中没有任何带 kid 的密钥');
  }

  jwksCache = { key: jwksUri, keys, expiresAt: now + JWKS_TTL_MS };
  return keys;
}

// ---------------------------------------------------------------------------
// id_token 校验
// ---------------------------------------------------------------------------

async function verifyIdToken(
  idToken: string,
  expected: { issuer: string; clientId: string; nonce: string; jwksUri: string }
): Promise<Record<string, unknown>> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OidcError('InvalidIdToken', 'id_token 不是三段式 JWT');

  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlToUtf8(headerB64)) as { alg?: string; kid?: string };
    claims = JSON.parse(base64UrlToUtf8(payloadB64)) as Record<string, unknown>;
  } catch {
    throw new OidcError('InvalidIdToken', 'id_token 头部或载荷无法解析');
  }

  if (header.alg !== 'RS256') {
    throw new OidcError('InvalidIdToken', `不支持的签名算法：${header.alg || '(缺失)'}`);
  }
  if (!header.kid) throw new OidcError('InvalidIdToken', 'id_token 头部缺少 kid');

  let keys = await fetchJwks(expected.jwksUri);
  let jwk = keys.get(header.kid);
  if (!jwk) {
    // 密钥可能刚轮换，强制刷新一次再判定
    keys = await fetchJwks(expected.jwksUri, true);
    jwk = keys.get(header.kid);
  }
  if (!jwk) throw new OidcError('InvalidIdToken', `JWKS 中找不到 kid=${header.kid} 对应的公钥`);

  // 只取 kty/n/e：多余的 use/alg/key_ops 字段交给 WebCrypto 校验时可能被拒
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureOk = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlToBytes(sigB64),
    signedData
  );
  if (!signatureOk) throw new OidcError('InvalidIdToken', 'id_token 签名校验失败');

  const now = Math.floor(Date.now() / 1000);

  if (claims.iss !== expected.issuer) {
    throw new OidcError('InvalidIdToken', `iss 不匹配：${String(claims.iss)}`);
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expected.clientId)) {
    throw new OidcError('InvalidIdToken', 'aud 不含本应用的 client_id');
  }

  if (typeof claims.exp !== 'number' || claims.exp < now - CLOCK_SKEW_SEC) {
    throw new OidcError('InvalidIdToken', 'id_token 已过期');
  }
  if (typeof claims.iat === 'number' && claims.iat > now + CLOCK_SKEW_SEC * 5) {
    throw new OidcError('InvalidIdToken', 'id_token 签发时间异常（时钟偏移过大）');
  }

  // nonce 必须比对：否则 id_token 未与本次浏览器会话绑定，存在重放空间
  if (!expected.nonce || claims.nonce !== expected.nonce) {
    throw new OidcError('InvalidIdToken', 'nonce 不匹配');
  }

  return claims;
}

// ---------------------------------------------------------------------------
// state / nonce / PKCE verifier 的无状态签名 Cookie
// ---------------------------------------------------------------------------

async function sealState(secret: string, payload: OidcStatePayload): Promise<string> {
  const body = utf8ToBase64Url(JSON.stringify(payload));
  const sig = await hmacSignBase64Url(secret, body);
  return `${body}.${sig}`;
}

async function openState(secret: string, token: string | null): Promise<OidcStatePayload | null> {
  if (!token) return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = await hmacSignBase64Url(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlToUtf8(body)) as OidcStatePayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.state || !payload.nonce || !payload.verifier) return null;
    return payload;
  } catch {
    return null;
  }
}

function stateCookieHeader(value: string, isHttps: boolean): string {
  return `${OIDC_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${OIDC_STATE_MAX_AGE}; SameSite=Lax; HttpOnly;${isHttps ? ' Secure;' : ''}`;
}

function clearStateCookieHeader(isHttps: boolean): string {
  return `${OIDC_STATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly;${isHttps ? ' Secure;' : ''}`;
}

/** 只允许站内相对路径，阻断开放重定向（`//evil.com`、`/\evil.com` 均被拒） */
function sanitizeReturnTo(raw: string | null): string {
  const fallback = '/admin';
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(value)) return fallback;
  return value.slice(0, 256);
}

/** 授权/回调过程中统一的失败落点：回到管理页并带上稳定错误码 */
function redirectWithError(origin: string, code: string, detail?: string): Response {
  if (detail) console.warn(`[dex-sso] ${code}: ${detail}`);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/admin?error=${encodeURIComponent(code)}`,
      'Cache-Control': 'no-store',
    },
  });
}

// ---------------------------------------------------------------------------
// 路由处理器
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/providers —— 供前端在**运行时**判定是否显示 SSO 入口，
 * 并回传当前会话的登录方式（用于登出提示的措辞）。
 *
 * 前端绝不能把"是否启用 SSO"编译进产物：构建期读不到运行时 Secret，
 * 那个 false 会被烤进静态文件，导致线上入口永久消失且不报错。
 */
export async function handleProviders(request: Request, env: OidcEnv): Promise<Response> {
  const config = readDexConfig(env);
  const verdict = config.adminSecret
    ? await verifySessionToken(config.adminSecret, getCookie(request, SESSION_COOKIE))
    : null;

  const payload: {
    password: { enabled: boolean };
    dex: { enabled: boolean; name: string };
    session: { authenticated: boolean; mode: SessionMode | null };
  } = {
    password: { enabled: Boolean(config.adminSecret) },
    dex: { enabled: config.enabled, name: 'DEX SSO' },
    session: {
      authenticated: Boolean(verdict?.valid),
      mode: verdict?.valid ? verdict.mode : null,
    },
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** GET /api/auth/oidc/start —— 生成 state/nonce/PKCE 并跳向 dex */
export async function handleOidcStart(request: Request, env: OidcEnv): Promise<Response> {
  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';
  const origin = url.origin;

  const config = readDexConfig(env);
  if (!config.enabled) return redirectWithError(origin, 'Configuration', 'dex 未启用或凭据不完整');
  if (!config.adminSecret) return redirectWithError(origin, 'Configuration', '未配置 ADMIN_SECRET');

  let discovery: Discovery;
  try {
    discovery = await fetchDiscovery(config.issuer);
  } catch (err) {
    return redirectWithError(origin, 'Configuration', err instanceof Error ? err.message : 'discovery 失败');
  }

  const state = randomBase64Url(24);
  const nonce = randomBase64Url(24);
  const verifier = randomBase64Url(32);
  const challenge = await sha256Base64Url(verifier);

  // redirect_uri 基于**实际请求的 origin**，使生产域与预览域都能正确回调
  // （前提：两端都已在 dex 侧精确登记）
  const redirectUri = `${origin}${CALLBACK_PATH}`;

  const authorizeUrl = new URL(discovery.authorization_endpoint);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', OIDC_SCOPE);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const sealed = await sealState(config.adminSecret, {
    state,
    nonce,
    verifier,
    returnTo: sanitizeReturnTo(url.searchParams.get('return_to')),
    exp: Math.floor(Date.now() / 1000) + OIDC_STATE_MAX_AGE,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': stateCookieHeader(sealed, isHttps),
      'Cache-Control': 'no-store',
    },
  });
}

/** GET /api/auth/oidc/callback —— 校验 state、换 token、验签、判白名单、签发本站会话 */
export async function handleOidcCallback(request: Request, env: OidcEnv): Promise<Response> {
  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';
  const origin = url.origin;

  const config = readDexConfig(env);
  // state Cookie 是一次性的：成功与失败两条路径都必须清除，
  // 否则残留会让下一次登录的 state 校验莫名失败。
  const fail = (code: OidcErrorCode, detail?: string): Response => {
    if (detail) console.warn(`[dex-sso] ${code}: ${detail}`);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/admin?error=${encodeURIComponent(code)}`,
        'Set-Cookie': clearStateCookieHeader(isHttps),
        'Cache-Control': 'no-store',
      },
    });
  };

  if (!config.enabled) return fail('Configuration', 'dex 未启用或凭据不完整');
  if (!config.adminSecret) return fail('Configuration', '未配置 ADMIN_SECRET');

  const payload = await openState(config.adminSecret, getCookie(request, OIDC_STATE_COOKIE));
  if (!payload) return fail('StateInvalid', 'state Cookie 缺失、被篡改或已过期');

  const returnedState = url.searchParams.get('state') || '';
  if (!timingSafeEqual(returnedState, payload.state)) {
    return fail('StateMismatch', 'state 与 Cookie 中的值不一致');
  }

  const providerError = url.searchParams.get('error');
  if (providerError) {
    return fail('AccessDenied', `${providerError}: ${url.searchParams.get('error_description') || ''}`);
  }

  const code = url.searchParams.get('code');
  if (!code) return fail('OAuthCallback', '回调缺少 code 参数');

  let discovery: Discovery;
  try {
    discovery = await fetchDiscovery(config.issuer);
  } catch (err) {
    return fail('Configuration', err instanceof Error ? err.message : 'discovery 失败');
  }

  const redirectUri = `${origin}${CALLBACK_PATH}`;

  // 令牌交换：机密客户端。dex 支持 client_secret_basic 与 client_secret_post，
  // 优先 basic（凭据不进请求体，降低被日志记录的面）。
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: payload.verifier,
  });
  const basicCredentials = btoa(
    `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`
  );

  let tokenJson: { id_token?: string };
  try {
    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basicCredentials}`,
      },
      body: form.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '');
      return fail('TokenExchangeFailed', `token 端点返回 HTTP ${tokenRes.status} ${text.slice(0, 200)}`);
    }
    tokenJson = (await tokenRes.json()) as { id_token?: string };
  } catch (err) {
    return fail('TokenExchangeFailed', err instanceof Error ? err.message : 'token 请求异常');
  }

  if (!tokenJson.id_token) return fail('InvalidIdToken', 'token 响应不含 id_token');

  let claims: Record<string, unknown>;
  try {
    claims = await verifyIdToken(tokenJson.id_token, {
      issuer: discovery.issuer,
      clientId: config.clientId,
      nonce: payload.nonce,
      jwksUri: discovery.jwks_uri,
    });
  } catch (err) {
    const code = err instanceof OidcError ? err.code : 'InvalidIdToken';
    return fail(code, err instanceof Error ? err.message : 'id_token 校验失败');
  }

  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  // sub 缺失必须失败，不得静默降级为 email / username —— 那会让身份退化成非唯一值
  if (!sub) return fail('SubMissing', 'id_token 不含 sub');

  const access = evaluateDexAccess(env, claims);
  if (!access.allowed) {
    // 记录 sub 与 email，便于首次配置白名单时从 wrangler tail 取回自己的标识
    console.warn(
      `[dex-sso] 拒绝登录 sub=${sub} email=${String(claims.email || '')} 原因=${access.reason || '未授权'}`
    );
    return fail('AccessDenied', access.reason);
  }

  const token = await createSessionToken(config.adminSecret, 'd', DEX_SESSION_MAX_AGE);

  const headers = new Headers({
    Location: `${origin}${payload.returnTo}`,
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', clearStateCookieHeader(isHttps));
  headers.append('Set-Cookie', sessionCookieHeader(token, isHttps, DEX_SESSION_MAX_AGE));

  return new Response(null, { status: 302, headers });
}
