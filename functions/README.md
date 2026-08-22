# Deprecated

本目录是早期 Cloudflare Pages Functions 实现，**生产环境已不再使用**。

当前生产入口：

- Worker：`src/worker.ts`
- 配置：`wrangler.toml`（`main = "src/worker.ts"`，`[assets]`）

不要在此目录新增接口。所有 API、短链 302、管理后台鉴权都以 `src/worker.ts` 为准。
