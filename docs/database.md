# 数据库 Schema

权威结构以 `backend/schema.sql` 为准。本文只做便于阅读的概要说明。

> 注意：排课模拟器的 PK 数据域主要由 `backend/migrations/001_pk_schema.sql`、`002_pk_schema_patch.sql` 和后续迁移维护。

## 评课主表

### `categories`

| 字段 | 类型 | 约束 | 说明 |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | 类别 ID |
| name | TEXT | UNIQUE NOT NULL | 类别名称 |

### `teachers`

| 字段 | 类型 | 约束 | 说明 |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | 教师 ID |
| tid | TEXT | - | 教师工号 |
| name | TEXT | NOT NULL | 教师姓名 |
| title | TEXT | - | 职称 |
| pinyin | TEXT | - | 姓名拼音 |
| department | TEXT | - | 所属院系 |

### `courses`

| 字段 | 类型 | 约束 | 说明 |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | 课程 ID |
| code | TEXT | NOT NULL | 课程代码 |
| name | TEXT | NOT NULL | 课程名称 |
| credit | REAL | DEFAULT 0 | 学分 |
| department | TEXT | - | 开课单位 |
| teacher_id | INTEGER | FOREIGN KEY | 关联 `teachers.id` |
| review_count | INTEGER | DEFAULT 0 | 评价数量 |
| review_avg | REAL | DEFAULT 0 | 平均评分 |
| search_keywords | TEXT | - | 搜索关键词 |
| is_legacy | INTEGER | DEFAULT 0 | 历史数据标记 |
| is_icu | INTEGER | DEFAULT 0 | 乌龙茶/ICU 来源标记 |

常用索引：`idx_courses_code`、`idx_courses_search`、`idx_courses_legacy`、`idx_courses_icu`。

### `reviews`

| 字段 | 类型 | 约束 | 说明 |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 评价 ID |
| course_id | INTEGER | NOT NULL, FOREIGN KEY | 关联 `courses.id`，级联删除 |
| semester | TEXT | - | 学期 |
| rating | INTEGER | NOT NULL, CHECK (0-5) | 评分 |
| comment | TEXT | - | 评价内容 |
| score | TEXT | - | 成绩 |
| created_at | INTEGER | DEFAULT timestamp | 创建时间戳 |
| approve_count | INTEGER | DEFAULT 0 | 点赞数 |
| disapprove_count | INTEGER | DEFAULT 0 | 旧字段，当前用户侧没有点踩接口 |
| is_hidden | BOOLEAN | DEFAULT 0 | 是否隐藏 |
| is_legacy | INTEGER | DEFAULT 0 | 历史数据标记 |
| is_icu | INTEGER | DEFAULT 0 | 乌龙茶/ICU 来源标记 |
| reviewer_name | TEXT | DEFAULT '' | 评价者昵称 |
| reviewer_avatar | TEXT | DEFAULT '' | 评价者头像 URL |
| wallet_user_hash | TEXT | - | 积分钱包用户哈希 |

常用索引：`idx_reviews_course`、`idx_reviews_created`、`idx_reviews_legacy`、`idx_reviews_icu`。

### `review_likes`

记录每个评价的点赞状态。当前只支持点赞/取消点赞，不存储点踩状态。

| 字段 | 类型 | 约束 | 说明 |
|--------|------|-------------|-------------|
| review_id | INTEGER | NOT NULL, PRIMARY KEY part | 评价 ID |
| client_id | TEXT | NOT NULL, PRIMARY KEY part | 后端派生后的客户端识别键 |
| created_at | INTEGER | DEFAULT timestamp | 点赞时间 |

主键为 `(review_id, client_id)`，用于防止重复点赞。索引为 `idx_review_likes_review_id`、`idx_review_likes_client_id`。

### `settings`

| 字段 | 类型 | 约束 | 说明 |
|--------|------|-------------|-------------|
| key | TEXT | PRIMARY KEY | 设置键 |
| value | TEXT | - | 设置值 |

默认设置包含 `show_legacy_reviews`、`maintenance_mode`、`maintenance_config`。运行中还会使用 `site_announcements`、`aux_schema_version` 等设置键。

### `course_aliases`

用于把一系统课程号、新旧课程号等别名映射到评课主表课程。

| 字段 | 类型 | 约束 | 说明 |
|--------|------|-------------|-------------|
| system | TEXT | NOT NULL, PRIMARY KEY part | 来源系统 |
| alias | TEXT | NOT NULL, PRIMARY KEY part | 别名 |
| course_id | INTEGER | NOT NULL | 关联 `courses.id` |
| created_at | INTEGER | DEFAULT timestamp | 创建时间 |

索引：`idx_course_aliases_course_id`。

## 元数据表

`meta_fields` 和 `meta_mappings` 用于记录数据源字段和字段映射说明，目前属于辅助字典。

## 排课模拟器 PK 表

核心表：

- `calendar` — Semester definitions
- `coursedetail` — Course details (per teaching class)
- `teacher` — Teacher info per teaching class
- `major` — Major definitions
- `majorandcourse` — Major-course mapping
- `coursenature` — Course nature types
- `coursenature_by_calendar` — Nature types per calendar
- `language` — Teaching languages
- `assessment` — Assessment modes
- `campus` — Campus definitions
- `faculty` — Faculty/department definitions
- `fetchlog` — Sync operation log
- `teacher_timeslots` — Pre-computed teacher time slots (auxiliary)

`fetchlog` 在新迁移中会补充 `id INTEGER PRIMARY KEY AUTOINCREMENT` 和 `idx_fetchlog_time`，并清理 30 天前的同步日志。

## 迁移文件

重要迁移：

- `001_pk_schema.sql`：创建排课模拟器 PK 数据域。
- `002_pk_schema_patch.sql`：补齐共享设置等兼容结构。
- `010_materialize_courses_from_pk.sql`：从 PK 数据物化评课侧课程。
- `011_maintenance_settings.sql`：维护模式相关设置。
- `012_search_indexes.sql`：课程搜索和组合查询索引。
- `013_fetchlog_pk.sql`：安全迁移 `fetchlog` 主键并清理旧日志。

完整 DDL 和最新字段请以 `backend/schema.sql` 及迁移文件为准。
