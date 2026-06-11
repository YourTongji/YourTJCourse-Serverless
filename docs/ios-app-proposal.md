# YOURTJ 选课社区 · iOS 客户端 Proposal

> 状态：草案 v1（待评审）
> 日期：2026-06-06
> 范围：基于现有 Cloudflare Workers 后端，构建一个 Swift / SwiftUI 原生 iOS 客户端，采用 **Liquid Glass** 设计语言。不复刻网页版布局，但实现与网页版**功能一致**。

---

## 1. 背景与目标

现有产品是基于 Cloudflare Workers + D1 + Pages 的选课点评社区（Web）。后端已经提供了一套完整、稳定、对原生客户端友好的 REST API（公开接口无需鉴权、纯 HTTPS、无浏览器 CORS 约束），非常适合直接被原生 App 复用。

**目标**

1. 交付一个原生 iOS App，覆盖网页版核心用户旅程：浏览/搜索课程 → 看评价 → 发评价/编辑/点赞 → 积分钱包 → 排课模拟。
2. 采用 iOS 26 的 Liquid Glass 设计语言，做出"原生感、轻盈、有层次"的体验，而非把网页直接套壳（WebView）。
3. **复用现有后端**，不为 iOS 单独造一套服务；仅在必要处（人机验证桥接、内容举报）做小幅后端补强。
4. 在客户端侧顺手修复 Web 端的一个已知隐患：钱包助记词/密钥改用 Keychain 安全存储（对应 Web issue #15 的明文 localStorage 问题）。

**非目标**

- 不做管理后台（`/api/admin/*`）的原生界面（运营仍走 Web）。
- 不在首版追求与网页像素级一致；以 iOS HIG + Liquid Glass 为准。

---

## 2. 功能对齐与范围

| 能力 | 网页版现状 | iOS 对应端点 | 优先级 |
|---|---|---|---|
| 启动人机验证闸门 | Cloudflare Turnstile（action `startup_gate`） | `POST /api/startup/verify` | P0 |
| 课程浏览 / 分页 / 会话级随机 | 首页 `Courses` | `GET /api/courses` | P0 |
| 关键词搜索 | 搜索框 | `GET /api/courses?q=` | P0 |
| 高级筛选（院系/校区/课名/课号/教师/只看有评价） | `FilterPanel` | `GET /api/courses` + `GET /api/departments` | P0 |
| 课程详情 + 评价列表 + 跨学期聚合 | `Course` | `GET /api/course/:id` | P0 |
| 相关课程（同师/同课） | `Course` 底部 | `GET /api/course/:id/related` | P1 |
| 发表评价（评分/Markdown/昵称/头像/学期） | `WriteReview` | `POST /api/review` | P0 |
| 编辑本人评价（HMAC edit_token） | `WriteReview` 编辑态 | `PATCH /api/review/:id/edit-token` + `PUT /api/review/:id` | P0 |
| 点赞 / 取消点赞 | `Course` | `POST` / `DELETE /api/review/:id/like` | P0 |
| 积分钱包（创建/恢复/余额/明细/奖励） | `CreditWalletPanel` | Credit 服务（见 §5.2） | P0/P1 |
| 公告 / 维护模式 | 全局横幅 | `GET /api/settings/runtime-state` | P0 |
| 排课模拟器（选课/排课/冲突/模板） | 内嵌 Vue 子应用 | `/api/find*`、`/api/getAll*`（见 §6.6） | P1 |
| 旧乌龙茶文档 | iframe 内嵌 VitePress | `SFSafariViewController` 打开 | P2 |
| 反馈 / FAQ / 关于 | 静态页 | 原生静态页 | P2 |
| 内容举报 / 屏蔽（App Store 合规新增） | 仅管理员后台隐藏 | 需新增轻量 `report` 端点 | P0（合规必需） |

> **里程碑视角**：P0 = MVP/首个 TestFlight；P1 = 公测；P2 = 完善。

---

## 3. 技术选型

| 维度 | 选型 | 说明 |
|---|---|---|
| 语言 | **Swift 6**（strict concurrency） | 充分利用并发安全 |
| UI | **SwiftUI**（iOS 26 SDK，Xcode 26） | 原生 Liquid Glass |
| 状态管理 | **Observation**（`@Observable` / `@State` / `@Environment`） | 轻量 MV 模式，不引入第三方架构框架 |
| 异步 | **Swift Concurrency**（async/await, actors, `AsyncStream`） | 网络与数据流 |
| 网络 | **URLSession**（自封装薄客户端 `APIClient`） | 零网络依赖；尊重后端 `Cache-Control` |
| 持久化 | **Keychain**（钱包密钥）+ **SwiftData**（收藏/草稿/缓存，可选） | 安全优先 |
| 加密 | **CryptoKit**（HMAC-SHA256 计算 `edit_token`） | 与后端算法对齐 |
| Markdown | **swift-markdown-ui**（或自研 `AttributedString` 渲染） | 原生渲染，天然规避 HTML/XSS |
| 人机验证 | **WKWebView 桥接**（Turnstile / TongjiCaptcha 无原生 SDK） | 见 §6.5 与 §11 风险 |
| 依赖管理 | **Swift Package Manager** | |
| 测试 | **Swift Testing** + XCTest（UI） | |
| 最低系统 | **iOS 26+**（推荐）/ 可选兼容 iOS 18 | 见 §7.4 决策点 |

---

## 4. 总体架构

分层（自上而下，单向依赖）：

```
App            App 入口、Scene、根 TabView、启动闸门、全局环境注入
 └─ Features   按页面/领域分模块（Catalog / CourseDetail / Review / Wallet / Scheduler / Settings）
     每个 Feature = View (SwiftUI) + Store (@Observable, 业务/状态) + 局部 Model
 └─ Domain     纯 Swift 领域模型与用例（Course, Review, Wallet, Semester…），不依赖 UI/网络
 └─ Data       APIClient（URLSession）、Repository（端点封装、解码、缓存）、Keychain、Credit 客户端
 └─ Platform   设计系统（Liquid Glass 组件封装）、Markdown、Captcha 桥接、工具
```

- **MV（Model-View）而非 MVVM 重型化**：用 `@Observable` 的 `Store` 持有状态与意图方法，View 直接订阅；避免样板。
- **Repository 模式**：`CourseRepository`、`ReviewRepository`、`WalletRepository` 对 View 屏蔽端点细节，统一处理分页、缓存、错误。
- **可测试性**：Repository 以协议注入，便于用 mock 做单测；Domain 层纯函数（如跨学期聚合、学期排序）直接覆盖测试。

---

## 5. 后端 API 复用

### 5.1 主后端（评课 + 排课）

- Base：`https://jcourse.yourtj.de`
- 公开接口**无需鉴权**，原生 HTTP 客户端不受浏览器 CORS 限制，可直接调用。
- 缓存：后端对 `GET /api/courses`、`/api/course/:id`、`/api/settings/*` 等返回了 `Cache-Control`（含 `s-maxage` / `stale-while-revalidate`）。客户端配置 `URLCache` + `URLSession`（`.useProtocolCachePolicy`）即可获得"二次进入秒开"。

端点清单见 [docs/api.md](./api.md)，本 App 使用的子集：

- 运行状态：`POST /api/startup/verify`、`GET /api/settings/runtime-state`、`GET /api/settings/show_icu`、`GET /api/departments`
- 课程：`GET /api/courses`、`GET /api/course/:id`、`GET /api/course/:id/related`、`GET /api/course/by-code/:code`
- 评价：`POST /api/review`、`PATCH /api/review/:id/edit-token`、`PUT /api/review/:id`、`POST|DELETE /api/review/:id/like`
- 排课：`/api/getAllCalendar`、`/api/getAllCampus`、`/api/getAllFaculty`、`/api/findGradeByCalendarId`、`/api/findMajorByGrade`、`/api/findCourseByMajor`、`/api/findOptionalCourseType`、`/api/findCourseByNatureId`、`/api/findCourseDetailByCode`、`/api/findCourseBySearch`、`/api/findCourseByTime`、`/api/getLatestUpdateTime`、`/api/getLatestCourseInfo`

### 5.2 积分服务（Credit）

- Base：`https://core.credit.yourtj.de`（Web 端 `CREDIT_API_BASE`）
- 钱包：`POST /api/wallet/register`（`{userHash, userSecret}`）、`GET /api/wallet/{userHash}/balance`、`GET /api/wallet/summary?userHash=…`
- 积分联动（发评价奖励、点赞事件）由**主后端服务端**调用 Credit，客户端只需在发评价时携带 `walletUserHash`，无需直连积分发放接口。

---

## 6. 关键功能设计

### 6.1 启动闸门
App 冷启动先拉 `runtime-state`：维护模式 → 展示维护页；否则在首屏用 WKWebView 拉起 Turnstile（action `startup_gate`），拿到 token 调 `POST /api/startup/verify` 通过后进入主界面。token 校验失败给出重试。

### 6.2 课程浏览 / 搜索 / 筛选
- 列表用 `List`/`LazyVGrid`，分页基于 `page`/`limit`/`hasMore`（首屏 `includeTotal=true` 取总数）。
- 搜索用 SwiftUI `.searchable`（自动 Liquid Glass 搜索条），输入做 300ms debounce。
- 筛选用 `.sheet` 弹出 Liquid Glass 面板：院系（`/api/departments`）、校区、课名/课号/教师/只看有评价；与列表查询参数一一对应。
- 会话级随机：复刻 Web 的 `shuffleCoursesForSession`（无关键词/无筛选的首页首屏按会话 seed 稳定打散）。

### 6.3 课程详情 + 评价
- `GET /api/course/:id`（带 `clientId` 时返回 `liked`）渲染课程信息、跨学期聚合的评价列表、学期标签。
- 评价正文用原生 Markdown 渲染（**不使用 WebView**，从根上规避评论 XSS）。
- 相关课程区调用 `/api/course/:id/related`。

### 6.4 发表 / 编辑评价
- 评分 0–5、Markdown 正文、昵称/头像（可选）、学期。客户端做与服务端一致的校验（rating 钳制、长度上限）。
- **编辑鉴权（与后端对齐）**：评价发表后，用钱包 `userSecret` 计算
  `edit_token = HMAC-SHA256(userSecret, "jcourse:edit-review:" + reviewId)`，
  通过 `PATCH /api/review/:id/edit-token` 绑定；后续 `PUT /api/review/:id` 携带该 token 鉴权（换设备恢复助记词即可重算同一 token，无需服务器存私钥）。

```swift
import CryptoKit

func editToken(reviewId: Int, userSecret: String) -> String {
    let key = SymmetricKey(data: Data(userSecret.utf8))
    let msg = Data("jcourse:edit-review:\(reviewId)".utf8)
    let mac = HMAC<SHA256>.authenticationCode(for: msg, using: key)
    return mac.map { String(format: "%02x", $0) }.joined()
}
```

### 6.5 人机验证（关键集成点）
Turnstile / TongjiCaptcha 均为 Web 组件，无原生 SDK。方案：用 `WKWebView` 承载一张极简验证页 → 通过 `WKScriptMessageHandler` 把 token 回传原生 → 原生带 token 调对应接口。封装成可复用的 `CaptchaView`（SwiftUI `UIViewRepresentable`）。**这是首版最大不确定项**（见 §11）。

### 6.6 排课模拟器（P1，原生重写）
复用全部 `/api/find*`、`/api/getAll*` 数据接口；在原生侧重做：周课表网格、加退课、时间冲突检测、跨学科/通识标记、模板保存（SwiftData）。复杂度较高，列为公测阶段目标，不进 MVP。

### 6.7 公告 / 维护 / 旧文档
- 公告与维护态来自 `runtime-state`，用顶部 Liquid Glass 横幅展示。
- 旧乌龙茶文档（VitePress 站）用 `SFSafariViewController` 打开，不内嵌重渲染。

---

## 7. Liquid Glass UI 设计

### 7.1 信息架构（底部 TabView）
`课程`（Catalog）｜`排课`（Scheduler）｜`我的`（钱包/积分/我的评价）｜`更多`（公告/反馈/FAQ/关于）。
采用 iOS 26 新版浮动玻璃 TabBar，配合 `tabBarMinimizeBehavior(.onScrollDown)` 在滚动时收起，让内容成为主角。

### 7.2 用法与原则
- **玻璃只用于"导航/控件层"**：TabBar、Toolbar、搜索条、浮动操作按钮、Sheet 把手——内容卡片以实色 + 柔和阴影为主，避免"满屏玻璃"导致的廉价感（遵循 Apple HIG）。
- 关键 API：
  - `.glassEffect(.regular.tint(.cyan).interactive(), in: .rect(cornerRadius: 24))` —— 悬浮控件/胶囊按钮。
  - `GlassEffectContainer(spacing:)` 包裹一组玻璃元素，获得正确的融合与形变渲染。
  - `@Namespace` + `.glassEffectID(_:in:)` —— 例如"搜索按钮 → 展开为搜索面板"的 morph 过渡。
  - `Button(…).buttonStyle(.glass)` / `.glassProminent` —— 主次按钮。
  - Toolbar / `.sheet` / `.presentationDetents` 在 iOS 26 自动获得玻璃材质。
  - `.backgroundExtensionEffect()` —— 课程详情头图向状态栏/侧边自然延展。
- 品牌色沿用网页的青色系（cyan）作为玻璃 tint 与强调色，保持跨端一致认知。

### 7.3 无障碍与回退
尊重"减弱透明度 / 增强对比度 / 减弱动态效果"系统开关——系统会自动将 Liquid Glass 降级为更不透明的材质；自定义玻璃组件需用 `accessibilityReduceTransparency` 等环境值提供回退底色，保证对比度达标。

### 7.4 部署目标（决策点）
- **方案 A（推荐）**：最低 iOS 26，全面 Liquid Glass，代码最简洁。
- **方案 B**：最低 iOS 18，iOS 26 上启用 Liquid Glass、iOS 18 用 `if #available` 回退到 `.ultraThinMaterial` 等既有材质，覆盖面更广但维护成本更高。
> 取决于目标用户的系统分布（校园用户升级通常较快，倾向 A）。**待产品确认**。

---

## 8. 安全与隐私

- **钱包密钥入 Keychain**：`userSecret` 与助记词存 Keychain（可选 `.biometryCurrentSet` 生物识别保护），**修复 Web 端 issue #15（助记词明文存 localStorage）**。
- **评论原生渲染**：用 `AttributedString`/swift-markdown-ui 渲染，不经 WebView/HTML，天然无评论 XSS 面。
- **编辑鉴权**：复用后端 HMAC `edit_token` 机制，客户端本地计算，私钥不出设备。
- **ATS**：全程 HTTPS（后端满足）；不在 `Info.plist` 放宽 ATS。
- **最小数据**：默认匿名，不采集设备指纹；点赞 `clientId` 用本地生成的随机 UUID（后端会再派生服务端键）。
- **App Store UGC 合规（Guideline 1.2，必做）**：内置评价**举报**入口、**屏蔽**作者/隐藏单条、用户协议（EULA）与社区规范。建议后端新增轻量 `POST /api/review/:id/report`，并在 24h 内有人工/规则处置流程。

---

## 9. 数据、缓存与离线

- 网络层尊重后端 `Cache-Control`，`URLCache` 提供内存+磁盘缓存。
- 课程详情、院系、设置等做短期缓存；列表分页结果按查询键缓存。
- 可选：SwiftData 存"收藏课程""评价草稿"（断网可写、联网补发）。

---

## 10. 工程化与发布

- 仓库布局建议：新增 `ios/`（独立 Xcode 工程 + SPM），与现有前后端同仓（monorepo）。
- 模块化：`Domain` / `DataKit` / `DesignSystem`（Liquid Glass 组件库）/ `App` 拆为本地 SPM 包，加速编译与复用。
- 配置：`API_BASE`、`CREDIT_API_BASE` 走 `.xcconfig`（Debug 指向本地 `wrangler dev`，Release 指向生产）。
- CI：GitHub Actions（macOS runner）跑 build + 单测；后续接 TestFlight 自动分发。
- 发布：TestFlight 内测 → App Store；隐私清单（Privacy Manifest）声明无追踪。

---

## 11. 里程碑与排期（建议）

| 里程碑 | 内容 | 粗估 |
|---|---|---|
| M0 脚手架 | 工程/SPM/设计系统骨架、APIClient、启动闸门、TabView | 1 周 |
| M1 浏览闭环 | 课程列表/搜索/筛选/详情/评价展示（只读） | 1.5 周 |
| M2 互动闭环 | Captcha 桥接、发/改评价、点赞、钱包(创建/恢复/余额) | 2 周 |
| M3 合规与打磨 | 举报/屏蔽、公告维护、无障碍、深色、空/错态、动效 | 1 周 |
| M4 排课（P1） | PK 数据接入 + 原生周课表/冲突/模板 | 2–3 周 |
| 发布 | TestFlight → App Store（含 UGC 审核材料） | 0.5 周 |

> MVP（M0–M3）≈ 5.5 周可上 TestFlight；排课作为公测增量。

---

## 12. 风险与权衡

| 风险 | 影响 | 缓解 |
|---|---|---|
| **Captcha 无原生 SDK** | 发评价/启动闸门依赖 WebView 桥接，体验与稳定性不确定 | 早做 spike；若 Turnstile 不便，评估发评价改用 App Attest / 设备校验等原生方案与后端协商 |
| Liquid Glass 仅 iOS 26+ | 覆盖面 | §7.4 选 A/B；校园用户升级快，A 风险可控 |
| 排课逻辑复杂 | 工期 | 拆到 P1；先确保数据接口可用，UI 渐进 |
| UGC 审核（1.2） | 可能被拒 | M3 必须交付举报/屏蔽/EULA；后端补 `report` 端点 |
| 后端公开写接口仅 captcha 防护 | 滥用 | 复用 Web 的限流；iOS 端不放大攻击面（不内置自动化） |
| 跨端积分一致性 | 数据 | 钱包以助记词为根，多端恢复同一身份；密钥仅本地 |

---

## 13. 待确认问题

1. **最低 iOS 版本**：iOS 26 only（方案 A）还是兼容 iOS 18（方案 B）？
2. 是否上 **App Store**（决定是否必须做举报/屏蔽/EULA），还是仅企业/TestFlight 分发？
3. **排课模拟器**是否要进 MVP，还是接受 P1？
4. 后端是否同意新增 `POST /api/review/:id/report`（合规）与少量 iOS 友好字段？
5. 品牌资产：App 图标、配色、启动图是否复用网页青色系视觉？
6. 是否需要 **iPad / Mac(Catalyst)** 适配，或仅 iPhone？
7. 是否需要推送通知（如"我的评价被点赞""新公告"）——会牵涉后端推送能力。

---

## 附：与网页版的对应关系速查

| 网页文件/能力 | iOS 模块 |
|---|---|
| `pages/Courses.tsx`（首页瀑布流/筛选） | `Features/Catalog` |
| `pages/Course.tsx`（详情+评价+点赞） | `Features/CourseDetail` |
| `pages/WriteReview.tsx`（发/改评价） | `Features/Review` |
| `components/CreditWalletPanel.tsx` | `Features/Wallet` + `Data/Keychain` |
| `scheduler/`（Vue 排课子应用） | `Features/Scheduler`（原生重写，P1） |
| `components/CollapsibleMarkdown.tsx`（DOMPurify） | `Platform/Markdown`（原生渲染，免净化） |
| 启动 Turnstile / 提交 TongjiCaptcha | `Platform/Captcha`（WKWebView 桥接） |
| `services/api.ts` / `services/credit.ts` | `Data/APIClient` / `Data/CreditClient` |
