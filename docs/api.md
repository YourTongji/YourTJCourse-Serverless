# API 参考

当前后端基于 Cloudflare Workers + Hono，生产 API 地址为 `https://jcourse.yourtj.de`。

## 认证

- 公开接口无需认证。
- 管理接口统一挂在 `/api/admin` 下，需要 `x-admin-secret` 请求头。
- 写评价和编辑本人评价需要通过 TongjiCaptcha；启动页验证使用 Cloudflare Turnstile。

## 公开接口

### 运行状态与设置

```http
POST /api/startup/verify
GET /api/settings/show_icu
GET /api/settings/runtime-state
GET /api/settings/announcements
GET /api/settings/maintenance
GET /api/departments
```

`/api/settings/show_icu` 返回乌龙茶/ICU 导入数据是否对普通用户可见：

```json
{ "show_icu": true }
```

### 课程列表

```http
GET /api/courses
```

常用查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `q` | string | 空 | 关键词，匹配课程代码、课程名、教师名和搜索关键词 |
| `departments` | string | 空 | 开课单位，多个值用英文逗号分隔 |
| `onlyWithReviews` | boolean | false | 只显示有评价的课程 |
| `courseName` | string | 空 | 高级检索：按一系统课程名筛选 |
| `courseCode` | string | 空 | 高级检索：按课程号或课程别名筛选 |
| `teacherName` | string | 空 | 高级检索：按一系统教师姓名筛选 |
| `teacherCode` | string | 空 | 高级检索：按一系统教师工号筛选 |
| `campus` | string | 空 | 高级检索：按校区代码筛选 |
| `faculty` | string | 空 | 高级检索：按开课院系代码筛选 |
| `includeTotal` | boolean | false | 是否返回总数；开启后会额外执行计数查询 |
| `page` | number | 1 | 页码 |
| `limit` | number | 20 | 每页数量，最大 50 |

响应示例：

```json
{
  "data": [
    {
      "id": 1,
      "code": "100001",
      "name": "课程名称",
      "rating": 4.5,
      "review_count": 10,
      "is_legacy": 0,
      "teacher_name": "教师姓名",
      "department": "开课单位",
      "credit": 2,
      "semesters": ["2025-2026-1"]
    }
  ],
  "page": 1,
  "limit": 20,
  "hasMore": true
}
```

当 `includeTotal=true` 时，响应会额外包含 `total` 和 `totalPages`。

### 课程详情

```http
GET /api/course/:id
GET /api/course/:id/related
GET /api/course/by-code/:code
```

- `/api/course/:id` 返回课程信息、评价、点赞状态和相关基础信息；带 `walletUserHash` 查询参数时，会在属于该钱包的评价上返回 `can_edit: true`，但不会暴露内部钱包字段。
- `/api/course/:id/related` 返回同教师其他课程、同课程其他教师的简要信息。
- `/api/course/by-code/:code` 给排课模拟器弹窗使用，支持 `teacherName`、`teacherCode`、`clientId` 查询参数。
- 当管理员关闭乌龙茶/ICU 数据显示时，`is_icu=1` 的课程和评价会被隐藏。

### 评价

```http
POST /api/review
PUT /api/review/:id
POST /api/review/:id/report
POST /api/review/:id/like
DELETE /api/review/:id/like
```

提交评价请求体示例：

```json
{
  "course_id": 1,
  "rating": 5,
  "comment": "评价内容",
  "semester": "2025-2026-1",
  "turnstile_token": "TongjiCaptcha token",
  "reviewer_name": "昵称，可选",
  "reviewer_avatar": "头像 URL，可选",
  "walletUserHash": "积分钱包用户哈希，可选"
}
```

点赞接口需要传入 `clientId`，后端会结合请求信息派生服务端识别键，避免直接信任前端指纹：

```json
{ "clientId": "browser-client-id" }
```

当前没有点踩接口。取消点赞使用 `DELETE /api/review/:id/like`。

举报接口用于 App Store UGC 合规，`reason` 支持 `spam`、`harassment`、`misinformation`、`other`：

```json
{ "reason": "spam", "clientId": "browser-client-id" }
```

同一服务端派生客户端对同一评价重复举报会更新原因与时间，不会重复创建多条记录。

## 排课模拟器接口

排课模拟器使用一系统同步后的 PK 数据表，主要接口如下：

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/getAllCalendar` | GET | 学期列表 |
| `/api/getAllCampus` | GET | 校区列表 |
| `/api/getAllFaculty` | GET | 开课院系列表 |
| `/api/findGradeByCalendarId` | POST | 查询某学期可选年级 |
| `/api/findMajorByGrade` | POST | 查询某年级专业 |
| `/api/findCourseByMajor` | POST | 查询专业课表课程 |
| `/api/findOptionalCourseType` | POST | 查询通识/选修课类型 |
| `/api/findCourseByNatureId` | POST | 按课程性质查询课程 |
| `/api/findCourseDetailByCode` | POST | 按课程号查询教学班详情 |
| `/api/findCourseBySearch` | POST | 高级检索课程 |
| `/api/findCourseByTime` | POST | 按时间段查询课程 |
| `/api/getLatestUpdateTime` | GET | 获取一系统同步日期 |
| `/api/getLatestCourseInfo` | POST | 查询最新课程详情 |

## 管理接口

所有管理接口都需要 `x-admin-secret`。

### 评价管理

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/admin/reviews` | GET | 分页查询评价，支持 `q`、`page`、`limit` |
| `/api/admin/review/:id` | PUT | 编辑评价内容、评分、昵称和头像 |
| `/api/admin/review/:id/toggle` | POST | 切换评价隐藏状态 |
| `/api/admin/review/:id` | DELETE | 删除评价 |

### 课程管理

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/admin/courses` | GET | 分页查询课程，支持 `q`、`page`、`limit` |
| `/api/admin/course` | POST | 新增课程 |
| `/api/admin/course/:id` | PUT | 编辑课程 |
| `/api/admin/course/:id` | DELETE | 删除课程及关联评价、别名 |

### 设置与同步

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/admin/settings` | GET | 获取所有设置 |
| `/api/admin/settings/:key` | PUT | 更新设置 |
| `/api/admin/pk/sync` | POST | 手动触发一系统排课数据同步 |

`/api/admin/pk/sync` 请求体支持 `calendarId` 和可选 `depth`。生产环境通常通过 GitHub Actions 的 `Sync Onesystem (Login) To D1` 工作流触发。

## 数据可见性

- `is_legacy` 标记历史导入数据。
- `is_icu` 标记乌龙茶/ICU 来源数据。
- `show_legacy_reviews` 设置关闭时，用户侧会过滤 `is_icu=1` 的课程和评价。
- 课程代码包含 `AUTO` 的旧版自动文档类历史数据会被后端兜底过滤。
