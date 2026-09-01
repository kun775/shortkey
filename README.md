# sk.gs · Short Key, Go Swift.

极速、轻量的边缘短链接服务。基于 **Cloudflare Workers + Assets + D1**。

线上地址：<https://sk.gs>  
管理后台：<https://sk.gs/admin>（无公开入口，直接访问）

---

## 特性

- 边缘 302 跳转，点击计数异步写入，不阻塞响应
- 默认 Base62 随机短码（4–6 位，冲突自动重试）；支持 2–30 位自定义 Slug
- 拦截指向 `sk.gs` 自身的环回地址，以及非 `http/https` 协议
- 公开创建接口按 IP 限流（每分钟 10 次 / 每天 100 条）
- 管理后台：指标、搜索、编辑、启停、删除、CSV 导出
- 管理员会话为 HttpOnly Cookie（HMAC 票据），**不会把密码下发给前端**

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 边缘入口 | `src/worker.ts`（Cloudflare Workers + Assets） |
| 数据 | Cloudflare D1（SQLite at edge） |
| 部署 | GitHub push → Cloudflare Workers Builds |

> 早期版本使用 Cloudflare Pages Functions（`functions/`），已整体迁移到 Workers + Assets 并删除该目录。若需查阅旧实现，从 Git 历史中找回：`git log --diff-filter=D -- functions`。

---

## 本地开发

```bash
git clone https://github.com/kun775/shortkey.git
cd shortkey
npm install
npm run dev
```

`npm run dev` 只启动前端。API / D1 需要 Cloudflare 环境，或使用 `npx wrangler dev`。

---

## Cloudflare 部署

### 1. D1

```bash
npx wrangler d1 create shortkey-db
npx wrangler d1 execute shortkey-db --remote --file=./schema.sql
```

把生成的 `database_id` 写入 `wrangler.toml` 的 `[[d1_databases]]`。

### 2. 管理员密钥（必须用 Secret，不要写进仓库）

```bash
npx wrangler secret put ADMIN_SECRET
```

或在 Cloudflare Dashboard → Workers → shortkey → Settings → Variables → **Encrypt** 添加 `ADMIN_SECRET`。

不要在 `wrangler.toml` 写 `[vars]` 明文密码，`wrangler deploy` 会覆盖控制台里的普通变量。

### 3. Git 连接与构建

- Build command：`npm run build`
- Deploy command：`npx wrangler deploy`
- Output：`dist`
- `wrangler.toml` 已声明 `main = "src/worker.ts"` 和 `[assets]`

绑定自定义域名 `sk.gs` 后，push `main` 即自动发布。

---

## 验证要点

1. `GET https://sk.gs/admin` 返回 200，地址栏仍是 `/admin`
2. 登录后 Application → Cookie 有 `sk_admin_session`（HttpOnly），localStorage 无密码
3. 未登录 `PUT /api/admin/link/xxx` 返回 401
4. 目标为 `javascript:` 或 `https://sk.gs/...` 时创建失败
5. 停用短链后立刻访问应 403，不被缓存继续 302

---

## License

MIT © [kun775](https://github.com/kun775)
