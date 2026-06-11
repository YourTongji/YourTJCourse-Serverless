# 排课模拟器 · 原生 React 重写方案

> 状态：草案 v1  
> 日期：2026-06-09  
> 目标：用 React + shadcn/ui + Zustand + dnd-kit 重写 Vue 3 排课模拟器，替代当前 iframe 内嵌，融入 React Router v7 架构。

---

## 1. 决策总结

| 决策项 | 选择 | 理由 |
|---|---|---|
| UI 库 | **shadcn/ui** (不引入 antd) | 项目已有 21 个 shadcn 原语；antd 会引入 ~2MB 依赖且视觉风格不一致 |
| 数据表格 | **TanStack Table** | 课程列表/班级详情/必修选修表格均用 TanStack Table，shadcn 有官方 data-table 范例 |
| 状态管理 | **Zustand** | 替代 Vuex，类型安全、无样板代码、天然支持 selector 分片订阅 |
| 拖拽 | **@dnd-kit**（基线后增量） | 基线先用点击选课（1:1 迁移植 Vue），完成后增量添加拖拽 |
| 路由 | 单路由 `/schedule`，完整页面 | 已存在路由，Layout 包裹（有导航栏/Footer），全屏沉浸体验 |
| 移动端 | Tab 布局（课表/选课/详情） | 迁移 Vue 的三 Tab 设计，桌面端左右两栏 |
| 评价 | **复用**课程详情页 ReviewCard 组件 | Milestone 3 的 ReviewCard 已在建设中，排课评价抽屉复用该组件 |
| 智能同步 | **简化版** | 保留数据过期检测 + 一键同步；去掉复杂的冲突自动检测（用户手动处理冲突） |

---

## 2. 里程碑重排（7 Milestones）

在原 `docs/frontend-refactor-proposal.md` 的 6 个里程碑间插入新 M2，原有 M2–M6 顺延为 M3–M7：

| Milestone | 内容 | 估算 |
|---|---|---|
| **M1** Infrastructure | Root layout, API 层, 公告/维护系统, QueryClient, Zod schemas, Service Binding | 1 周 |
| **M2 (新) Scheduler** | 排课模拟器原生 React 实现 | **2 周** |
| **M3** Course Catalog | 分页课程网格, 筛选面板 | 1.5 周 |
| **M4** Course Detail | Markdown 渲染, 相关课程, AI 摘要, 分享预览 | 1.5 周 |
| **M5** Write Review | Markdown 编辑器, 模板, 草稿, 人机验证 | 2 周 |
| **M6** Admin Panel | 后台 CRUD | 1 周 |
| **M7** Polish | 引导 Tour, 响应式, 边界情况, 字体子集化, PWA | 1 周 |

**M2 依赖**：M1（API 客户端、Layout、TanStack Query 基础设施）。  
**M2 不依赖** M3–M6（课程目录/详情/评价/后台），可并行开发。

---

## 3. 组件分解

```
frontend/app/
├── routes/
│   └── schedule.tsx                    # 路由页面，编排器（替代 App.vue）
├── components/
│   └── schedule/
│       ├── SemesterCascader.tsx        # 学期 → 年级 → 专业 三级联动（替代 MajorInfo.vue）
│       ├── ScheduleHeader.tsx          # 顶部栏：选择器 + 导出按钮 + 同步状态（替代 MyHeader.vue）
│       ├── TimetableGrid.tsx           # 7×11/12 课表网格，点击单元格查课（替代 TimeTable.vue）
│       ├── TimetableCell.tsx           # 单个课表单元格（课程块渲染、颜色哈希、长按详情）
│       ├── StagedCourseList.tsx        # 已选/备选课程列表 Table + 移动端卡片（替代 CourseRoughList.vue）
│       ├── ClassDetailTable.tsx        # 班级详情 Table + 移动端卡片（替代 CourseDetailList.vue）
│       ├── CoursePickerDialog.tsx      # 选课弹窗：必修/选修/高级检索三 Tab（替代 CourseOverview.vue）
│       ├── CompulsoryCourseTab.tsx     # 必修课 Tab 内表格
│       ├── OptionalCourseTab.tsx       # 选修课 Tab 内表格+类型切换
│       ├── AdvancedSearchTab.tsx       # 高级检索 Tab（替代 AdvancedSearch.vue）
│       ├── OptionalCourseSelector.tsx  # 点击课表格子后弹出的时间匹配选课（替代 OptionalCourseTimeOverview.vue）
│       ├── ReviewDrawer.tsx            # 评价抽屉（替代 CourseReviewDrawer.vue）
│       ├── MobileTimetableDetail.tsx   # 移动端长按课程块弹出详情浮层
│       ├── CreditSummary.tsx           # 学分汇总行
│       └── ExportMenu.tsx              # CSV/XLS 导出下拉菜单
├── lib/
│   └── schedule/
│       ├── store.ts                    # Zustand store（替代 Vuex store/index.ts）
│       ├── api.ts                      # PK API 调用层（替代 scheduler/src/services/api.ts）
│       ├── types.ts                    # 类型定义（替代 scheduler/src/utils/myInterface.ts）
│       ├── course-manipulate.ts        # canAddCourse / insertOccupied / deleteOccupied / isSameCourse
│       ├── timetable-utils.ts          # TimetableGrid 布局计算（rowspan、cell merge、maxRows）
│       ├── calendar.ts                 # calendarId → 11/12 节课制映射
│       ├── sync.ts                     # 简化版智能同步（数据过期检测 + 拉取最新）
│       ├── export-csv.ts               # CSV 导出（替代 csvRelated.ts, 保留 papaparse）
│       ├── export-xls.ts               # XLS 导出（替代 xlsRelated.ts, 保留 write-excel-file）
│       ├── status.ts                   # 课程状态映射（替代 statusManipulate.ts）
│       ├── responsive.ts               # useIsMobile hook（替代 responsive.ts）
│       └── hash-color.ts              # 课程名→HSL 颜色哈希（替代 TimeTable.vue 中 hashColor）
```

**总计约 26 个文件**（15 组件 + 11 工具/状态文件），预估 ~2500 行 TSX/TS。

---

## 4. Zustand Store 设计

```typescript
// lib/schedule/store.ts

interface SchedulerState {
  /* ============ 级联选择 ============ */
  calendarId: number | null;
  grade: number | null;
  major: string | null;

  /* ============ 参考数据（API 拉取，不常变） ============ */
  calendars: Calendar[];
  grades: number[];
  majors: string[];
  compulsoryCourses: CourseInfo[];     // 按年级分组的必修课
  optionalTypes: OptionalCourseType[]; // 选修课类型标签
  optionalCourses: CourseInfo[];       // 按类型分组的选修课
  searchCourses: CourseInfo[];         // 高级检索结果
  campuses: Campus[];
  faculties: Faculty[];

  /* ============ 用户选课 ============ */
  stagedCourses: StagedCourse[];       // 备选/已选课程列表
  selectedCodes: string[];             // 已确认的班级代码（带后缀 .01）

  /* ============ 课表渲染 ============ */
  timeTableData: CourseOnTable[];      // 课表上显示的课程
  occupied: OccupiedGrid;              // 12×7 三维冲突网格

  /* ============ UI 状态 ============ */
  clickedCourse: ClickedCourseInfo | null;  // 当前点击的课程
  isSyncing: boolean;
  updateTime: string;
  latestUpdateTime: string;
  isDataOutdated: boolean;

  /* ============ Actions ============ */
  // 级联选择
  selectCalendar: (id: number) => Promise<void>;
  selectGrade: (grade: number) => Promise<void>;
  selectMajor: (major: string) => void;

  // 选课操作
  stageCourses: (courseKeys: string[]) => Promise<void>;
  removeCourse: (courseCode: string) => void;
  selectClass: (classDetail: ClassDetail) => void;    // 点击班级行→尝试排课
  clickTimeCell: (day: number, section: number) => Promise<void>;  // 点击课表空格→按时间查课
  confirmSelection: () => void;      // "保存课表"→ status 1→2

  // 同步
  checkSync: () => Promise<void>;    // 检查数据是否过期
  syncLatest: () => Promise<void>;   // 拉取最新并更新

  // 持久化
  persistToStorage: () => void;      // 手动保存到 localStorage
  loadFromStorage: () => void;       // 启动时恢复

  // 导出
  exportCSV: () => void;
  exportXLS: () => void;
}
```

**与 Vuex 的关键差异**：
1. **无 mutations/getters**：Zustand 的 action 直接修改 state，getter 用 selector
2. **TanStack Query 管理 API 数据**：`calendars`/`grades`/`majors` 用 `useQuery` 而非手动存 state（但课程列表和课表数据仍需在 store 中，因为频繁修改）
3. **无 solidy/loadSolidify 命名**：用更直观的 `persistToStorage` / `loadFromStorage`
4. **合并 `smartSyncCourses` + `syncLatestData`**：简化为 `syncLatest`

---

## 5. 路由与布局

现有路由 `/schedule` 已注册，Layout 包裹提供导航栏和 Footer。

```
/schedule (schedule.tsx)
├── ScheduleHeader          # 顶部：SemesterCascader + ExportMenu + 同步状态
├── [桌面端] flex-row
│   ├── StagedCourseList    # 左栏 40%：已选课程表
│   └── ClassDetailTable    # 右栏 60%：班级详情
├── [移动端] Tabs
│   ├── 课表 Tab → TimetableGrid
│   ├── 选课 Tab → StagedCourseList
│   └── 详情 Tab → ClassDetailTable
├── TimetableGrid           # 桌面端在底部全宽，移动端在"课表"Tab
│   ├── CreditSummary       # 学分汇总行
│   └── 7×12 网格
│       └── TimetableCell[] # 每个有效课程块
├── CoursePickerDialog      # Modal：必修/选修/高级检索
├── OptionalCourseSelector  # Modal：按时间查到的课程列表
├── ReviewDrawer            # Drawer：课程评价
└── MobileTimetableDetail   # 移动端长按弹出详情浮层
```

**桌面端布局**（参考 Vue 原版）：
```
┌─────────────────────────────────────────────┐
│  ScheduleHeader: [学期▾ 年级▾ 专业▾] [导出▾] │
├──────────────────────┬──────────────────────┤
│  StagedCourseList    │  ClassDetailTable     │
│  (40%)               │  (60%)                │
│  [选择课程|保存课表]  │  班级: 课程序号/教师  │
│  表格/卡片列表       │  /校区/安排/状态       │
├──────────────────────┴──────────────────────┤
│  CreditSummary: 应修/已选 学分               │
│  TimetableGrid: 7列×12行                    │
└─────────────────────────────────────────────┘
```

---

## 6. 拖拽方案（@dnd-kit 增量）

**分两阶段交付**：

### 6.1 基线（本周交付）
**点击选课**：点击 `ClassDetailTable` 中的班级行 → 自动检测冲突 → 插入 `timeTableData`。与 Vue 原版行为一致。

### 6.2 拖拽增强（0.5 周增量，基线稳定后）
```
StagedCourseList 中的课程卡片 ──drag──→ TimetableGrid 中的单元格
```

**dnd-kit 组件映射**：
| dnd-kit 概念 | 对应组件 |
|---|---|
| `DndContext` | `schedule.tsx` 根 |
| `useDraggable` | `StagedCourseList` 中每个课程卡片 |
| `useDroppable` | `TimetableGrid` 中每个未占用的 `<td>` 单元格 |
| `DragOverlay` | 拖拽时的课程卡片预览 (ghost) |
| `onDragEnd` | 触发 `canAddCourse` 冲突检测 → 成功插入或显示冲突提示 |

**交互细节**：
- 拖拽时高亮可放置的格子（绿色边框），冲突格子显示红色
- 松开后若冲突，显示 toast 提示 "与 XXX 课程冲突"，课程卡回弹
- 保留点击选课作为备选（无障碍 + 移动端不支持拖拽）
- 不支持课表格间拖拽（swap/reposition）：复杂度高，收益低

---

## 7. 冲突检测逻辑（1:1 移植）

核心算法不变，从 `course-manipulate.ts` 直接移植：

```
canAddCourse(arrangementInfo, occupied, code):
  1. 检查 occupied 中是否已有相同课号的课 → 存在则递归删除旧的后重试
  2. 遍历 arrangementInfo 的每个时间段：
     - 对每个 (day, timeSlot)，检查 occupied[timeSlot][day] 中
       是否有 item.occupyWeek 与当前课程 arrangement.occupyWeek 有交集
     - 有交集 → 返回 { canAdd: false, collideCourse }
  3. 全部通过 → 返回 { canAdd: true }
```

关键类型（从 Vue 接口移植）：

```typescript
interface OccupyCell {
  code: string;        // 课程班号 "XM104032.01"
  courseName: string;
  occupyWeek: number[]; // [1,2,3,...,16]
}

// occupied[timeSlot][day] = OccupyCell[]
type OccupiedGrid = OccupyCell[][][];

interface CourseOnTable {
  showText: string;
  courseName: string;
  code: string;
  occupyTime: number[];  // [3,4,5]
  occupyDay: number;     // 1-7
}

interface ClassDetail {
  code: string;
  campus: string;
  arrangementInfo: ArrangementInfo[];
  teachers: Teacher[];
  teachingLanguage: string;
  status: number;        // 0=未选, 1=备选, 2=已选
}
```

---

## 8. 数据流

```
┌──────────────────────────────────────────────────────┐
│                  TanStack Query 层                    │
│  useQuery(["scheduler", "calendars"])                │
│  useQuery(["scheduler", "grades", calendarId])       │
│  useQuery(["scheduler", "majors", calendarId,grade]) │
│  useQuery(["scheduler", "campus"])                   │
│  useQuery(["scheduler", "faculty"])                  │
│  (这些数据变化少，缓存时间设长)                        │
├──────────────────────────────────────────────────────┤
│                  Zustand Store（可变状态）              │
│  stagedCourses[] ← stageCourses action               │
│  timeTableData[] ← selectClass action + canAddCourse │
│  occupied[12][7][] ← insertOccupied / deleteOccupied  │
│  clickedCourse ← 用户交互                             │
│  持久化：localStorage                                 │
├──────────────────────────────────────────────────────┤
│              API 层（直接 fetch）                      │
│  findCourseByMajor / findCourseByNatureId             │
│  findCourseDetailByCode / findCourseByTime            │
│  findCourseBySearch / getLatestUpdateTime             │
│  getLatestCourseInfo                                  │
│  (这些在 action 中调用，结果写入 store)                │
└──────────────────────────────────────────────────────┘
```

**为什么课程列表不走 TanStack Query？** 因为用户频繁修改 `stagedCourses`、`timeTableData`、`occupied`，这些数据在 Zustand 中作为一个事务整体更合适。TanStack Query 只管理"参考数据"（学期列表、校区、院系），这些数据一次拉取、长期有效。

---

## 9. 本地持久化

替换 Vue 的 `localStorage` 直接读写，改用 **Zustand persist middleware**：

```typescript
import { persist } from "zustand/middleware";

export const useSchedulerStore = create<SchedulerState>()(
  persist(
    (set, get) => ({
      // ... state + actions
    }),
    {
      name: "scheduler-storage",
      partialize: (state) => ({
        calendarId: state.calendarId,
        grade: state.grade,
        major: state.major,
        stagedCourses: state.stagedCourses,
        selectedCodes: state.selectedCodes,
        timeTableData: state.timeTableData,
        occupied: state.occupied,
        updateTime: state.updateTime,
      }),
      // 启动时恢复后触发 checkSync
    }
  )
);
```

无需手写 `sanitizeStagedCourse` 等反序列化函数——Zustand persist 使用 `JSON.parse`，结合 TypeScript 类型在恢复后做一次轻量校验。

---

## 10. 新增依赖

```json
{
  "dependencies": {
    "zustand": "^5.x",                  // 状态管理 (~1.5KB gzipped)
    "@dnd-kit/core": "^6.x",            // 拖拽核心 (M2.2 增量)
    "@dnd-kit/utilities": "^3.x",       // 拖拽工具函数
    "@tanstack/react-table": "^8.x",    // 课程列表表格 (M3 也需要)
    "papaparse": "^5.x",                // CSV 导出
    "write-excel-file": "^4.x",         // XLS 导出
    "marked": "^12.x",                  // Markdown 渲染（评价内容）
    "dompurify": "^3.x"                 // Markdown XSS 防护
  },
  "devDependencies": {
    "@types/papaparse": "^5.x"
  }
}
```

- `zustand`：**新引入**，专为排课模块
- `@dnd-kit/*`：**新引入**，M2.2 拖拽增量
- `@tanstack/react-table`：M3 也需要，在 M2 先安装
- `papaparse` / `write-excel-file` / `marked` / `dompurify`：从 Vue 项目移植

---

## 11. API 端点清单（13 个，无后端改动）

| API | 方法 | 用途 | 对应 Vue 函数 |
|---|---|---|---|
| `/api/getAllCalendar` | GET | 学期列表 | `getAllCalendar` |
| `/api/findGradeByCalendarId` | POST | 年级列表 | `findGradeByCalendarId` |
| `/api/findMajorByGrade` | POST | 专业列表 | `findMajorByGrade` |
| `/api/findCourseByMajor` | POST | 必修课程 | `findCourseByMajor` |
| `/api/findOptionalCourseType` | POST | 选修课类型标签 | `findOptionalCourseType` |
| `/api/findCourseByNatureId` | POST | 选修课程列表 | `findOptionalCourseByNatureId` |
| `/api/findCourseDetailByCode` | POST | 课程班级详情 | `findCourseDetailByCode` |
| `/api/findCourseByTime` | POST | 按时段查课 | `findCourseByTime` |
| `/api/findCourseBySearch` | POST | 高级检索 | `findCourseBySearch` |
| `/api/getAllCampus` | GET | 校区列表 | `getAllCampus` |
| `/api/getAllFaculty` | GET | 院系列表 | `getAllFaculty` |
| `/api/getLatestUpdateTime` | GET | 最新数据时间 | `getLatestUpdateTime` |
| `/api/getLatestCourseInfo` | POST | 获取课程最新信息 | `getLatestCourseInfo` |

---

## 12. 与现有前端的关系

### 12.1 课程评价复用
排课模块的 `ReviewDrawer` 将复用 **M4 课程详情页的 `ReviewCard` 组件**。但 M2 在 M4 之前交付，因此在 M2 先做一个**简化版 ReviewDrawer**（无点赞交互、纯列表展示），M4 完成后再升级为复用 `ReviewCard`。

### 12.2 shadcn/ui 组件需求
M2 需要的新 shadcn 组件（在现有 21 个之外）：

| 组件 | 用途 | 生成命令 |
|---|---|---|
| `table` | TanStack Table 的样式容器 | `npx shadcn add table` |
| `tabs` | 移动端三 Tab / 选课弹窗 Tab | `npx shadcn add tabs` |
| `radio-group` | 必修/选修/检索 切换 | `npx shadcn add radio-group` |
| `select` | SemesterCascader 下拉 | `npx shadcn add select` |
| `drawer` | 评价抽屉 | `npx shadcn add drawer` |
| `tooltip` | 学分提示、导出提示 | `npx shadcn add tooltip` |
| `scroll-area` | 课程列表滚动区 | `npx shadcn add scroll-area` |
| `sonner` | Toast 通知（冲突提示、成功提示） | `npx shadcn add sonner` |

### 12.3 iframe 回收
M2 完成后：
1. 删除 `frontend/public/scheduler/.gitkeep` 及 iframe 相关静态文件
2. `frontend/app/routes/schedule.tsx` 替换为 React 实现
3. `scheduler/` 目录保留为参考但标记 deprecated

---

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 冲突检测算法移植出错 | 从 `course-manipulate.ts` 逐行移植并加单元测试 |
| Zustand persist 反序列化兼容旧 localStorage | M1 完成后 old Vue localStorage key 不再使用，新 key 为 `scheduler-storage` |
| dnd-kit 学习曲线 | M2 基线不启用拖拽，点击选课优先交付；拖拽作为增量 |
| 移动端体验退化 | 严格参照 Vue 移动端三 Tab 布局 + 长按详情 |
| 评价组件未就绪（M2 在 M4 前） | M2 先做简化版 ReviewDrawer（纯列表），M4 后升级 |
| 13 个 API 端点调通耗时长 | API 层从 `scheduler/src/services/api.ts` 逐函数移植，参数格式不变 |

---

## 14. 文件清单（创建 + 修改）

### 新建文件（26 个）

| 路径 | 说明 |
|---|---|
| `app/components/schedule/ScheduleHeader.tsx` | 顶部栏：级联选择器 + 导出 + 同步状态 |
| `app/components/schedule/SemesterCascader.tsx` | 学期→年级→专业 三级联动 |
| `app/components/schedule/TimetableGrid.tsx` | 7×N 课表网格主体 |
| `app/components/schedule/TimetableCell.tsx` | 单个课程块渲染 |
| `app/components/schedule/StagedCourseList.tsx` | 已选/备选课程 Table+卡片 |
| `app/components/schedule/ClassDetailTable.tsx` | 班级详情 Table+卡片 |
| `app/components/schedule/CoursePickerDialog.tsx` | 选课弹窗框架（三Tab） |
| `app/components/schedule/CompulsoryCourseTab.tsx` | 必修课 Tab |
| `app/components/schedule/OptionalCourseTab.tsx` | 选修课 Tab |
| `app/components/schedule/AdvancedSearchTab.tsx` | 高级检索 Tab |
| `app/components/schedule/OptionalCourseSelector.tsx` | 按时间选课弹窗 |
| `app/components/schedule/ReviewDrawer.tsx` | 评价抽屉（兼容移动端扇面卡片） |
| `app/components/schedule/MobileTimetableDetail.tsx` | 移动端长按弹出详情 |
| `app/components/schedule/CreditSummary.tsx` | 学分汇总行 |
| `app/components/schedule/ExportMenu.tsx` | 导出下拉 |
| `app/lib/schedule/store.ts` | Zustand store |
| `app/lib/schedule/api.ts` | PK API 调用 |
| `app/lib/schedule/types.ts` | 类型定义 |
| `app/lib/schedule/course-manipulate.ts` | 冲突检测核心 |
| `app/lib/schedule/timetable-utils.ts` | 课表布局工具 |
| `app/lib/schedule/calendar.ts` | calendarId → 行数映射 |
| `app/lib/schedule/sync.ts` | 智能同步 |
| `app/lib/schedule/export-csv.ts` | CSV 导出 |
| `app/lib/schedule/export-xls.ts` | XLS 导出 |
| `app/lib/schedule/status.ts` | 课程状态工具 |
| `app/lib/schedule/hash-color.ts` | 课程名→HSL 颜色 |

### 修改文件（3 个）

| 路径 | 改动 |
|---|---|
| `frontend/app/routes/schedule.tsx` | 替换 iframe 为 React 实现 |
| `frontend/package.json` | 添加 zustand, @dnd-kit/*, papaparse, write-excel-file, marked, dompurify |
| `frontend/app/app.css` | 无额外 CSS（全部用 Tailwind + shadcn token） |

### 删除文件

| 路径 | 说明 |
|---|---|
| `frontend/public/scheduler/.gitkeep` | 不再需要 iframe 静态资源目录 |

---

## 15. 内部分阶段（Scheduler 模块内部）

| Phase | 内容 | 天数 |
|---|---|---|
| **P1: 核心引擎** | Zustand store + types + API 层 + conflict detection + localStorage persist | 3 天 |
| **P2: 课表网格** | TimetableGrid + TimetableCell + CreditSummary + 颜色哈希 | 2 天 |
| **P3: 选课流程** | CoursePickerDialog（三Tab）+ OptionalCourseSelector + StagedCourseList + ClassDetailTable + 点击选课 | 3 天 |
| **P4: 套壳与导出** | ScheduleHeader + ReviewDrawer + ExportMenu + schedule.tsx 编排 | 1.5 天 |
| **P5: 移动端** | Tabs 布局 + MobileTimetableDetail + 响应式适配 | 1.5 天 |
| **P6: 同步与打磨** | 智能同步 + 边界情况 + 错误处理 | 1 天 |
| **P7: 拖拽增量** | @dnd-kit 集成（完成后） | 2 天 |

**总计：P1–P6 = 12 天 (≈2 周)，P7 = 2 天增量。**

---

## 16. 备选方案（已拒绝）

| 方案 | 拒绝原因 |
|---|---|
| 引入 antd 做 1:1 移植 | 重复依赖（~2MB），与 shadcn 视觉冲突，后续维护两套组件体系 |
| 使用 Jotai 替代 Zustand | Zustand 对复杂状态的 middleware（persist, devtools）支持更成熟 |
| 拖拽课表格间 swap | 无用户需求，增加冲突检测复杂度，移动端不适用 |
| 排课作为 Modal/Overlay | 交互太复杂不适合浮层，全屏体验更好 |
| 完整移植 Vue smart sync（冲突自动检测+合并） | ~620 行复杂逻辑，收益有限；用户手动处理冲突更可控 |
| 使用 react-beautiful-dnd 替代 @dnd-kit | rbd 已停止维护，dnd-kit 是 React 社区标准 |

---

## 17. 待确认

1. **拖拽优先级**：P7 拖拽增量是否本期做，还是延后？
2. **ReviewCard 复用路径**：M4 的 `ReviewCard` 组件导出路径确认后，ReviewDrawer 即可升级
3. **Service Binding**：排课的 13 个 API 端点走浏览器端公网还是 Service Binding？——建议浏览器端直连（数据量大、用户交互频繁，SSR 不参与）

---

## 附 A：Zustand Store Action 伪代码（关键流程）

```typescript
// selectClass: 点击班级行 → 排课
selectClass: (classDetail: ClassDetail) => {
  const { clickedCourse, occupied } = get();
  const result = canAddCourse(classDetail.arrangementInfo, occupied, classDetail.code);
  
  if (!result.canAdd) {
    toast.error(`与「${result.collideCourse}」冲突`);
    return;
  }
  
  // 相同课号旧课程替换
  const existing = get().timeTableData.filter(t => isSameCourse(t.code, classDetail.code));
  if (existing.length > 0) {
    set(s => ({ timeTableData: s.timeTableData.filter(t => !isSameCourse(t.code, classDetail.code)) }));
    deleteOccupied(occupied, existing[0].code);
  }
  
  // 插入课表
  const newEntries: CourseOnTable[] = classDetail.arrangementInfo.map(arr => ({
    showText: `${arr.teacherAndCode} ${clickedCourse!.courseName}(${classDetail.code}) ${arr.arrangementText}`,
    courseName: clickedCourse!.courseName,
    code: classDetail.code,
    occupyTime: arr.occupyTime,
    occupyDay: arr.occupyDay,
  }));
  
  set(s => ({ timeTableData: [...s.timeTableData, ...newEntries] }));
  insertOccupied(occupied, classDetail.arrangementInfo, classDetail.code, clickedCourse!.courseName);
  classDetail.status = 1;
  
  // 更新 stagedCourses 状态
  const baseCode = classDetail.code.slice(0, -3);
  set(s => ({
    stagedCourses: s.stagedCourses.map(c =>
      c.courseCode === baseCode ? { ...c, status: 1, teacher: classDetail.teachers } : c
    ),
  }));
}
```

---

## 附 B：TimetableGrid 渲染算法（1:1 移植 TimeTable.vue updateTimeTable）

```
1. 取 maxRows = calendarId >= 120 ? 11 : 12
2. 按 occupyTime.length 降序排列课程（长课程优先）
3. 对每个课程：
   a. 找到其 startRow, dayIndex
   b. 检查是否有已存在的单元格时间范围完全覆盖当前课程 → 合并
   c. 若无覆盖 → 创建新单元格，记录时间范围
4. 计算 rowspan：每个单元格 = 该格内最长课程的 occupyTime.length
5. 标记 occupied[timeSlot][day] = true（用于后续行的 colspan 隐藏）
```

---

## 附 C：与原始 Proposal 的 diff 摘要

| 项目 | 原始 Proposal (§8, §9, §11) | 本方案 |
|---|---|---|
| 排课实现 | iframe 内嵌 Vue3 独立构建 | 原生 React 实现 |
| 状态管理 | 无（Vuex 在外壳） | Zustand（同壳） |
| 路由 | `/schedule` 为 iframe 容器 | `/schedule` 为 React 组件树 |
| 里程碑 | 6 个，排课延后 | 7 个，排课为 M2 |
| 技术栈统一 | 否（Vue3 + React 混合） | 是（全 React） |
| iframe 通信 | 无 | 不需要（同一进程） |
