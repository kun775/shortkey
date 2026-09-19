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
- 首页底部展示全局统计（总短链 / 总点击），公开接口 `GET /api/stats` 仅返回聚合数字，边缘缓存 60 秒
- 管理员会话为 HttpOnly Cookie（HMAC 票据），**不会把密码下发给前端**
- 管理后台支持 **DEX（OIDC）单点登录**，与原有管理密码并存；走授权码 + PKCE `S256`，并对 id_token 做 RS256 验签

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

### 3. DEX 单点登录（可选）

管理后台可以额外接一个 dex（OIDC）登录入口，与上面的管理密码并存。**不配置本节任何变量时，SSO 入口自动消失**，不影响既有登录方式。

#### 3.1 dex 侧注册 static client

在 dex 服务的 `config.yaml` 的 `staticClients` 中新增一项：

```yaml
staticClients:
  - id: shortkey
    name: 'Shortkey'
    secret: '<生成的密钥或 bcrypt hash>'
    redirectURIs:
      - 'https://sk.gs/api/auth/oidc/callback'
```

- `redirectURIs` **必须精确匹配**（协议、域名、路径、大小写），dex 不支持通配符。
- 若还要通过 `*.workers.dev` 预览域名登录，需把该域名的回调地址一并登记。
- 建议确认 `skipApprovalScreen: true`，否则每次登录都会多一次授权同意页。

#### 3.2 配置 Worker 环境变量

| 变量 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `DEX_CLIENT_ID` | Text | 是 | 上面 `staticClients[].id` |
| `DEX_CLIENT_SECRET` | **Secret** | 是 | 上面 `staticClients[].secret`，**禁止写入 `wrangler.toml`** |
| `DEX_ISSUER` | Text | 否 | 默认 `https://auth.zkun.de/dex`（无尾斜杠） |
| `DEX_ALLOWED_SUBS` | Text | 是 | 允许登录的 dex `sub` 白名单，逗号分隔 |
| `DEX_ALLOWED_EMAILS` | Text | 否 | 邮箱白名单，逗号分隔；与 `DEX_ALLOWED_SUBS` 是**或**关系 |
| `DEX_ENABLED` | Text | 否 | 设为 `false` 可临时隐藏入口，而不必删除凭据 |

> **白名单是 fail-closed 的**：`DEX_ALLOWED_SUBS` 与 `DEX_ALLOWED_EMAILS` 都为空时，**任何** dex 账号都会被拒绝。这是刻意设计 —— 开放登录等于把整个短链后台（含全部短链的增删改）交给任意一个 dex 账号。
>
> 首次配置时如果还不知道自己的 `sub`，可以先只配凭据并尝试登录一次：被拒绝时 Worker 日志会打印 `[dex-sso] 拒绝登录 sub=... email=...`，从中取到标识再填入白名单（用 `npx wrangler tail` 查看）。

```bash
npx wrangler secret put DEX_CLIENT_SECRET
```

#### 3.3 端点一览

| 端点 | 用途 |
| --- | --- |
| `GET /api/auth/providers` | 前端运行时判定是否显示 SSO 入口，并回传当前会话的登录方式 |
| `GET /api/auth/oidc/start` | 生成 `state`/`nonce`/PKCE，跳向 dex |
| `GET /api/auth/oidc/callback` | 校验 `state`、用 `code` 换 token、验签 id_token、判白名单、签发本站会话 |

#### 3.4 已知限制

- **不支持单点登出。** dex 的 discovery 文档中不存在 `end_session_endpoint`（实测确认）。在本站登出只清除本站会话，dex 侧登录态仍由 dex 决定，登录页已就此给出提示文案。
- **DEX 会话有效期 12 小时**，短于密码会话的 30 天 —— 这是缺少单点登出时为数不多的缓解手段。

### 4. Git 连接与构建

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
6. `GET https://sk.gs/api/auth/providers` 返回 `dex.enabled` 与 `password.enabled` 均为 `true`
7. 点「使用 DEX 登录」跳转到 `https://auth.zkun.de/dex/auth?...`，授权后回到 `/admin` 且已登录
8. 不在白名单中的 dex 账号完成授权后，落回 `/admin?error=AccessDenied` 并显示友好提示（而非原始错误码）
9. 未配置任何 `DEX_*` 变量时，登录页不出现 DEX 按钮，管理密码登录不受影响

---

## License

MIT © [kun775](https://github.com/kun775)
