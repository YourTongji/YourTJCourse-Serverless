# CI/CD说明

这个仓库使用 GitHub Actions 在 `main` 分支更新后自动部署：

- `backend/` -> Cloudflare Workers (`wrangler deploy`)
- `frontend/` -> Cloudflare Pages (`wrangler pages deploy`)

## 1) 需要在 GitHub Repo Secrets 配置的变量

在 GitHub 仓库 -> Settings -> Secrets and variables -> Actions -> New repository secret，添加：

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID
- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token（用于 CI 部署）
- `VITE_API_URL`：前端调用后端的 API Base URL（例如 `https://jcourse-backend.<your-subdomain>.workers.dev` 或你的自定义域名）
- `VITE_TURNSTILE_SITE_KEY`：如果你仍然使用 Turnstile，可以填站点 Key（不需要的话也可以填任意占位字符串）
- `VITE_CAPTCHA_URL`：TongjiCaptcha 服务的 URL（例如 `https://captcha.xxx.com`）
- `VITE_WALINE_SERVER_URL`：Waline 服务端地址（例如 `https://waline.xxx.com`）
- `VITE_CREDIT_API_BASE`：YOURTJ 社区积分站后端 Core API Base（建议 `https://core.credit.yourtj.de`）

## 2) Cloudflare API Token 推荐权限

在 Cloudflare Dashboard -> My Profile -> API Tokens -> Create Token，建议创建 Custom Token：

- Account permissions：
  - Workers Scripts: Edit
  - Pages: Edit
  - D1: Edit（或至少 Read；看你是否在 CI 里做 D1 变更）
- Account resources：选择你的账号（All accounts 或指定账号）

## 3) 后端运行所需的 Workers Secrets（一次性设置）

后端 Worker `jcourse-backend` 依赖以下 secrets（本地或 Cloudflare Dashboard / wrangler 设置均可）：

- `CAPTCHA_SITEVERIFY_URL`
- `ADMIN_SECRET`
- `CREDIT_API_BASE`：积分站 Core API Base（建议 `https://core.credit.yourtj.de`；不要填 `https://credit.yourtj.de`）
- `CREDIT_JCOURSE_SECRET`：积分站为选课站分配的密钥（用于积分事件上报）

本地可用：

```bash
cd backend
wrangler secret put CAPTCHA_SITEVERIFY_URL
wrangler secret put ADMIN_SECRET
```

## 4) 工作流文件位置

- `.github/workflows/deploy-cloudflare.yml`

## 5) 一系统同步与 D1 导出规范

一系统/PK 数据同步统一使用 `.github/workflows/sync-onesystem-login.yml`。该流程会将生成的 SQL 同时写入：

- `jcourse-db`：生产查询库，会刷新评课站检索索引，可能包含 `course_search` FTS5 虚拟表。
- `jcourse-db-backup`：PK 数据镜像库，仅用于导出、ETL 和分析，不应创建 `course_search` FTS5 虚拟表。

旧的 `.github/workflows/sync-onesystem.yml` Cookie 同步流程已停用，因为它会绕过备份库双写链路。

请不要对生产库执行 `wrangler d1 export`。需要导出一系统/PK 数据时，只导出备份库：

```bash
cd backend
npx wrangler d1 export jcourse-db-backup --remote --output backup.sql
```

如果本地 Wrangler 登录了多个 Cloudflare 账号，请在本地环境变量或 Wrangler 本地配置中选择账号；不要把具体账号 ID 或备份库 database_id 写入公开仓库。`jcourse-db-backup` 不是完整生产业务灾备库，不保证包含评论、举报、AI 摘要等业务数据。

## 6) 自定义域名（xk.yourtj.de）为什么没更新？

GitHub Actions 里 `wrangler pages deploy` 打印出来的 `*.pages.dev` 只是 Pages 的默认访问地址。
要让生产域名 `https://xk.yourtj.de` 指向本仓库的 Pages 项目，需要在 Cloudflare 侧绑定域名：

1) Cloudflare Pages -> 项目 `jcourse-web` -> Custom domains：添加 `xk.yourtj.de`
2) Cloudflare DNS：把 `xk` 的记录指向本 Pages 项目（常见做法是 `CNAME xk -> jcourse-web.pages.dev`）
3) 如果 `xk.yourtj.de` 之前绑定在别的 Pages 项目上，需要先在旧项目里移除该域名，否则新项目无法添加
