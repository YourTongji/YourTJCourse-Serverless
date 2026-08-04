# CI/CD说明

这个仓库使用 GitHub Actions 在 `main` 分支更新后自动部署：

- `backend/` -> Cloudflare Workers (`wrangler deploy`)
- `frontend/` -> Cloudflare Pages (`wrangler pages deploy`)

## 1) 需要在 GitHub Repo Secrets 配置的变量

在 GitHub 仓库 -> Settings -> Secrets and variables -> Actions -> New repository secret，添加：

- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID
- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token（用于 CI 部署）
- `VITE_API_URL`：前端调用后端的 API Base URL（例如 `https://jcourse-backend.<your-subdomain>.workers.dev` 或你的自定义域名）
- `BACKEND_URL_DEV`：dev 前端预览站点指向的 dev 后端 URL（`deploy-dev-cloudflare.yml` 使用）
- `VITE_TURNSTILE_SITE_KEY`：如果你仍然使用 Turnstile，可以填站点 Key（不需要的话也可以填任意占位字符串）
- `VITE_CAPTCHA_URL`：TongjiCaptcha 服务的 URL（例如 `https://captcha.xxx.com`）
- `VITE_WALINE_SERVER_URL`：Waline 服务端地址（例如 `https://waline.xxx.com`）
- `VITE_CREDIT_API_BASE`：YOURTJ 社区积分站后端 Core API Base（建议 `https://core.credit.yourtj.de`）
- `JCOURSE_ADMIN_SECRET`：后端 `ADMIN_SECRET` 来源（CI 写入 Worker）
- `TURNSTILE_SECRET_KEY`：Turnstile 服务端密钥（CI 写入 Worker；缺失会 fail-fast）
- `CREDIT_JCOURSE_SECRET`：积分站为选课站分配的密钥（可与 `JCOURSE_INTEGRATION_SECRET` 二选一）

### 可选 / 有回退的 secrets

| Secret | 用途 | 回退 / 说明 |
| --- | --- | --- |
| `CAPTCHA_SITEVERIFY_URL` | 后端评测人机验证 siteverify | **可缺省**。CI 使用 `CAPTCHA_SITEVERIFY_URL` 或回退 `VITE_CAPTCHA_URL` 写入 Worker；两者都空时 deploy 硬失败（避免发帖 403） |
| `CREDIT_API_BASE` | 积分站 Core API Base | 可缺省，回退 `VITE_CREDIT_API_BASE` |
| `JCOURSE_INTEGRATION_SECRET` | 积分集成密钥别名 | 可缺省，回退 `CREDIT_JCOURSE_SECRET` |
| `TURNSTILE_SITEVERIFY_URL` | Turnstile siteverify 自定义 URL | 可缺省，使用 Cloudflare 默认 |
| `AI_SUMMARY_KEY` / `AI_SUMMARY_MODEL` / `AI_SUMMARY_BASE_URL` | AI 摘要 | 可缺省（功能降级） |
| `FEISHU_REPORT_WEBHOOK_URL` / `FEISHU_REPORT_WEBHOOK_SECRET` | 飞书举报推送 | 可缺省 |

### CAPTCHA 同步说明（#167 后）

部署 workflow（`deploy-dev-cloudflare.yml` / `deploy-cloudflare.yml`）在 **Ensure backend secrets** 步骤会把 captcha URL 同步到 Worker secret `CAPTCHA_SITEVERIFY_URL`：

1. 优先使用 GitHub secret `CAPTCHA_SITEVERIFY_URL`（可填 captcha 服务基址，或带 `/api/siteverify` 的完整 URL；后端 `captcha.ts` 会归一化）。
2. 若未配置，回退使用已有的 `VITE_CAPTCHA_URL`（前端 captcha 基址）。
3. 两者皆空 → 步骤 `exit 1`，阻止部署（评测提交在无 siteverify URL 时会 403）。

因此**不必**单独再配 `CAPTCHA_SITEVERIFY_URL`，只要 `VITE_CAPTCHA_URL` 正确即可；若希望前后端 secret 名语义分离，可额外配置同值的 `CAPTCHA_SITEVERIFY_URL`。

## 2) Cloudflare API Token 推荐权限

在 Cloudflare Dashboard -> My Profile -> API Tokens -> Create Token，建议创建 Custom Token：

- Account permissions：
  - Workers Scripts: Edit
  - Pages: Edit
  - D1: Edit（或至少 Read；看你是否在 CI 里做 D1 变更）
- Account resources：选择你的账号（All accounts 或指定账号）

## 3) 后端运行所需的 Workers Secrets（一次性设置）

后端 Worker `jcourse-backend` 依赖以下 secrets（本地或 Cloudflare Dashboard / wrangler 设置均可）：

- `CAPTCHA_SITEVERIFY_URL`（必填运行时；CI 可由 `VITE_CAPTCHA_URL` 回退写入）
- `ADMIN_SECRET`（CI 来源：`JCOURSE_ADMIN_SECRET`）
- `TURNSTILE_SECRET_KEY`
- `CREDIT_API_BASE`：积分站 Core API Base（建议 `https://core.credit.yourtj.de`；不要填 `https://credit.yourtj.de`；CI 可回退 `VITE_CREDIT_API_BASE`）
- `CREDIT_JCOURSE_SECRET`：积分站为选课站分配的密钥（用于积分事件上报）

本地可用：

```bash
cd backend
wrangler secret put CAPTCHA_SITEVERIFY_URL
wrangler secret put ADMIN_SECRET
wrangler secret put TURNSTILE_SECRET_KEY
```

## 4) 工作流文件位置

- `.github/workflows/deploy-cloudflare.yml`
- `.github/workflows/deploy-dev-cloudflare.yml`（`dev` 分支推送 / 手动触发）

## 5) 一系统同步与 D1 导出规范

一系统/PK 数据同步统一使用 `.github/workflows/sync-onesystem-login.yml`。该流程只将生成的 SQL 写入生产查询库：

- `jcourse-db`：生产查询库，会刷新评课站检索索引，可能包含 `course_search` FTS5 虚拟表。
- `jcourse-db-backup`：由 `.github/workflows/refresh-no-fts-d1-backup.yml` 每日刷新，是生产库的 no-FTS 快照，用于导出、ETL 和分析，不应创建 `course_search%` / FTS5 对象。

旧的 `.github/workflows/sync-onesystem.yml` Cookie 同步流程已停用，执行时会立即失败并提示使用 Login 同步流程。

初始化 `jcourse-db-backup` 时，通过 Cloudflare Dashboard 或 `npx wrangler d1 create jcourse-db-backup` 创建 D1 数据库；如果本地 Wrangler 登录了多个 Cloudflare 账号，请只在本地环境变量或 Wrangler 本地配置中选择账号，不要把具体账号 ID 或备份库 database_id 写入公开仓库。创建后可手动触发 `Refresh No-FTS D1 Backup` workflow 做首次全量刷新。

请不要对生产库执行 `wrangler d1 export`。需要导出数据时，先确认最近一次 `Refresh No-FTS D1 Backup` workflow 成功，或用和检查脚本一致的 SQL 查询备份库状态：

```bash
cd backend
npx wrangler d1 execute jcourse-db-backup --remote \
  --command "SELECT status, started_at, finished_at, error FROM backup_refresh_state WHERE id = 1; SELECT COUNT(*) AS no_fts_objects FROM sqlite_master WHERE name LIKE 'course_search%' OR LOWER(COALESCE(sql, '')) LIKE '%create virtual table%' OR LOWER(COALESCE(sql, '')) LIKE '%fts5%';"
```

只有 `status = 'ready'`、`error` 为空、`no_fts_objects = 0` 时，才只导出备份库：

```bash
cd backend
npx wrangler d1 export jcourse-db-backup --remote --output backup.sql
```

本地只检查复制计划和表计数时，可使用 Wrangler 登录态做 dry-run；如果本地 Wrangler 登录了多个账号，先在本地环境变量或 Wrangler 本地配置中选择账号：

```bash
cd backend
node ./scripts/refresh-no-fts-backup.mjs --dry-run
```

正式全量刷新仍建议优先手动触发 GitHub Actions 的 `Refresh No-FTS D1 Backup` workflow。手动触发时可选择：

- `dryRun`：只检查复制计划和表计数，不修改备份库。
- `skipMaterialize`：只复制普通表，跳过 no-FTS 派生课程索引刷新，主要用于排查复制问题。
- `exportSmoke`：刷新成功后对备份库执行一次导出 smoke test，并检查 dump 中不包含 FTS 对象。

`jcourse-db-backup` 是定时快照，不是实时镜像；默认最多可能落后约 24 小时。该库用于导出、ETL 和分析，不替代完整生产灾备策略。

## 6) 自定义域名（xk.yourtj.de）为什么没更新？

GitHub Actions 里 `wrangler pages deploy` 打印出来的 `*.pages.dev` 只是 Pages 的默认访问地址。
要让生产域名 `https://xk.yourtj.de` 指向本仓库的 Pages 项目，需要在 Cloudflare 侧绑定域名：

1) Cloudflare Pages -> 项目 `jcourse-web` -> Custom domains：添加 `xk.yourtj.de`
2) Cloudflare DNS：把 `xk` 的记录指向本 Pages 项目（常见做法是 `CNAME xk -> jcourse-web.pages.dev`）
3) 如果 `xk.yourtj.de` 之前绑定在别的 Pages 项目上，需要先在旧项目里移除该域名，否则新项目无法添加
