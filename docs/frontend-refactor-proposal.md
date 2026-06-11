# YOURTJ 选课社区 · 前端重构 Proposal（React Router v7 + shadcn/ui + TanStack Query）

> 状态：草案 v1（待评审）
> 日期：2026-06-06
> 一句话：把当前纯 CSR 的 Vite SPA，重构为 **React Router v7（Remix）on Cloudflare Workers** 的 SSR 应用，UI 用 **shadcn/ui** 现成组件/区块拼装、数据用 **TanStack Query**。**核心原则：尽量不手写 CSS，能用成熟模板/区块就用。**

---

## 1. 背景与目标

现状（详见 `docs/...` 与代码）：主前端是 **React 18 + Vite + react-router-dom v6 的纯客户端渲染 SPA**，排课是内嵌的 Vue3 子应用。Lighthouse（desktop，生产构建）实测：Performance 61 / A11y 95 / BP 100 / SEO 92，FCP 3.6s、LCP 3.9s，根因是「空壳 HTML + 653KB 主包 + 5MB 字体」的 CSR 模式。

**目标**
1. 改为 **SSR**，让课程/评价页可被服务端直出 → 首屏与 SEO 质变。
2. **极少手写 CSS**：UI 由 shadcn/ui 组件 + 官方 blocks + 主题生成器产出，品牌样式只配置一次（颜色/圆角/字体 token），其余用库默认。
3. **复用现有 React 资产与后端**：后端（Hono + D1）原样不动，前端只换"消费端"；现有页面逻辑平移。
4. 修掉 Lighthouse 暴露的体积问题（字体子集化、按路由分包、去 gsap）。

**非目标**
- 不重写后端；不在本期重写排课（Vue）为 React（见 §9）。
- 不追求保留旧版"满屏玻璃"的高度定制外观——本期主动换成 shadcn 的成熟设计体系（更省事、更无障碍）。

---

## 2. 选型总览（已锁定）

| 层 | 选型 | 作用 |
|---|---|---|
| 框架 | **React Router v7（framework mode = Remix）** | SSR + loader/action 数据模型，Web 标准，CF 原生 |
| 运行/部署 | **Cloudflare Workers**（Workers Static Assets） | SSR 在边缘执行；与后端 Worker 同账号 |
| 组件库 | **shadcn/ui**（Radix + Tailwind） | 现成、可访问、可主题化；**少写 CSS 的关键** |
| 样式 | **Tailwind v4**（CSS-first） | 仅承载 token，不手写组件 CSS |
| 数据 | **TanStack Query** | 客户端缓存/去重/无限滚动/乐观更新 |
| 表单 | **React Hook Form + Zod** | 写评价校验，Zod schema 与后端校验对齐 |
| Markdown | markdown-it + dompurify + **@tailwindcss/typography(prose)** | 评价渲染，prose 类零手写 CSS |
| 动效 | **Framer Motion (motion)** + **View Transitions** | 替代 gsap（去掉重依赖） |
| 人机验证 | 保留 **react-turnstile** + TongjiCaptcha（客户端岛屿，action 服务端校验） | |

---

## 3. 「尽量不设计 CSS」怎么落地（本提案重点）

思路：**设计 = 配置 + 拼装**，不是手写样式。

1. **主题一次成型**：用 [tweakcn](https://tweakcn.com)（shadcn 主题可视化生成器）选一套主题，把品牌青色设为 `primary`、定圆角/字体，导出为 CSS 变量贴进 `app.css`。之后所有组件自动套用，**不再逐组件调样式**。
2. **页面用官方 blocks 拼**：
   - **后台管理**：直接用 [shadcn blocks](https://ui.shadcn.com/blocks) 的 `dashboard` / `sidebar` / `data-table` / `login` —— 管理端几乎"零设计"。
   - **公开页**：用 `card`、`badge`、`input`、`command`(搜索)、`tabs`、`skeleton`、`dialog`/`drawer`(筛选&写评价)、`avatar`、`sonner`(toast)、`pagination` 等原语拼装。
3. **复杂控件直接拿现成**：表格用 **TanStack Table**（shadcn 有 data-table 范例）；表单用 shadcn `Form`（RHF+Zod）；Markdown 用 `prose` 类。
4. **品牌字体瘦身**：当前 `kkt.ttf` 3.8MB + `YuFanLixing.otf` 1.1MB 必须**子集化**（仅站名/标语用到的几十字）或改用可变字体，否则再好的框架也白搭。
5. （可选）若想要更"开箱即用的整页模板"，可评估 **Tailwind UI**（官方付费，含成品 application/marketing 模板）——预算允许时最省人力。

> 取舍：换 shadcn 体系后，旧版定制玻璃感会简化为统一设计系统；可保留极少量"glass"变体用于点睛，但不再全站手搓。这正是"少设计"的代价与收益。

---

## 4. 架构

RR7 框架模式（Vite 构建，SSR 跑在 Worker）：

```
app/
├─ root.tsx                # HTML 文档骨架、<Meta>/<Links>、Providers(QueryClient)
├─ routes.ts              # 路由表（或 fs-routes 约定式）
├─ routes/
│  ├─ _index.tsx          # 课程列表（首页）loader 直出 + 客户端无限滚动
│  ├─ course.$id.tsx      # 课程详情 + 评价（SSR，SEO 关键）
│  ├─ write-review.$id.tsx# 写/改评价（action 提交）
│  ├─ schedule.tsx        # 排课（见 §9）
│  ├─ admin.*.tsx         # 管理后台（shadcn dashboard blocks）
│  └─ feedback/about/faq  # 静态页
├─ lib/                   # api client、query keys、zod schemas、utils
├─ components/            # shadcn 生成的 ui/* + 业务组件
└─ app.css               # Tailwind + 主题 token（唯一的 CSS）
workers/app.ts            # Worker 入口（RR7 request handler）
wrangler.jsonc            # 绑定：Service Binding 到后端 Worker
react-router.config.ts    # ssr: true
```

**数据流（关键）**
- **SSR/SEO 首屏数据走 loader**：`loader({ params, context })` 在 Worker 内取数据，HTML 直出。
- **客户端交互走 TanStack Query**：无限滚动（`useInfiniteQuery`）、点赞乐观更新、钱包余额轮询、筛选即时刷新。
- **写操作走 action**：`POST /api/review` 等用 RR7 `action` 提交（天然 CSRF 友好、渐进增强），或用 Query mutation——二选一统一风格。
- **后端调用用 Service Binding**：后端 Worker（`jcourse-backend`）通过 `context.cloudflare.env.API.fetch()` 直连，**省掉公网往返**，SSR 更快；浏览器端仍走 `https://jcourse.yourtj.de` 公网 API。

---

## 5. 页面 → 路由 / 组件映射

| 现有页面 | RR7 路由 | 主要 shadcn 件 | 数据 |
|---|---|---|---|
| `Courses.tsx`（首页瀑布流） | `_index.tsx` | Card/Badge/Input/Command/Skeleton；瀑布流用 CSS columns | loader 首屏 + `useInfiniteQuery` 加载更多 |
| `Course.tsx`（详情+评价） | `course.$id.tsx` | Card/Avatar/Tabs/Separator/prose；点赞 Button | loader SSR + Query 点赞 mutation |
| `WriteReview.tsx` | `write-review.$id.tsx` | Form(RHF+Zod)/Textarea/Slider(评分)/Dialog | action 提交 + Turnstile 岛屿 |
| `FilterPanel.tsx` | 详情/列表内 | **Drawer/Sheet** + Command(院系搜索) + Checkbox | URL searchParams 驱动 loader |
| `Navbar` / 底部导航 | `root.tsx` 布局 | NavigationMenu / 自定义底栏 | — |
| `Admin.tsx` | `admin.*.tsx` | **dashboard + data-table blocks** | loader + Query；`x-admin-secret` 服务端持有 |
| 公告/维护 | `root.tsx` loader | Alert/Banner + Sonner | `GET /api/settings/runtime-state` |
| 旧文档(wlc) | 外链 | — | 新标签打开 |

---

## 6. 渲染 / 性能策略（对症 Lighthouse）

- **SSR + 流式**：课程列表/详情服务端直出 → FCP/LCP/SEO 直接改善。
- **按路由分包**：RR7 天然按路由切分；`gsap`/`html-to-image`/`markdown` 仅在用到的路由加载（修"653KB 主包 / 117KB 未用 JS"）。
- **字体子集化**：把 5MB CJK 字体子集到所需字形（修"5,385 KiB 巨大负载"）。
- **去 gsap**：换 Framer Motion + View Transitions（更小）。
- **图片/favicon**：`favicon.svg` 96KB 需优化。
- **缓存**：沿用后端 `Cache-Control`；TanStack Query 设合理 `staleTime`；loader 响应加边缘缓存头。
- 目标：移动端 Performance 从当前水平提升到 90+，A11y/BP/SEO 接近 100。

---

## 7. Cloudflare 部署

- 脚手架：`npm create cloudflare@latest -- --framework=react-router`（C3 官方 RR7 + Workers 模板），再 `npx shadcn@latest init`。
- 前端成为一个 **SSR Worker**（带 Static Assets），与后端 Worker 并存；`wrangler.jsonc` 配 **Service Binding** 指向 `jcourse-backend`。
- 环境：`API_BASE`（浏览器端公网）、Service Binding（服务端）、Turnstile site key 等走 `.dev.vars` / `wrangler secret`。
- CI：GitHub Actions（已有体系）加一条 `wrangler deploy` 前端 Worker；可与现有部署工作流并列。
- 迁移期：新前端 Worker 与旧 Pages 站点可**并行灰度**（不同子域），切流验证后再切主域。

---

## 8. 排课（Vue3）处理

- **本期**：保留现状的独立构建内嵌（最低风险），新壳里用一个路由 `schedule.tsx` 承载（iframe 或挂载点）。
- **后续**：评估原生重写为 React（统一技术栈）——单独立项，不阻塞本次重构。

---

## 9. 迁移策略（增量绞杀，不大爆炸）

1. **M0**：C3 起 RR7+Workers 骨架，`shadcn init` + tweakcn 主题、Tailwind token、QueryClient、API client、Zod schemas、Service Binding 打通。
2. **M1（SEO 关键路径先行）**：迁 **课程列表 + 课程详情**（loader SSR），灰度子域验证 Lighthouse/SEO。
3. **M2**：写/改评价（action + Turnstile）、点赞（Query 乐观更新）、筛选（Drawer + searchParams）、钱包。
4. **M3**：管理后台（dashboard blocks）、公告/维护、反馈/FAQ/关于。
5. **M4**：字体子集化、分包审计、PWA、收尾打磨；切主域，下线旧 Pages。
6. 排课按 §8 处理。

---

## 10. 工程化

- 包管理 pnpm/npm；**Biome** 或 ESLint+Prettier（统一格式，少争论）。
- 测试：**Vitest**（单元）+ **Playwright**（E2E，跑通"列表→详情→写评价"）。
- 类型：端到端 TS；Zod 既做运行时校验又导出类型。
- 目录/提交规范沿用仓库现有约定（Conventional Commits，原子提交）。

---

## 11. 里程碑与排期（粗估）

| 里程碑 | 内容 | 粗估 |
|---|---|---|
| M0 骨架 | RR7+Workers+shadcn+主题+Query+Service Binding | 1 周 |
| M1 浏览闭环(SSR) | 列表 + 详情 + 评价展示 | 1.5 周 |
| M2 互动闭环 | 写/改评价 + 点赞 + 筛选 + 钱包 | 2 周 |
| M3 后台与杂项 | admin blocks + 公告/维护 + 静态页 | 1 周 |
| M4 性能与发布 | 字体子集/分包/PWA/灰度切主域 | 1 周 |

MVP（M0–M2）≈ 4.5 周可灰度上线核心路径。

---

## 12. 风险与权衡

| 风险 | 缓解 |
|---|---|
| 视觉风格变化（玻璃→shadcn 体系） | 这是"少设计"的预期取舍；保留少量 glass 点睛；主题用品牌青色保持认知一致 |
| RR7 + Cloudflare 细节（Service Binding/Assets） | M0 先做打通 spike；用 C3 官方模板降低踩坑 |
| SSR 与 TanStack Query 双数据源易混乱 | 明确分工：loader 管首屏/SEO，Query 管客户端交互 |
| Turnstile/Captcha 在 SSR 下 | 作为客户端岛屿渲染，action 仅做服务端校验 |
| 排课不重写带来技术栈不统一 | 本期接受内嵌；后续单独立项 |
| 字体不瘦身则性能仍差 | 子集化列为 M4 必做项（非可选） |

---

## 13. 待确认问题

1. 部署形态：前端迁到 **Workers（SSR）** 可以吗？还是要继续留在 Pages？
2. 是否接受**外观换成 shadcn 设计体系**（弱化旧玻璃风）？品牌色沿用青色？
3. 是否愿意为"更省人力"考虑 **Tailwind UI（付费成品模板）**？还是仅用免费的 shadcn blocks？
4. 排课本期**保留内嵌**还是要一并重写为 React？
5. 后端是否开 **Service Binding** 给前端 Worker（同账号、更快 SSR）？
6. 是否要做 **PWA**（可安装/离线）？
7. 数据写操作统一走 **RR7 action** 还是 **TanStack Query mutation**？（建议 action 为主）

---

## 附 A：组件 → shadcn 映射速查

| 用途 | shadcn 组件 |
|---|---|
| 课程卡 | Card + Badge |
| 搜索 | Input / Command |
| 筛选面板 | Sheet / Drawer + Checkbox + Command |
| 评分 | Slider / 自定义星级 |
| 写评价表单 | Form + Textarea + Button |
| 评价 Markdown | `prose`（@tailwindcss/typography） |
| 通知/反馈 | Sonner（toast）/ Alert |
| 弹窗 | Dialog / Drawer |
| 头像 | Avatar |
| 后台列表 | data-table（TanStack Table）|
| 后台框架 | dashboard / sidebar blocks |
| 加载态 | Skeleton |

## 附 B：参考

- 本仓库 API：`docs/api.md`
- 现状选型分析与 Lighthouse 结论：见会话记录 / PR #65
- React Router（framework mode）、Cloudflare C3 模板、shadcn/ui blocks、tweakcn 主题生成器、TanStack Query/Table
