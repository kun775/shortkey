/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  ADMIN_SECRET?: string; // 管理后台授权秘钥 (未设置时默认不允许登录或提示配置)
}

export interface LinkRecord {
  slug: string;
  url: string;
  title: string;
  clicks: number;
  is_active: number;
  created_at: string;
  last_accessed_at: string | null;
  created_ip: string;
}
