# CI/CD 说明

`server` 分支更新后自动部署：

- `backend/` → VPS（SSH → Docker compose 构建/重启）
- `frontend/` + `scheduler/` + `wlc/` → Netlify（`netlify.toml` 定义构建命令）

> 说明：迁移前 `main` 分支的 Cloudflare Workers/Pages 部署工作流（`deploy-cloudflare.yml`、`deploy-dev-cloudflare.yml`）在回滚期内保留，正式切换完成后停用。

## 1) 需要配置的 GitHub Repository Secrets

在 GitHub 仓库 -> Settings -> Secrets and variables -> Actions -> New repository secret 配置：

### 部署与外部服务

- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token（回滚期 `deploy-cloudflare.yml` / `deploy-dev-cloudflare.yml` 使用）
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID
- `NETLIFY_AUTH_TOKEN`：Netlify Personal Access Token（`deploy-netlify.yml` 使用）
- `VPS_HOST`：VPS 公网 IP 或域名（填实际服务器的值，不要提交到仓库）
- `VPS_PORT`：VPS SSH 端口（默认 `22`）
- `VPS_USER`：VPS SSH 用户（例如 `root`）
- `VPS_SSH_KEY`：VPS SSH 私钥（GitHub Actions 用，对应已部署到 VPS `~/.ssh/authorized_keys` 的公钥）

### 前端构建变量（Netlify / Vite）

- `VITE_API_URL`：`https://jcourse.yourtj.de`
- `VITE_TURNSTILE_SITE_KEY`
- `VITE_CAPTCHA_URL`
- `VITE_WALINE_SERVER_URL`
- `VITE_CREDIT_API_BASE`：`https://core.credit.yourtj.de`
- `VITE_CAP_API_ENDPOINT`：自托管 Cap 的 widget 端点，形如 `https://<cap-instance>/<site-key>/`（web 端启动门禁优先使用；未配置时回退 Turnstile）

### 后端环境变量（写入 VPS `backend.env`）

- `JCOURSE_ADMIN_SECRET`：后端管理员密钥（写入 `ADMIN_SECRET`）
- `CAPTCHA_SITEVERIFY_URL`
- `TURNSTILE_SECRET_KEY`、`TURNSTILE_SITEVERIFY_URL`
- `CREDIT_API_BASE`、`CREDIT_JCOURSE_SECRET`（及兼容名 `VITE_CREDIT_API_BASE`、`JCOURSE_INTEGRATION_SECRET`）
- `AI_SUMMARY_KEY`、`AI_SUMMARY_MODEL`、`AI_SUMMARY_BASE_URL`
- `CAP_API_BASE`、`CAP_SITE_KEY`、`CAP_SECRET_KEY`（自托管 Cap CAPTCHA，web 端启动门禁用）
- `CAP_API_INTERNAL_BASE`（可选；backend 与 Cap 同机/同 Docker 网络时使用，例如内部服务地址，绕过公网 TLS/反代）
- `CAP_VERIFY_TIMEOUT_MS`、`CAP_VERIFY_MAX_IN_FLIGHT`（可选；默认总超时 15000ms、单进程最多 16 个并发校验）
- `FEISHU_REPORT_WEBHOOK_URL`、`FEISHU_REPORT_WEBHOOK_SECRET`
- `PUBLIC_URL`（变量，默认 `https://jcourse.yourtj.de`）
- `MIGRATION_READONLY`（变量，迁移期设 `1`，稳定后置 `0`）

注意：`backend.env` 由 `deploy-vps.yml` 在 CI 中动态生成并 `chmod 600`，**不要提交到 Git**。

### 一系统同步

- `ONESYSTEM_SNO`、`ONESYSTEM_PASSWORD`
- `ONESYSTEM_IMAP_SERVER`、`ONESYSTEM_IMAP_PORT`、`ONESYSTEM_IMAP_EMAIL`、`ONESYSTEM_IMAP_GRANTCODE`（可选）

### CAPTCHA 变量回退说明

后端评测人机验证需要 `CAPTCHA_SITEVERIFY_URL`。CI 使用 `CAPTCHA_SITEVERIFY_URL`，未配置时回退 `VITE_CAPTCHA_URL`；两者都空时后端评测提交会 403。`VITE_CAPTCHA_URL` 是前端 captcha 基址，建议与 `CAPTCHA_SITEVERIFY_URL` 配同值或保持 `VITE_CAPTCHA_URL` 正确即可。

## 2) 工作流文件

| 文件 | 触发 | 作用 |
|---|---|---|
| `.github/workflows/deploy-vps.yml` | `server` push（backend/** 或 docker-compose.yml） | 后端代码与 `backend.env` → VPS → `docker compose up -d --build backend` → healthz 检查 |
| `.github/workflows/deploy-netlify.yml` | `server` push（frontend/scheduler/wlc/netlify.toml） | 构建前端（注入 VITE_*）→ `netlify deploy --prod` |
| `.github/workflows/sync-onesystem-login.yml` | 手动 / `dev` push 含 `[pk-sync]` | 登录一系统 → 生成 SQL → SCP 到 VPS → `apply-pk-sync-to-sqlite.sh` → 重建索引 → 重启 backend |
| `.github/workflows/pr-checks.yml` | PR 到 `dev`/`main` | type-check + build，不部署 |
| `.github/workflows/deploy-cloudflare.yml` | `main` push | **旧架构部署，回滚期保留，正式切换完成后停用** |
| `.github/workflows/deploy-dev-cloudflare.yml` | `dev` 分支推送 / 手动 | dev 预览环境部署（回滚期保留） |

> 说明：原「Refresh No-FTS D1 Backup」每日快照任务已停用（迁移完成，D1 不再作为备份源）。如需再次从 D1 导出，可临时在本地用 wrangler 操作 `jcourse-db-backup`。

## 3) 后端环境变量（VPS `backend.env`）

`deploy-vps.yml` 会生成：

```text
APP_ENV=production
PORT=8787
DATABASE_URL=file:/data/jcourse.db
CAPTCHA_SITEVERIFY_URL=...
ADMIN_SECRET=...
TURNSTILE_SECRET_KEY=...
TURNSTILE_SITEVERIFY_URL=...
CREDIT_API_BASE=...
CREDIT_JCOURSE_SECRET=...
AI_SUMMARY_KEY=...
AI_SUMMARY_MODEL=...
AI_SUMMARY_BASE_URL=...
FEISHU_REPORT_WEBHOOK_URL=...
FEISHU_REPORT_WEBHOOK_SECRET=...
PUBLIC_URL=https://jcourse.yourtj.de
MIGRATION_READONLY=0
```

## 4) 一系统同步与 D1 导出规范（迁移/回滚期）

一系统/PK 数据同步统一使用 `.github/workflows/sync-onesystem-login.yml`。迁移后流程：GitHub Actions 登录一系统生成 SQL → SCP 到 VPS → `apply-pk-sync-to-sqlite.sh` 应用到 SQLite → 管理接口重建评课/搜索索引 → 重启 backend。

迁移期 D1 相关规范：

- 生产查询数据库 D1 `jcourse-db` 可能包含 `course_search` FTS5 虚拟表，**禁止对其执行 `wrangler d1 export`**。
- `jcourse-db-backup` 是迁移期间使用的 no-FTS 快照。**该每日刷新任务已停用**，快照停留在迁移完成时的状态；如需再次导出，直接对现有 `jcourse-db-backup` 执行导出即可（其内容为迁移完成时的数据）。

## 5) 自定义域名

- `xk.yourtj.de`：Netlify 站点自定义域名（原 Cloudflare Pages 绑定已移除）。
- `jcourse.yourtj.de`：Cloudflare DNS A 记录指向 VPS，由 1Panel OpenResty 反代到 `127.0.0.1:8787` 并提供 Let's Encrypt 证书。
