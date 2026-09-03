# YOURTJ选课社区

基于 React + Hono + SQLite 的选课点评社区。

> **线上地址**: [xk.yourtj.de](https://xk.yourtj.de)

## 架构（2026-08 迁移后）

```
浏览器
  ├── xk.yourtj.de ────────────────▶ Netlify（Vite+React+WLC+Scheduler 静态资源）
  │
  └── jcourse.yourtj.de ──────────▶ Cloudflare DNS
                                      │
                                    1Panel OpenResty 反向代理
                                      │
                                     VPS Docker backend（Hono Node，127.0.0.1:8787）
                                      │
                                     SQLite（/opt/yourtjcourse/data/jcourse.db，WAL + FTS5 trigram）
```

- 前端：Vite + React（含 VitePress 文档站 wlc 与 Vue 排课子应用 scheduler），托管在 Netlify。
- 后端：Hono，运行在 VPS 的 Docker 容器内（Node.js），仅监听回环地址 `127.0.0.1:8787`，由 1Panel OpenResty 反向代理对外提供 `https://jcourse.yourtj.de`。
- 数据库：SQLite（原 Cloudflare D1 迁移而来），本地文件持久化，开启 WAL 与 FTS5 trigram 搜索。
- 一系统(PK)课程同步：GitHub Actions 抓取 → 生成 SQL → SCP 到 VPS → `apply-pk-sync-to-sqlite.sh` 应用到 SQLite → 重建搜索索引。

## 项目结构

```
YourTJCourse-Serverless/
├── backend/                # Hono 后端（Cloudflare Worker 与 Node/VPS 双运行）
│   ├── src/
│   │   ├── index.ts        # 主 API 路由（评课 + 管理），含 /healthz
│   │   ├── node.ts         # VPS 上的 Node.js 启动入口（@hono/node-server）
│   │   ├── runtime/        # Node 运行环境兼容层
│   │   │   ├── db.ts       # D1 API 兼容层（prepare/bind/first/all/run/batch → SQLite）
│   │   │   ├── cache.ts    # Cloudflare Cache API 的 no-op 替代
│   │   │   └── env.ts      # 从 process.env 构造 Bindings
│   │   ├── pk/             # 选课系统 (PK) 模块
│   │   ├── routes/         # public / admin / settings / ai-summary 路由
│   │   ├── middleware/     # cors / cache-control / admin-auth / migration-readonly
│   │   └── helpers/        # db、cache、search、feishu、captcha 等
│   ├── scripts/
│   │   ├── apply-pk-sync-to-sqlite.sh   # PK 同步 SQL → VPS SQLite
│   │   ├── backup-sqlite.sh             # 每日 SQLite 备份（保留 7 天）
│   │   └── ...（其余抓取/校验脚本）
│   ├── migrations/         # 增量迁移脚本
│   ├── Dockerfile          # 后端生产镜像
│   └── package.json        # build:node = esbuild 打包 Node 入口
├── frontend/               # React + Vite 前端
├── scheduler/              # Vue 3 选课排课子应用
├── wlc/                    # VitePress 微留程文档站
├── netlify.toml            # Netlify 构建配置（SPA fallback）
├── docker-compose.yml      # VPS 部署编排（backend 单服务）
└── .github/workflows/      # CI/CD
    ├── deploy-cloudflare.yml        # 旧部署（回滚期保留）
    ├── deploy-vps.yml               # 后端 → VPS Docker 部署
    └── sync-onesystem-login.yml     # 一系统同步 → VPS SQLite
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18, Vite, Tailwind CSS（Netlify 托管） |
| 后端 | Hono on Node.js（Docker 容器，VPS 运行） |
| 数据库 | SQLite（WAL 模式，FTS5 trigram 搜索） |
| 排课 | Vue 3, Ant Design Vue, Vuex |
| 文档 | VitePress |
| 反代/HTTPS | 1Panel OpenResty（Let's Encrypt 证书） |
| CI/CD | GitHub Actions → VPS SSH 部署 |
| 人机验证 | 网页入口直接进入，评价提交 TongjiCaptcha；客户端可使用 Cap/Turnstile 服务端验签 |

## 快速开始

### 环境要求

- Node.js 22+
- Python 3.11+（仅一系统同步脚本）
- Docker + Docker Compose（VPS 部署）

### 本地开发（后端跑 Node + SQLite）

```bash
cd backend
npm ci

# 准备一个本地 SQLite（可从 D1 no-FTS 快照导出，或用 schema.sql 初始化）
sqlite3 jcourse.local.db < schema.sql

# 启动 Node 后端（默认监听 127.0.0.1:8787）
DATABASE_URL=file:/abs/path/jcourse.local.db \
ADMIN_SECRET=dev-secret \
CAPTCHA_SITEVERIFY_URL=https://your-captcha-worker.example \
npm run build:node
node dist/node.cjs
```

健康检查：`curl http://127.0.0.1:8787/healthz` 应返回 `{"ok":true}`。

### 前端

```bash
cd frontend
npm ci
npm run build   # 会先构建 wlc + scheduler
```

Netlify 使用仓库根目录 `netlify.toml` 构建，自动处理 SPA fallback。

### VPS 生产部署

目录结构（VPS 上）：

```
/opt/yourtjcourse/
├── docker-compose.yml     # backend 单服务
├── backend.env            # 后端环境变量（chmod 600，由 GitHub Actions 生成）
├── data/jcourse.db        # SQLite 数据库
├── incoming/              # SQL 导入暂存
├── backups/               # 每日备份（保留 7 天）
└── repo/YourTJCourse-Serverless/   # 代码
```

首次部署后执行：

```bash
cd /opt/yourtjcourse
docker compose up -d --build backend
curl -fsS http://127.0.0.1:8787/healthz
```

日常更新由 `.github/workflows/deploy-vps.yml` 在 `main` 分支 push 时自动完成（SSH → 上传代码 → `docker compose up -d --build backend` → healthz 检查）。

### 迁移期只读保护

`backend.env` 中设置 `MIGRATION_READONLY=1` 时，后端会对用户写接口（评价、点赞、举报等）返回 `503 {"error":"maintenance"}`，管理接口与排课查询不受影响。正式切流期间使用，保证 D1 与 SQLite 数据一致。

## 数据同步（一系统 / PK）

通过 GitHub Actions 手动触发：

1. 进入 Actions → "Sync Onesystem (Login) To VPS SQLite"
2. 输入 `calendarId`（一系统学期 ID）和 `depth`（同步深度，默认 1）
3. 运行

流程：GitHub Actions 登录一系统 → 生成 SQL → SCP 到 VPS → `apply-pk-sync-to-sqlite.sh`（flock 互斥 + 同步前备份 + 按序应用 migrations 与 SQL）→ 调用管理接口重建评课/搜索索引 → 重启 backend。

## 数据库备份

VPS 已配置 cron 每日 03:10 执行 `backend/scripts/backup-sqlite.sh`，使用 SQLite `.backup` 生成一致性快照到 `/opt/yourtjcourse/backups/`，保留最近 7 天。

## 开发流程

```
feature/fix branch ──→ PR ──→ dev ───→ 自动部署预览环境
                           ↑              │
                       PR Checks          │ 经测试后
                      (type-check         ▼
                       + build)     PR ──→ main ──→ 自动部署生产
```

### 日常开发

1. 从 `dev` 创建功能分支：`git checkout -b fix/xxx dev`
2. 开发 → commit → push
3. 开 Pull Request 到 `dev`（自动触发 PR Checks：type-check + build）
4. Review 通过后 merge 到 `dev`
5. 验证后 merge 到 `main`，触发生产部署（后端 → VPS，前端 → Netlify）

## 文档

- [API 参考](docs/api.md)
- [数据库 Schema](docs/database.md)
- [CI/CD 说明](CI_CD.md)

## 贡献

1. Fork 本仓库
2. 创建功能分支: `git checkout -b fix/your-fix-name`
3. 提交更改: 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式
   - `fix(scope): description` — Bug 修复
   - `feat(scope): description` — 新功能
   - `docs(scope): description` — 文档更新
   - `chore(scope): description` — 构建/CI 等杂项
4. 推送并创建 Pull Request

### Commit 规范

- scope: `backend`, `frontend`, `scheduler`, `ci`, `script`, `schema`, `docs`
- 使用英文，祈使语气
- 每个 commit 只做一件事

## 许可

本项目仅供学习和研究使用。
