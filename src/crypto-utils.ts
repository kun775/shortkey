/**
 * 共享密码学原语。
 *
 * 全部基于 WebCrypto，无 Node 原生依赖，可直接运行在 Cloudflare Workers 运行时。
 * 由 `session.ts`（会话票据）与 `oidc.ts`（OIDC 客户端）共用，避免同一套
 * 编码/签名逻辑在多处重复实现后发生漂移。
 */

const textEncoder = new TextEncoder();

/** 任意字节缓冲 → base64url（无填充） */
export function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url（容忍标准 base64 与缺失填充）→ 字节数组 */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 字节数组 → base64url（无填充） */
export function bytesToBase64Url(bytes: Uint8Array): string {  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** UTF-8 字符串 → base64url */
export function utf8ToBase64Url(text: string): string {
  return bytesToBase64Url(textEncoder.encode(text));
}

/** base64url → UTF-8 字符串 */
export function base64UrlToUtf8(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

/** 定长（字节数）随机 base64url 串，用于 state / nonce / PKCE verifier */
export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** 定时安全字符串比较，避免通过响应时间侧信道推测签名 */
export function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let out = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    out |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return out === 0;
}

/** SHA-256 → base64url。用于 PKCE code_challenge 与密码指纹比对 */
export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(text));
  return bufferToBase64Url(digest);
}

/** HMAC-SHA256 → base64url。用于会话票据与 state Cookie 的签名 */
export async function hmacSignBase64Url(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data));
  return bufferToBase64Url(sig);
}
