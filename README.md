# YOURTJ选课社区 - Serverless 版

基于 Cloudflare Workers + D1 + Pages 的选课点评社区。

> **线上地址**: [xk.yourtj.de](https://xk.yourtj.de)

## 项目结构

```
YourTJCourse-Serverless/
├── backend/                # Cloudflare Workers 后端 (Hono)
│   ├── src/
│   │   ├── index.ts        # 主 API 路由 (评课 + 管理)
│   │   ├── pk/             # 选课系统 (PK) 模块
│   │   │   ├── routes.ts   # PK API 路由
│   │   │   ├── sync.ts     # 一系统数据同步
│   │   │   └── utils.ts    # PK 工具函数
│   │   ├── courseStats.ts  # 课程统计刷新
│   │   └── sqids.ts        # Review ID 编码
│   ├── scripts/            # Python 同步脚本
│   ├── schema.sql          # 完整数据库 DDL
│   ├── migrations/         # 增量迁移脚本
│   └── wrangler.toml       # Workers 配置
├── frontend/               # React + Vite 前端
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 通用组件
│   │   ├── services/       # API 服务
│   │   └── utils/          # 工具函数
│   └── scripts/            # 构建脚本 (wlc 文档嵌入)
├── scheduler/              # Vue 3 选课排课子应用
│   └── src/
│       ├── components/     # 排课组件
│       ├── store/          # Vuex 状态管理
│       └── utils/          # 工具函数
├── wlc/                    # VitePress 微留程文档站
├── docs/                   # 项目文档
│   ├── api.md              # API 参考
│   └── database.md         # 数据库 Schema
└── .github/workflows/      # CI/CD
    ├── deploy-cloudflare.yml        # 生产部署
    └── sync-onesystem-login.yml     # 一系统数据同步
```

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | [Hono](https://hono.dev) on Cloudflare Workers, D1 (SQLite) |
| 前端 | React 18, Vite, Tailwind CSS |
| 排课 | Vue 3, Ant Design Vue, Vuex |
| 文档 | VitePress |
| CI/CD | GitHub Actions → Cloudflare Workers/Pages |
| 人机验证 | 启动页使用 Cloudflare Turnstile，评价提交使用 TongjiCaptcha |

## 快速开始

### 环境要求

- Node.js 22+
- Python 3.11+ (仅同步脚本)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (登录 `npx wrangler login`)

### 后端

```bash
cd backend
npm ci

# 创建 D1 数据库
npx wrangler d1 create jcourse-db
# 将返回的 database_id 填入 wrangler.toml

# 初始化数据库
npx wrangler d1 execute jcourse-db --remote --file=./schema.sql

# 设置密钥
npx wrangler secret put CAPTCHA_SITEVERIFY_URL
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY

# 部署
npx wrangler deploy
```

### 前端

```bash
cd frontend
npm ci
npm run build
npx wrangler pages deploy dist --project-name=jcourse-web
```

环境变量通过 Cloudflare Dashboard 或 CI secrets 配置。

### 排课应用

排课应用内嵌在前端构建中（`npm run build:scheduler`），无需独立部署。

### 数据同步

通过 GitHub Actions 手动触发：

1. 进入 Actions → "Sync Onesystem (Login) To D1"
2. 输入 `calendarId`（一系统学期 ID）和 `depth`（同步深度，默认 1）
3. 运行

同步流程会将一系统/PK 原始数据同时写入生产 D1 `jcourse-db` 和备份镜像 D1 `jcourse-db-backup`。生产库用于线上查询，并会刷新评课站检索索引；备份库仅用于 PK 数据镜像、导出、ETL 和分析，不创建 `course_search` FTS5 虚拟表。

请不要对生产库 `jcourse-db` 执行 `wrangler d1 export`。如需导出一系统/PK 数据，请只导出备份库：

```bash
cd backend
npx wrangler d1 export jcourse-db-backup --remote --output backup.sql
```

`jcourse-db-backup` 不是完整生产业务灾备库，不可作为线上业务库恢复目标，也不保证包含评论、举报、AI 摘要等业务数据；完整灾备仍需要单独的生产快照或备用库策略。若同步失败导致主备可能分叉，请使用同一组 `calendarId` / `depth` 重新运行同步，直到主备计数校验通过后再基于备份库导出或分析。

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
5. 自动部署到预览环境（`--env dev`），可提前验证

### 版本发布

1. 确保 `dev` 分支经过充分测试（含预览环境验证）
2. 开 Pull Request 从 `dev` 到 `main`
3. Review 通过后 merge，自动触发生产部署

> **PR Checks**（`.github/workflows/pr-checks.yml`）：PR 到 `dev`/`main` 时运行 type-check + build，不部署。
> **dev 分支**：merge 后自动部署到预览环境（`--env dev` + `--branch dev`），非生产。
> **main 分支**：merge 后自动部署生产环境。

## 文档

- [API 参考](docs/api.md)
- [数据库 Schema](docs/database.md)

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

### Issue 标签

| 标签 | 含义 |
|------|------|
| `area:backend` | 后端 / Cloudflare Worker |
| `area:frontend` | 前端 / React |
| `area:scheduler` | 排课 / Vue 3 |
| `area:ci` | CI/CD 工作流 |
| `area:script` | Python 同步脚本 |
| `area:schema` | 数据库 Schema / 迁移 |
| `severity:critical` | 数据丢失 / 安全漏洞 / 服务中断 |
| `severity:high` | 功能不可用 / 严重影响用户体验 |
| `severity:medium` | 体验降级 / 非关键功能异常 |
| `severity:low` | 轻微 / 优化 / 未来改进 |

## 许可

本项目仅供学习和研究使用。
