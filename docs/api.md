# API Reference

## Base URL

Production: `https://jcourse.yourtj.de`

## Authentication

Public APIs require no authentication. Admin APIs require the `x-admin-secret` header.

---

## Public APIs

### Get ICU Display Status

```
GET /api/settings/show_icu
```

**Response:**

```json
{ "show_icu": true }
```

### Get Course List

```
GET /api/courses?q={keyword}&legacy={true/false}&page={page}&limit={limit}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — | Search keyword (matches code, name, teacher) |
| `legacy` | string | — | `'true'` to query historical data |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |

**Response:**

```json
{
  "data": [
    { "id": 1, "code": "...", "name": "...", "rating": 4.5, "review_count": 10, "is_legacy": 0, "teacher_name": "..." }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

### Get Course Detail

```
GET /api/course/:id
```

Returns course info with associated reviews. If `is_icu=1` and the admin toggle is off, returns 404.

### Submit Review

```
POST /api/review
```

**Body:**

```json
{
  "course_id": 1,
  "rating": 5,
  "comment": "Review content",
  "semester": "2025-2026-1",
  "turnstile_token": "captcha token",
  "reviewer_name": "nickname (optional)",
  "reviewer_avatar": "avatar URL (optional)"
}
```

### Like / Dislike Review

```
POST /api/review/:id/like
POST /api/review/:id/dislike
```

Uses client-side fingerprint (`clientId`) to prevent duplicate votes.

### PK Scheduler APIs

The `/api/find*` family of endpoints powers the course scheduler:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/getAllCalendar` | GET | List all semesters |
| `/api/findGradeByCalendarId` | POST | Grades for a semester |
| `/api/findMajorByGrade` | POST | Majors for a grade |
| `/api/findCourseByMajor` | POST | Courses for a major |
| `/api/findOptionalCourseType` | POST | Elective course types |
| `/api/findCourseBySearch` | POST | Course search |
| `/api/findCourseByTime` | POST | Courses by time slot |
| `/api/findCourseByNatureId` | POST | Courses by nature type |

---

## Admin APIs

All admin APIs require the `x-admin-secret` header.

### Review Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/reviews` | GET | List reviews (search, paginate) |
| `/api/admin/review/:id` | PUT | Edit a review |
| `/api/admin/review/:id/toggle` | POST | Toggle review visibility |
| `/api/admin/review/:id` | DELETE | Delete a review |

### Course Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/courses` | GET | List courses (search, paginate) |
| `/api/admin/course` | POST | Create a course |
| `/api/admin/course/:id` | PUT | Edit a course |
| `/api/admin/course/:id` | DELETE | Delete a course (cascades to reviews) |

### Settings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/settings` | GET | Get all settings |
| `/api/admin/settings/:key` | PUT | Update a setting |

### Sync

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/syncOnesystemToPk` | POST | Trigger onesystem data sync |

---

## Data Filtering

### `is_legacy` — Historical Data

- Controls whether historical (乌龙茶) data is shown
- User-facing toggle in the frontend

### `is_icu` — ICU Site Data

- Marks data imported from the ICU site
- Admin-controlled toggle: when off, `is_icu=1` courses and reviews are completely hidden
