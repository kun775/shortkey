# sk.gs · Short key, then go swift.

> **sk.gs** 是一个基于 **Cloudflare Pages + Functions + D1 (SQLite at Edge)** 架构的全栈短链接 Web 应用程序。极速响应、安全防冲突、支持随机短 ID、自定义 Slug 与功能完善的轻量管理后台。

---

## 🌟 特性一览

- ⚡ **边缘极速跳转**：利用 Cloudflare 边缘计算与 D1 数据库，实现全球 <10ms 级别的 302 临时重定向。
- 🎯 **智能 Slug 机制**：
  - **默认随机**：采用 Base62 算法生成 4-6 位紧凑短 ID，支持主键碰撞自动重试。
  - **自定义指定**：支持 2-30 位自定义短链后缀，前端实时防抖检测是否可用与保留字拦截。
- 📊 **管理后台 (Admin Console)**：
  - 基于 `ADMIN_SECRET` 环境变量的安全单密码鉴权。
  - 核心指标看板：总短链数、累计跳转次数、活跃短链、今日新增。
  - 完整 CRUD 操作：短链搜索筛选、修改目标 URL、备注标题、一键停用/重新启用、删除短链、导出 CSV。
- 📱 **移动优先 (Mobile-First)**：适配 320px 手机到 4K 桌面端，支持二维码生成与 PNG 下载、一键复制带震动反馈。
- 🌗 **无缝主题切换**：支持深色模式（Dark Mode）与浅色模式，符合 WCAG 2.2 AA 无障碍标准。
- 🚀 **GitHub CI/CD 自动部署**：Push 代码即触发 Cloudflare Pages 自动构建与全球发布。

---

## 🛠️ 技术选型

- **前端界面**：React 18 + TypeScript + Vite + Tailwind CSS + Lucide React + qrcode.react
- **边缘后端**：Cloudflare Pages Functions（无服务器 API）
- **数据持久化**：Cloudflare D1（SQLite at Edge，支持事务唯一性、索引查询与原子计数）
- **部署平台**：Cloudflare Pages（集成 Git 自动化流水线）

---

## 🚀 本地开发与启动

```bash
# 1. 克隆代码与安装依赖
git clone https://github.com/kun775/shortkey.git
cd shortkey
npm install

# 2. 启动前端本地开发服务器
npm run dev
```

---

## ☁️ Cloudflare 部署步骤

### 1. 创建并初始化 Cloudflare D1 数据库
```bash
# 创建 D1 数据库
npx wrangler d1 create shortkey-db

# 导入表结构至远程 D1 数据库
npx wrangler d1 execute shortkey-db --remote --file=./schema.sql
```

### 2. 在 Cloudflare Pages 中关联 GitHub 仓库
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages** -> **Create Application** -> **Pages** -> **Connect to Git**。
2. 选择当前 GitHub 仓库 `kun775/shortkey`。
3. 构建配置填入：
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. 点击 **Save and Deploy** 完成初次部署。

### 3. 绑定 D1 数据库与管理员密钥
在 Cloudflare Pages 项目的 **Settings** 中配置：
1. **Functions -> D1 Database Bindings**：
   - Variable name: `DB`
   - D1 Database: 选择刚才创建的 `shortkey-db`
2. **Environment variables**：
   - 变量名：`ADMIN_SECRET`
   - 变量值：`设置你的强密码（如 sk_admin_987x!）`

### 4. 绑定自定义域名 `sk.gs`
在 Pages 项目的 **Custom domains** 选项卡中，添加自定义域名 `sk.gs` 即可。
后续只要在本地执行 `git push`，Cloudflare 将在 15~30 秒内自动完成边缘全量发布！

---

## 📄 开源许可
MIT License © [kun775](https://github.com/kun775)
