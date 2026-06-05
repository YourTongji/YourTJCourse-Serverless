# Database Schema

The authoritative schema is in `backend/schema.sql`. This document provides a human-readable overview.

> **Note**: The PK (选课) module has its own set of tables defined in `backend/migrations/001_pk_schema.sql` and `002_pk_schema_patch.sql`. Those tables are described in their respective migration files.

## Review Site Tables

### `categories`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Category ID |
| name | TEXT | UNIQUE NOT NULL | Category name |

### `teachers`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Teacher ID |
| tid | TEXT | — | Employee number |
| name | TEXT | NOT NULL | Teacher name |
| title | TEXT | — | Title / rank |
| pinyin | TEXT | — | Name pinyin |
| department | TEXT | — | Department |

### `courses`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Course ID |
| code | TEXT | NOT NULL | Course code |
| name | TEXT | NOT NULL | Course name |
| credit | REAL | DEFAULT 0 | Credits |
| department | TEXT | — | Department |
| teacher_id | INTEGER | FOREIGN KEY | Teacher ID |
| review_count | INTEGER | DEFAULT 0 | Review count |
| review_avg | REAL | DEFAULT 0 | Average rating |
| search_keywords | TEXT | — | Search keywords |
| is_legacy | INTEGER | DEFAULT 0 | Historical data flag |
| is_icu | INTEGER | DEFAULT 0 | ICU site data flag |

**Indexes**: `idx_courses_code`, `idx_courses_search`, `idx_courses_legacy`, `idx_courses_icu`

### `reviews`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Review ID |
| course_id | INTEGER | NOT NULL, FOREIGN KEY | Course ID (cascade delete) |
| semester | TEXT | — | Semester |
| rating | INTEGER | NOT NULL, CHECK (0-5) | Rating |
| comment | TEXT | — | Review content |
| score | TEXT | — | Grade |
| created_at | INTEGER | DEFAULT (timestamp) | Created time |
| approve_count | INTEGER | DEFAULT 0 | Like count |
| disapprove_count | INTEGER | DEFAULT 0 | Dislike count |
| is_hidden | BOOLEAN | DEFAULT 0 | Hidden flag |
| is_legacy | INTEGER | DEFAULT 0 | Historical data flag |
| is_icu | INTEGER | DEFAULT 0 | ICU site data flag |
| reviewer_name | TEXT | DEFAULT '' | Reviewer nickname |
| reviewer_avatar | TEXT | DEFAULT '' | Reviewer avatar URL |

**Indexes**: `idx_reviews_course`, `idx_reviews_created`, `idx_reviews_legacy`, `idx_reviews_icu`

### `review_likes`

Tracks like/dislike votes per client to prevent duplicates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| review_id | INTEGER | NOT NULL | Review ID |
| client_id | TEXT | NOT NULL | Client fingerprint |
| liked | INTEGER | NOT NULL | 1=like, 0=dislike |

**Indexes**: `idx_review_likes_review_id`, `idx_review_likes_client_id`

### `settings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | TEXT | PRIMARY KEY | Setting key |
| value | TEXT | — | Setting value |

**Default settings**: `show_legacy_reviews`, `maintenance_mode`, `maintenance_config`

### `course_aliases`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| system | TEXT | NOT NULL | Source system |
| alias | TEXT | NOT NULL | Alias name |
| course_id | INTEGER | NOT NULL | Course ID |

**Indexes**: `idx_course_aliases_course_id`

## PK (选课) Tables

Defined in `backend/migrations/001_pk_schema.sql`:

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

Defined in `backend/migrations/002_pk_schema_patch.sql`:

- `settings` — PK module settings (shared with review site)

See `backend/schema.sql` for the complete DDL.
