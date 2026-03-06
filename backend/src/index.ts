import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { encodeReviewId, decodeReviewId } from './sqids'
import { registerPkRoutes } from './pk/routes'
import { syncOnesystemToPkTables } from './pk/sync'

type Bindings = {
  DB: D1Database
  CAPTCHA_SITEVERIFY_URL: string
  ADMIN_SECRET: string
  ONESYSTEM_COOKIE?: string
  CREDIT_API_BASE?: string
  CREDIT_JCOURSE_SECRET?: string
  // compat: some deployments may reuse frontend env name or Credit backend secret name
  VITE_CREDIT_API_BASE?: string
  JCOURSE_INTEGRATION_SECRET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'x-admin-secret'],
  allowMethods: ['POST', 'GET', 'DELETE', 'PUT', 'OPTIONS']
}))

// 禁用缓存
app.use('/*', async (c, next) => {
  await next()
  c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  c.res.headers.set('Pragma', 'no-cache')
})

// redeploy marker (no-op) v2

app.onError((err, c) => {
  console.error('Error:', err)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// pk(排课模拟器) 兼容接口：给嵌入的 Vue 子应用使用
registerPkRoutes(app)

// TongjiCaptcha 验证函数
async function verifyTongjiCaptcha(token: string, siteverifyUrl: string) {
  try {
    const raw = String(siteverifyUrl || '').trim()
    if (!raw) return false

    // 兼容：用户可能只配置了 base（例如 https://captcha.xxx.com），而非完整的 /api/siteverify
    const normalized = raw.replace(/\/+$/, '')
    const url = /\/api\/siteverify$/i.test(normalized) ? normalized : `${normalized}/api/siteverify`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('Captcha siteverify HTTP error:', res.status, text.slice(0, 200))
      return false
    }
    const data = await res.json().catch(() => null) as { success?: boolean } | null
    if (!data || typeof data.success !== 'boolean') {
      console.error('Captcha siteverify invalid response')
      return false
    }
    return data.success === true
  } catch (e) {
    console.error('Captcha service error:', e)
    return false
  }
}

// 为评论添加 sqid 字段
function addSqidToReviews(reviews: any[]): any[] {
  return reviews.map(review => ({
    ...review,
    sqid: encodeReviewId(review.id)
  }))
}

async function ensureCourseAliasesTable(db: D1Database) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS course_aliases (system TEXT NOT NULL, alias TEXT NOT NULL, course_id INTEGER NOT NULL, created_at INTEGER DEFAULT (strftime('%s','now')), PRIMARY KEY (system, alias))"
  ).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_course_aliases_course_id ON course_aliases(course_id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_course_aliases_system_alias ON course_aliases(system, alias)').run()
}

async function ensurePkSearchIndexes(db: D1Database) {
  // Best-effort: some deployments may not have pk tables yet.
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_courseCode ON coursedetail(courseCode)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_newCourseCode ON coursedetail(newCourseCode)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_courseName ON coursedetail(courseName)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_campus ON coursedetail(campus)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_faculty ON coursedetail(faculty)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_teachingClassId ON teacher(teachingClassId)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_teacherName ON teacher(teacherName)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_teacherCode ON teacher(teacherCode)').run() } catch {}
}

async function ensureCourseSearchIndexes(db: D1Database) {
  // Speed up cross-semester review matching queries: courses(name) + teachers(name) + courses(teacher_id).
  // (All indexes are IF NOT EXISTS; safe to run on existing DB.)
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(name)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers(name)').run() } catch {}

  // Speed up course reviews query (ORDER BY created_at DESC under course_id filter).
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_reviews_course_created ON reviews(course_id, created_at DESC)').run() } catch {}
}

let dbInitPromise: Promise<void> | null = null
async function ensureDbInitialized(db: D1Database) {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await ensureCourseAliasesTable(db)
      await ensurePkSearchIndexes(db)
      await ensureCourseSearchIndexes(db)
      await ensureReviewLikesTable(db)
      await ensureReviewsWalletColumn(db)
      await ensureLegacyAutoDocsPurged(db)
    })()
  }
  await dbInitPromise
}

async function ensureReviewLikesTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS review_likes (
        review_id INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (review_id, client_id),
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      )`
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_review_likes_review_id ON review_likes(review_id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_review_likes_client_id ON review_likes(client_id)').run()
}

async function ensureReviewsWalletColumn(db: D1Database) {
  try {
    await db.prepare('ALTER TABLE reviews ADD COLUMN wallet_user_hash TEXT').run()
  } catch {
    // ignore: already exists
  }
}

async function ensureLegacyAutoDocsPurged(db: D1Database) {
  try {
    const key = 'legacy_auto_purged_v1'
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
    if (row?.value === 'true') return

    // Only purge legacy docs whose course code contains "AUTO"
    const ids = await db
      .prepare("SELECT id FROM courses WHERE is_legacy = 1 AND code LIKE '%AUTO%'")
      .all<{ id: number }>()
    const idList = (ids.results || []).map((r: any) => Number(r.id)).filter((n) => Number.isFinite(n))

    if (idList.length > 0) {
      const placeholders = idList.map(() => '?').join(',')
      await db.prepare(`DELETE FROM reviews WHERE course_id IN (${placeholders})`).bind(...idList).run()
      await db.prepare(`DELETE FROM course_aliases WHERE course_id IN (${placeholders})`).bind(...idList).run()
      await db.prepare(`DELETE FROM courses WHERE id IN (${placeholders})`).bind(...idList).run()
    }

    await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'true')`).bind(key).run()
  } catch (e) {
    // best-effort; don't block API
    console.error('Failed to purge legacy AUTO docs:', e)
  }
}

let showIcuCache: { value: boolean; expiresAt: number } | null = null
async function getShowIcuSetting(db: D1Database): Promise<boolean> {
  const now = Date.now()
  if (showIcuCache && showIcuCache.expiresAt > now) return showIcuCache.value

  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('show_legacy_reviews').first<{ value: string }>()
  const value = row?.value === 'true'
  showIcuCache = { value, expiresAt: now + 30_000 }
  return value
}

async function postCreditJcourseEvent(
  env: Bindings,
  payload: any
): Promise<{ ok: boolean; skipped?: boolean; error?: string; status?: number }> {
  const baseRaw = String(env.CREDIT_API_BASE || env.VITE_CREDIT_API_BASE || '').trim()
  const secret = String(env.CREDIT_JCOURSE_SECRET || env.JCOURSE_INTEGRATION_SECRET || '').trim()
  // 配置错误不应当被视为“跳过”，否则前端无法给用户任何提示。
  if (!baseRaw || !secret) return { ok: false, skipped: false, error: 'credit integration env not set' }

  // `credit.yourtj.de` 是积分站前端域名；其 `/api/*` rewrite 规则不一定包含 integration 接口。
  // integration 接口应指向 backend-core（通常为 `https://core.credit.yourtj.de`）。
  const base = baseRaw.replace(/\/$/, '')
  const integrationBase = /^https?:\/\/credit\.yourtj\.de$/i.test(base) ? 'https://core.credit.yourtj.de' : base
  const url = `${integrationBase.replace(/\/$/, '')}/api/integration/jcourse/event`
  const body = JSON.stringify(payload)

  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JCourse-Secret': secret
        },
        body
      })
      if (res.ok) {
        // 防止误把前端 index.html 当成“成功响应”（200 text/html）
        if (res.status === 204) return { ok: true }
        const contentType = res.headers.get('content-type') || ''
        if (!/application\/json/i.test(contentType)) {
          const text = await res.text().catch(() => '')
          return {
            ok: false,
            status: res.status,
            error:
              text ||
              `Unexpected response content-type: ${contentType || 'unknown'} (check CREDIT_API_BASE)`
          }
        }
        return { ok: true }
      }
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text || `HTTP ${res.status}` }
    } catch (e: any) {
      if (i === 1) return { ok: false, error: e?.message || 'network error' }
    }
  }

  return { ok: false, error: 'unknown error' }
}

// 公开 API - 获取设置
app.get('/api/settings/show_icu', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const showIcu = await getShowIcuSetting(c.env.DB)
  return c.json({ show_icu: showIcu })
})

app.get('/api/settings/announcements', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const row = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('site_announcements').first<{ value: string }>()

  if (!row?.value) {
    return c.json({ announcements: [] })
  }

  try {
    const parsed = JSON.parse(row.value)
    const announcements = Array.isArray(parsed)
      ? parsed
          .map((item) => ({
            id: String(item?.id || ''),
            type: ['info', 'warning', 'error', 'success'].includes(String(item?.type)) ? String(item?.type) : 'info',
            content: String(item?.content || '').trim(),
            enabled: item?.enabled !== false
          }))
          .filter((item) => item.id && item.content && item.enabled)
      : []

    return c.json({ announcements })
  } catch {
    return c.json({ announcements: [] })
  }
})

// 获取开课单位列表
app.get('/api/departments', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)

    // 检查是否显示 is_icu 数据
    const showIcu = await getShowIcuSetting(c.env.DB)

    let whereClause = ' WHERE department IS NOT NULL AND department != ""'

    // 当关闭乌龙茶显示时，过滤掉 is_icu=1 的课程
    if (!showIcu) {
      whereClause += ' AND (is_icu = 0 OR is_icu IS NULL)'
    }

    // safety: ignore any leftover AUTO legacy docs (should have been purged)
    whereClause += " AND NOT (is_legacy = 1 AND code LIKE '%AUTO%')"

    const query = `SELECT DISTINCT department FROM courses ${whereClause} ORDER BY department`
    const { results } = await c.env.DB.prepare(query).all()

    const departments = (results || []).map((row: any) => row.department)
    return c.json({ departments })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.get('/api/courses', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const keyword = c.req.query('q')
    const departments = c.req.query('departments') // 逗号分隔的开课单位列表
    const onlyWithReviews = c.req.query('onlyWithReviews') === 'true'
    const courseName = (c.req.query('courseName') || '').trim()
    const courseCode = (c.req.query('courseCode') || '').trim()
    const teacherName = (c.req.query('teacherName') || '').trim()
    const teacherCode = (c.req.query('teacherCode') || '').trim()
    const campus = (c.req.query('campus') || '').trim()
    const faculty = (c.req.query('faculty') || '').trim()
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const offset = (page - 1) * limit

    // 检查是否显示 is_icu 数据
    const showIcu = await getShowIcuSetting(c.env.DB)

    let withClause = ''
    let baseWhere = ' WHERE 1=1'
    const params: any[] = []

    // 当关闭乌龙茶显示时，过滤掉 is_icu=1 的课程
    if (!showIcu) {
      baseWhere += ' AND (c.is_icu = 0 OR c.is_icu IS NULL)'
    }

    // safety: ignore any leftover AUTO legacy docs (should have been purged)
    baseWhere += " AND NOT (c.is_legacy = 1 AND c.code LIKE '%AUTO%')"

    if (keyword) {
      baseWhere += ' AND (c.search_keywords LIKE ? OR c.code LIKE ? OR c.name LIKE ? OR t.name LIKE ?)'
      const likeKey = `%${keyword}%`
      params.push(likeKey, likeKey, likeKey, likeKey)
    }

    // 课程代码（支持别名）
    if (courseCode) {
      baseWhere +=
        " AND (c.code LIKE ? OR EXISTS (SELECT 1 FROM course_aliases a WHERE a.system = 'onesystem' AND a.course_id = c.id AND a.alias LIKE ?))"
      const likeCode = `%${courseCode}%`
      params.push(likeCode, likeCode)
    }

    // 高级检索：基于 onesystem/pk 的 coursedetail + teacher 表做过滤（用于按课程名/教师/校区/学院精确筛选）
    const needPkFilter = Boolean(courseName || teacherName || teacherCode || campus || faculty)
    if (needPkFilter) {
      const pkWhere: string[] = []
      const pkParams: any[] = []

      if (courseName) {
        pkWhere.push('cd.courseName LIKE ?')
        pkParams.push(`%${courseName}%`)
      }
      if (campus) {
        pkWhere.push('cd.campus = ?')
        pkParams.push(campus)
      }
      if (faculty) {
        pkWhere.push('cd.faculty = ?')
        pkParams.push(faculty)
      }
      if (teacherName) {
        pkWhere.push('EXISTS (SELECT 1 FROM teacher tt WHERE tt.teachingClassId = cd.id AND tt.teacherName LIKE ?)')
        pkParams.push(`%${teacherName}%`)
      }
      if (teacherCode) {
        pkWhere.push('EXISTS (SELECT 1 FROM teacher tt WHERE tt.teachingClassId = cd.id AND tt.teacherCode LIKE ?)')
        pkParams.push(`%${teacherCode}%`)
      }

      const pkExtraWhere = pkWhere.length > 0 ? ` AND ${pkWhere.join(' AND ')}` : ''

      // Use a CTE to avoid a correlated EXISTS per course row (much faster on large pk tables).
      withClause = `
        WITH pk_match AS (
          SELECT DISTINCT c2.id AS id
          FROM courses c2
          JOIN coursedetail cd ON (cd.courseCode = c2.code OR cd.newCourseCode = c2.code)
          WHERE 1=1${pkExtraWhere}
          UNION
          SELECT DISTINCT a.course_id AS id
          FROM course_aliases a
          JOIN coursedetail cd ON (a.alias = cd.courseCode OR a.alias = cd.newCourseCode)
          WHERE a.system = 'onesystem'${pkExtraWhere}
        )
      `

      baseWhere += ` AND c.id IN (SELECT id FROM pk_match)`

      // pkExtraWhere appears twice in the UNION, so bind params twice (and before the main query params).
      params.unshift(...pkParams, ...pkParams)
    }

    // 开课单位筛选
    if (departments) {
      const deptList = departments.split(',').filter(d => d.trim())
      if (deptList.length > 0) {
        const placeholders = deptList.map(() => '?').join(',')
        baseWhere += ` AND c.department IN (${placeholders})`
        params.push(...deptList)
      }
    }

    // Always include legacy docs into the normal view, and merge by (courseName + teacherName).
    const reviewJoin = `LEFT JOIN reviews r ON r.course_id = c.id AND r.is_hidden = 0 ${showIcu ? '' : 'AND (r.is_icu = 0 OR r.is_icu IS NULL)'}`
    const groupKey = `c.name, COALESCE(t.name, '')`
    const having = onlyWithReviews ? 'HAVING COUNT(r.id) > 0' : ''

    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT 1
        FROM courses c
        LEFT JOIN teachers t ON c.teacher_id = t.id
        ${reviewJoin}
        ${baseWhere}
        GROUP BY ${groupKey}
        ${having}
      ) x
    `
    const countResult = await c.env.DB.prepare(`${withClause}${countQuery}`).bind(...params).first<{ total: number }>()
    const total = countResult?.total || 0

    const query = `
      SELECT
        CAST(substr(COALESCE(
          MAX(CASE WHEN c.is_legacy = 0 THEN printf('%010d|%s', c.id, c.code) END),
          MAX(printf('%010d|%s', c.id, c.code))
        ), 1, 10) AS INTEGER) as id,
        substr(COALESCE(
          MAX(CASE WHEN c.is_legacy = 0 THEN printf('%010d|%s', c.id, c.code) END),
          MAX(printf('%010d|%s', c.id, c.code))
        ), 12) as code,
        c.name,
        COALESCE(AVG(CASE WHEN r.rating > 0 THEN r.rating END), 0) as rating,
        COUNT(r.id) as review_count,
        CASE WHEN SUM(CASE WHEN c.is_legacy = 0 THEN 1 ELSE 0 END) > 0 THEN 0 ELSE 1 END as is_legacy,
        COALESCE(t.name, '') as teacher_name,
        COALESCE(MAX(CASE WHEN c.is_legacy = 0 THEN c.department END), MAX(c.department)) as department,
        COALESCE(MAX(CASE WHEN c.is_legacy = 0 THEN c.credit END), MAX(c.credit), 0) as credit,
        (
          SELECT GROUP_CONCAT(x.calendarName, '||') FROM (
            SELECT DISTINCT ca.calendarIdI18n as calendarName, cd2.calendarId as calendarId
            FROM coursedetail cd2
            JOIN calendar ca ON ca.calendarId = cd2.calendarId
            WHERE (cd2.courseCode = c.code OR cd2.newCourseCode = c.code)
            ORDER BY cd2.calendarId DESC
          ) x
        ) as semester_names
      FROM courses c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      ${reviewJoin}
      ${baseWhere}
      GROUP BY ${groupKey}
      ${having}
      ORDER BY review_count DESC
      LIMIT ? OFFSET ?
    `
    const { results } = await c.env.DB.prepare(`${withClause}${query}`).bind(...params, limit, offset).all()

    const normalized = (results || []).map((r: any) => ({
      ...r,
      semesters: String(r.semester_names || '')
        .split('||')
        .map((s: string) => s.trim())
        .filter(Boolean)
    }))

    return c.json({ data: normalized, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.get('/api/course/:id', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const id = c.req.param('id')

    // 检查是否显示乌龙茶数据
    const showIcu = await getShowIcuSetting(c.env.DB)

    const course = await c.env.DB.prepare(
      `SELECT c.*, t.name as teacher_name FROM courses c
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE c.id = ?`
    ).bind(id).first()

    if (!course) return c.json({ error: 'Course not found' }, 404)

    if (Number((course as any).is_legacy || 0) === 1 && String((course as any).code || '').includes('AUTO')) {
      return c.json({ error: 'Course not found' }, 404)
    }

    // 如果关闭乌龙茶显示且课程是icu，返回404
    if (!showIcu && (course as any).is_icu === 1) {
      return c.json({ error: 'Course not found' }, 404)
    }

    const clientId = (c.req.query('clientId') || '').trim()
    const cacheKey = new Request(
      `https://cache.yourtj.de/api/course-base/${encodeURIComponent(String(id))}?showIcu=${showIcu ? '1' : '0'}`,
      { method: 'GET' }
    )
    const cache = caches.default

    try {
      const cached = await cache.match(cacheKey)
      if (cached) {
        const basePayload = await cached.json()

        if (!clientId) {
          return new Response(JSON.stringify(basePayload), {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'public, max-age=60'
            }
          })
        }

        const reviewIds = (basePayload as any)?.reviews
          ? (basePayload as any).reviews.map((r: any) => Number(r?.id)).filter((n: number) => Number.isFinite(n))
          : []

        let likedSet = new Set<number>()
        if (reviewIds.length > 0) {
          const placeholders2 = reviewIds.map(() => '?').join(',')
          const likedRows = await c.env.DB
            .prepare(`SELECT review_id FROM review_likes WHERE client_id = ? AND review_id IN (${placeholders2})`)
            .bind(clientId, ...reviewIds)
            .all<{ review_id: number }>()
          likedSet = new Set<number>((likedRows.results || []).map((r: any) => Number(r.review_id)))
        }

        const personalized = {
          ...(basePayload as any),
          reviews: ((basePayload as any).reviews || []).map((r: any) => ({
            ...r,
            liked: likedSet.has(Number(r?.id))
          }))
        }

        return new Response(JSON.stringify(personalized), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        })
      }
    } catch {
      // ignore cache failures
    }

    // 评价匹配策略（跨学期）：
    // - 同课程名 + 同教师（教师名；可不同学期/课号）
    // - 若教师缺失：回退到同 code
    const matchedIds = new Set<number>([Number((course as any).id)])
    const teacherName = String((course as any).teacher_name || '').trim()

    // Cross-semester review matching:
    // - Prefer "same course name + same teacher name" (allow different semester/course code).
    // - Fallback: when teacher missing, match by same canonical code.
    if (teacherName) {
      const teacherIdsRows = await c.env.DB
        .prepare('SELECT id FROM teachers WHERE name = ?')
        .bind(teacherName)
        .all<{ id: number }>()

      const teacherIds = (teacherIdsRows.results || [])
        .map((r: any) => Number(r.id))
        .filter((n) => Number.isFinite(n))

      if (teacherIds.length > 0) {
        const placeholdersT = teacherIds.map(() => '?').join(',')
        const rows = await c.env.DB
          .prepare(
            `SELECT id FROM courses
             WHERE name = ?
               AND teacher_id IN (${placeholdersT})
               AND NOT (is_legacy = 1 AND code LIKE '%AUTO%')`
          )
          .bind((course as any).name, ...teacherIds)
          .all<{ id: number }>()
        for (const r of rows.results || []) matchedIds.add(Number((r as any).id))
      }
    } else {
      const rows = await c.env.DB
        .prepare(`SELECT id FROM courses WHERE code = ? AND NOT (is_legacy = 1 AND code LIKE '%AUTO%')`)
        .bind((course as any).code)
        .all<{ id: number }>()
      for (const r of rows.results || []) matchedIds.add(Number((r as any).id))
    }

    const idList = Array.from(matchedIds).filter((n) => Number.isFinite(n))
    if (idList.length === 0) return c.json({ error: 'Course not found' }, 404)

    const placeholders = idList.map(() => '?').join(',')

    let baseWhere = `course_id IN (${placeholders}) AND is_hidden = 0`
    if (!showIcu) baseWhere += ` AND is_icu = 0`

    const reviews = await c.env.DB
      .prepare(`SELECT * FROM reviews WHERE ${baseWhere} ORDER BY created_at DESC`)
      .bind(...idList)
      .all()

    const rawReviews = (reviews.results || []) as any[]
    const reviewsWithSqid = addSqidToReviews(rawReviews).map((r: any) => ({
      ...r,
      like_count: Number(r?.approve_count || 0),
      liked: false
    }))

    const reviewCount = rawReviews.length
    const ratingNums = rawReviews
      .map((r) => Number((r as any)?.rating ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0)
    const reviewAvg = ratingNums.length > 0 ? ratingNums.reduce((a, b) => a + b, 0) / ratingNums.length : 0

    let semesters: string[] = []
    try {
      const aliasRows = await c.env.DB
        .prepare(`SELECT alias FROM course_aliases WHERE system = 'onesystem' AND course_id = ?`)
        .bind(Number((course as any).id))
        .all<{ alias: string }>()

      const codeList = [
        String((course as any).code || '').trim(),
        ...(aliasRows.results || []).map((r: any) => String(r.alias || '').trim())
      ]
        .filter(Boolean)

      const uniqueCodes = Array.from(new Set(codeList))
      if (uniqueCodes.length > 0) {
        const placeholdersC = uniqueCodes.map(() => '?').join(',')
        const semestersRow = await c.env.DB
          .prepare(
            `SELECT GROUP_CONCAT(x.calendarName, '||') as semester_names FROM (
              SELECT DISTINCT ca.calendarIdI18n as calendarName, cd2.calendarId as calendarId
              FROM coursedetail cd2
              JOIN calendar ca ON ca.calendarId = cd2.calendarId
              WHERE cd2.courseCode IN (${placeholdersC})
                 OR cd2.newCourseCode IN (${placeholdersC})
              ORDER BY cd2.calendarId DESC
            ) x`
          )
          .bind(...uniqueCodes, ...uniqueCodes)
          .first<{ semester_names: string | null }>()

        semesters = String(semestersRow?.semester_names || '')
          .split('||')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    } catch {
      semesters = []
    }

    const basePayload = {
      ...(course as any),
      review_count: reviewCount,
      review_avg: reviewAvg,
      semesters,
      reviews: reviewsWithSqid
    }

    const cacheRes = new Response(JSON.stringify(basePayload), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60'
      }
    })
    c.executionCtx.waitUntil(cache.put(cacheKey, cacheRes.clone()))

    if (!clientId) return cacheRes

    const reviewIds = rawReviews.map((r) => Number(r?.id)).filter((n) => Number.isFinite(n))
    let likedSet = new Set<number>()
    if (reviewIds.length > 0) {
      const placeholders2 = reviewIds.map(() => '?').join(',')
      const likedRows = await c.env.DB
        .prepare(`SELECT review_id FROM review_likes WHERE client_id = ? AND review_id IN (${placeholders2})`)
        .bind(clientId, ...reviewIds)
        .all<{ review_id: number }>()
      likedSet = new Set<number>((likedRows.results || []).map((r: any) => Number(r.review_id)))
    }

    const personalized = {
      ...basePayload,
      reviews: (basePayload.reviews || []).map((r: any) => ({
        ...r,
        liked: likedSet.has(Number(r?.id))
      }))
    }

    return new Response(JSON.stringify(personalized), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// 给排课模拟器侧边弹窗使用：按课号/新课号查找课程评价
app.get('/api/course/by-code/:code', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const code = (c.req.param('code') || '').trim()
    if (!code) return c.json({ error: 'Missing code' }, 400)
    const teacherName = (c.req.query('teacherName') || '').trim()
    const clientId = (c.req.query('clientId') || '').trim()

    // ICU 显示开关
    const showIcu = await getShowIcuSetting(c.env.DB)

    // 若带 teacherName：优先命中“课号/别名 + 教师”，避免同课号不同老师的评价混在一起
    const preferredRow = teacherName
      ? await c.env.DB
          .prepare(
            `SELECT c.id as id
             FROM courses c
             LEFT JOIN teachers t ON c.teacher_id = t.id
             WHERE (
               c.code = ?
               OR EXISTS (
                 SELECT 1 FROM course_aliases a
                 WHERE a.system = 'onesystem'
                   AND a.alias = ?
                   AND a.course_id = c.id
               )
             )
               AND t.name = ?
             LIMIT 1`
          )
          .bind(code, code, teacherName)
          .first<{ id: number }>()
      : null

    // 先尝试 alias 映射（onesystem）
    const aliasRow = preferredRow?.id
      ? null
      : await c.env.DB.prepare(`SELECT course_id as id FROM course_aliases WHERE system = 'onesystem' AND alias = ? LIMIT 1`).bind(code).first<{ id: number }>()

    const directRow =
      preferredRow?.id || aliasRow?.id
        ? null
        : await c.env.DB.prepare('SELECT id FROM courses WHERE code = ? LIMIT 1').bind(code).first<{ id: number }>()

    const courseId = preferredRow?.id ?? aliasRow?.id ?? directRow?.id ?? null

    if (!courseId) return c.json({ error: 'Course not found' }, 404)

    // 如果是直接命中 courses.code，顺手补齐 alias，避免每次都走回退查询
    if (!aliasRow?.id && directRow?.id) {
      // 防御：老库未迁移时保证表存在
      await c.env.DB
        .prepare(
          `INSERT INTO course_aliases (system, alias, course_id)
           VALUES ('onesystem', ?, ?)
           ON CONFLICT(system, alias) DO UPDATE SET course_id=excluded.course_id`
        )
        .bind(code, courseId)
        .run()
    }

    const course = await c.env.DB.prepare(
      `SELECT c.*, t.name as teacher_name FROM courses c
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE c.id = ?`
    ).bind(courseId).first()

    if (!course) return c.json({ error: 'Course not found' }, 404)

    if (!showIcu && (course as any).is_icu === 1) {
      return c.json({ error: 'Course not found' }, 404)
    }

    // 评价匹配策略（跨学期）：
    // - 默认：同课程 code（含 alias 命中后的 canonical code）+ 同课程名同教师
    // - 若带 teacherName：只按“同课程名 + 同教师”聚合（避免同课号不同老师混入）
    const matchedIds = new Set<number>([Number(courseId)])

    if (!teacherName) {
      const sameCodeRows = await c.env.DB.prepare('SELECT id FROM courses WHERE code = ?').bind((course as any).code).all<{ id: number }>()
      for (const r of sameCodeRows.results || []) matchedIds.add(Number((r as any).id))
    }

    if ((course as any).teacher_id) {
      const sameNameTeacherRows = await c.env.DB
        .prepare('SELECT id FROM courses WHERE name = ? AND teacher_id = ?')
        .bind((course as any).name, (course as any).teacher_id)
        .all<{ id: number }>()
      for (const r of sameNameTeacherRows.results || []) matchedIds.add(Number((r as any).id))
    } else if (teacherName) {
      const sameNameTeacherRows = await c.env.DB
        .prepare(
          `SELECT c.id as id
           FROM courses c
           LEFT JOIN teachers t ON c.teacher_id = t.id
           WHERE c.name = ? AND t.name = ?`
        )
        .bind((course as any).name, teacherName)
        .all<{ id: number }>()
      for (const r of sameNameTeacherRows.results || []) matchedIds.add(Number((r as any).id))
    }

    const idList = Array.from(matchedIds).filter((n) => Number.isFinite(n))
    if (idList.length === 0) return c.json({ error: 'Course not found' }, 404)

    const placeholders = idList.map(() => '?').join(',')

    let baseWhere = `course_id IN (${placeholders}) AND is_hidden = 0`
    if (!showIcu) baseWhere += ` AND is_icu = 0`

    const reviews = await c.env.DB
      .prepare(`SELECT * FROM reviews WHERE ${baseWhere} ORDER BY created_at DESC LIMIT 30`)
      .bind(...idList)
      .all()
    const reviewsWithSqid = addSqidToReviews(reviews.results || [])

    // 是否点赞（可选）
    let likedSet = new Set<number>()
    if (clientId && (reviewsWithSqid || []).length > 0) {
      const ids = (reviewsWithSqid || []).map((r: any) => Number(r?.id)).filter((n) => Number.isFinite(n))
      if (ids.length > 0) {
        const placeholders2 = ids.map(() => '?').join(',')
        const likedRows = await c.env.DB
          .prepare(`SELECT review_id FROM review_likes WHERE client_id = ? AND review_id IN (${placeholders2})`)
          .bind(clientId, ...ids)
          .all()
        likedSet = new Set<number>((likedRows.results || []).map((r: any) => Number(r.review_id)))
      }
    }

    const mappedReviews = (reviewsWithSqid || []).map((r: any) => ({
      ...r,
      like_count: Number(r?.approve_count || 0),
      liked: clientId ? likedSet.has(Number(r?.id)) : false
    }))

    const reviewCount = mappedReviews.length
    const ratingNums = mappedReviews
      .map((r: any) => Number(r?.rating ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0)
    const reviewAvg = ratingNums.length > 0 ? ratingNums.reduce((a, b) => a + b, 0) / ratingNums.length : 0

    let semesters: string[] = []
    try {
      const aliasRows = await c.env.DB
        .prepare(`SELECT alias FROM course_aliases WHERE system = 'onesystem' AND course_id = ?`)
        .bind(Number(courseId))
        .all<{ alias: string }>()

      const codeList = [
        String((course as any).code || '').trim(),
        ...(aliasRows.results || []).map((r: any) => String(r.alias || '').trim())
      ].filter(Boolean)
      const uniqueCodes = Array.from(new Set(codeList))

      if (uniqueCodes.length > 0) {
        const placeholdersC = uniqueCodes.map(() => '?').join(',')
        const semestersRow = await c.env.DB
          .prepare(
            `SELECT GROUP_CONCAT(x.calendarName, '||') as semester_names FROM (
              SELECT DISTINCT ca.calendarIdI18n as calendarName, cd2.calendarId as calendarId
              FROM coursedetail cd2
              JOIN calendar ca ON ca.calendarId = cd2.calendarId
              WHERE cd2.courseCode IN (${placeholdersC})
                 OR cd2.newCourseCode IN (${placeholdersC})
              ORDER BY cd2.calendarId DESC
            ) x`
          )
          .bind(...uniqueCodes, ...uniqueCodes)
          .first<{ semester_names: string | null }>()

        semesters = String(semestersRow?.semester_names || '')
          .split('||')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    } catch {
      semesters = []
    }

    return c.json({
      ...(course as any),
      review_count: reviewCount,
      review_avg: reviewAvg,
      semesters,
      reviews: mappedReviews
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/review', async (c) => {
  const body = await c.req.json()
  const { course_id, rating, comment, semester, turnstile_token, reviewer_name, reviewer_avatar, walletUserHash, wallet_user_hash } = body
  const walletHash = String(walletUserHash || wallet_user_hash || '').trim()

  // 使用 TongjiCaptcha 验证
  if (!(await verifyTongjiCaptcha(turnstile_token, c.env.CAPTCHA_SITEVERIFY_URL))) {
    return c.json({ error: '人机验证无效或已过期' }, 403)
  }

  await ensureReviewsWalletColumn(c.env.DB)

  const insert = await c.env.DB.prepare(
    `INSERT INTO reviews (course_id, rating, comment, semester, is_legacy, reviewer_name, reviewer_avatar, wallet_user_hash) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(course_id, rating, comment, semester, reviewer_name || '', reviewer_avatar || '', walletHash || null).run()

  const reviewId = Number((insert as any)?.meta?.last_row_id || 0)

  // 更新课程统计（只统计非legacy且rating>0的评价）
  await c.env.DB.prepare(`
    UPDATE courses SET
      review_count = (SELECT COUNT(*) FROM reviews WHERE course_id = ? AND is_hidden = 0),
      review_avg = (SELECT AVG(rating) FROM reviews WHERE course_id = ? AND is_hidden = 0 AND rating > 0)
    WHERE id = ?
  `).bind(course_id, course_id, course_id).run()

  const creditRewardEligible = walletHash && /^[a-f0-9]{64}$/i.test(walletHash) && String(comment || '').trim().length >= 50
  const creditReward = creditRewardEligible
    ? await postCreditJcourseEvent(c.env, {
        kind: 'review_reward',
        eventId: `review:${reviewId || `${course_id}:${Date.now()}`}`,
        userHash: walletHash,
        amount: 10,
        metadata: { reviewId, courseId: course_id }
      })
    : { ok: false, skipped: true, error: creditRewardEligible ? undefined : 'not eligible' }

  return c.json({ success: true, reviewId, creditReward })
})

// 编辑评价（仅允许编辑“绑定了积分钱包”的本人评价）
app.put('/api/review/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid review id' }, 400)

  const body = await c.req.json().catch(() => ({} as any))
  const { rating, comment, semester, turnstile_token, reviewer_name, reviewer_avatar, walletUserHash, wallet_user_hash } = body
  const walletHash = String(walletUserHash || wallet_user_hash || '').trim()

  if (!(await verifyTongjiCaptcha(turnstile_token, c.env.CAPTCHA_SITEVERIFY_URL))) {
    return c.json({ error: '人机验证无效或已过期' }, 403)
  }

  if (!walletHash || !/^[a-f0-9]{64}$/i.test(walletHash)) {
    return c.json({ error: '未绑定积分钱包，无法编辑' }, 400)
  }

  await ensureReviewsWalletColumn(c.env.DB)

  const existing = await c.env.DB
    .prepare('SELECT id, course_id, wallet_user_hash FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ id: number; course_id: number; wallet_user_hash?: string | null }>()
  if (!existing) return c.json({ error: 'Review not found' }, 404)

  if (String(existing.wallet_user_hash || '').trim() !== walletHash) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const safeRating = Math.max(0, Math.min(5, Number(rating || 0)))
  const safeComment = String(comment || '')
  const safeSemester = String(semester || '')
  const safeName = String(reviewer_name || '')
  const safeAvatar = String(reviewer_avatar || '')

  await c.env.DB
    .prepare(
      `UPDATE reviews
       SET rating = ?, comment = ?, semester = ?, reviewer_name = ?, reviewer_avatar = ?
       WHERE id = ?`
    )
    .bind(safeRating, safeComment, safeSemester, safeName, safeAvatar, id)
    .run()

  // 更新课程统计（只统计非legacy且rating>0的评价）
  await c.env.DB.prepare(`
    UPDATE courses SET
      review_count = (SELECT COUNT(*) FROM reviews WHERE course_id = ? AND is_hidden = 0),
      review_avg = (SELECT AVG(rating) FROM reviews WHERE course_id = ? AND is_hidden = 0 AND rating > 0)
    WHERE id = ?
  `).bind(existing.course_id, existing.course_id, existing.course_id).run()

  return c.json({ success: true })
})

app.post('/api/review/:id/like', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid review id' }, 400)

  await ensureReviewLikesTable(c.env.DB)
  await ensureReviewsWalletColumn(c.env.DB)

  const body = await c.req.json().catch(() => ({} as any))
  const clientId = String(body?.clientId || '').trim()
  if (!clientId) return c.json({ error: 'Missing clientId' }, 400)

  const existing = await c.env.DB
    .prepare('SELECT 1 as x FROM review_likes WHERE review_id = ? AND client_id = ? LIMIT 1')
    .bind(id, clientId)
    .first<{ x: number }>()

  if (!existing) {
    await c.env.DB.prepare('INSERT INTO review_likes (review_id, client_id) VALUES (?, ?)').bind(id, clientId).run()
    await c.env.DB.prepare('UPDATE reviews SET approve_count = approve_count + 1 WHERE id = ?').bind(id).run()
  }

  const review = await c.env.DB
    .prepare('SELECT approve_count, wallet_user_hash FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ approve_count: number; wallet_user_hash?: string | null }>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  const walletHash = String(review.wallet_user_hash || '').trim()
  let creditLike: any = { ok: false, skipped: true }
  if (walletHash && /^[a-f0-9]{64}$/i.test(walletHash)) {
    creditLike = await postCreditJcourseEvent(c.env, {
      kind: 'like',
      reviewId: String(id),
      actorId: clientId,
      targetUserHash: walletHash,
      metadata: { reviewId: id }
    })
  }

  return c.json({ success: true, liked: true, like_count: Number(review.approve_count || 0), creditLike })
})

app.delete('/api/review/:id/like', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid review id' }, 400)

  await ensureReviewLikesTable(c.env.DB)
  await ensureReviewsWalletColumn(c.env.DB)

  const body = await c.req.json().catch(() => ({} as any))
  const clientId = String(body?.clientId || '').trim()
  if (!clientId) return c.json({ error: 'Missing clientId' }, 400)

  const existing = await c.env.DB
    .prepare('SELECT 1 as x FROM review_likes WHERE review_id = ? AND client_id = ? LIMIT 1')
    .bind(id, clientId)
    .first<{ x: number }>()

  if (existing) {
    await c.env.DB.prepare('DELETE FROM review_likes WHERE review_id = ? AND client_id = ?').bind(id, clientId).run()
    await c.env.DB
      .prepare('UPDATE reviews SET approve_count = CASE WHEN approve_count > 0 THEN approve_count - 1 ELSE 0 END WHERE id = ?')
      .bind(id)
      .run()
  }

  const review = await c.env.DB
    .prepare('SELECT approve_count, wallet_user_hash FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ approve_count: number; wallet_user_hash?: string | null }>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  const walletHash = String(review.wallet_user_hash || '').trim()
  let creditLike: any = { ok: false, skipped: true }
  if (walletHash && /^[a-f0-9]{64}$/i.test(walletHash)) {
    creditLike = await postCreditJcourseEvent(c.env, {
      kind: 'unlike',
      reviewId: String(id),
      actorId: clientId,
      targetUserHash: walletHash,
      metadata: { reviewId: id }
    })
  }

  return c.json({ success: true, liked: false, like_count: Number(review.approve_count || 0), creditLike })
})

// 管理 API
const admin = new Hono<{ Bindings: Bindings }>()

admin.use('/*', async (c, next) => {
  const input = c.req.header('x-admin-secret')
  if (!input || input !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

// 手动同步一系统排课数据 -> D1（pk 数据域）
// 由 GitHub Action / 管理端触发：POST /api/admin/pk/sync { calendarId, depth? }
admin.post('/pk/sync', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as any))
    const calendarId = Number(body?.calendarId)
    const depth = body?.depth !== undefined ? Number(body.depth) : 1

    if (!Number.isFinite(calendarId)) return c.json({ error: 'calendarId 无效' }, 400)

    // Allow overriding cookie for local tooling (still protected by x-admin-secret).
    const sessionCookie = String(body?.onesystemCookie || body?.sessionCookie || c.env.ONESYSTEM_COOKIE || '').trim()
    if (!sessionCookie) {
      return c.json({ error: 'ONESYSTEM_COOKIE 未配置（wrangler secret put ONESYSTEM_COOKIE）' }, 500)
    }

    const result = await syncOnesystemToPkTables({
      db: c.env.DB,
      sessionCookie,
      calendarId,
      depth
    })

    return c.json({ success: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message || 'Sync failed' }, 500)
  }
})

admin.get('/reviews', async (c) => {
  try {
    const keyword = c.req.query('q')
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = (page - 1) * limit

    let whereClause = ''
    let params: string[] = []

    if (keyword) {
      // 尝试将关键词解码为数字ID（如果是sqid）
      const decodedId = decodeReviewId(keyword)
      if (decodedId !== null) {
        // 如果是有效的sqid，直接按ID查询
        whereClause = 'WHERE r.id = ?'
        params = [decodedId.toString()]
      } else {
        // 否则按原来的方式模糊搜索
        whereClause = 'WHERE c.name LIKE ? OR c.code LIKE ? OR r.comment LIKE ? OR r.reviewer_name LIKE ?'
        const likeKey = `%${keyword}%`
        params = [likeKey, likeKey, likeKey, likeKey]
      }
    }

    const countQuery = `SELECT COUNT(*) as total FROM reviews r JOIN courses c ON r.course_id = c.id ${whereClause}`
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{total: number}>()
    const total = countResult?.total || 0

    const query = `
      SELECT r.*, c.name as course_name, c.code
      FROM reviews r
      JOIN courses c ON r.course_id = c.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `
    const { results } = await c.env.DB.prepare(query).bind(...params, limit, offset).all()
    const reviewsWithSqid = addSqidToReviews(results || [])
    return c.json({ data: reviewsWithSqid, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

admin.put('/review/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { comment, rating, reviewer_name, reviewer_avatar } = body

  await c.env.DB.prepare(
    'UPDATE reviews SET comment = ?, rating = ?, reviewer_name = ?, reviewer_avatar = ? WHERE id = ?'
  ).bind(comment, rating, reviewer_name || '', reviewer_avatar || '', id).run()

  // 获取course_id并更新统计
  const review = await c.env.DB.prepare('SELECT course_id FROM reviews WHERE id = ?').bind(id).first<{course_id: number}>()
  if (review) {
    await c.env.DB.prepare(`
      UPDATE courses SET
        review_avg = (SELECT AVG(rating) FROM reviews WHERE course_id = ? AND is_hidden = 0 AND rating > 0)
      WHERE id = ?
    `).bind(review.course_id, review.course_id).run()
  }

  return c.json({ success: true })
})

admin.post('/review/:id/toggle', async (c) => {
  const id = c.req.param('id')
  // 先获取评论的course_id
  const review = await c.env.DB.prepare('SELECT course_id FROM reviews WHERE id = ?').bind(id).first<{course_id: number}>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  await c.env.DB.prepare('UPDATE reviews SET is_hidden = NOT is_hidden WHERE id = ?').bind(id).run()

  // 更新课程统计
  await c.env.DB.prepare(`
    UPDATE courses SET
      review_count = (SELECT COUNT(*) FROM reviews WHERE course_id = ? AND is_hidden = 0),
      review_avg = (SELECT AVG(rating) FROM reviews WHERE course_id = ? AND is_hidden = 0 AND rating > 0)
    WHERE id = ?
  `).bind(review.course_id, review.course_id, review.course_id).run()

  return c.json({ success: true })
})

admin.delete('/review/:id', async (c) => {
  const id = c.req.param('id')
  // 先获取评论的course_id
  const review = await c.env.DB.prepare('SELECT course_id FROM reviews WHERE id = ?').bind(id).first<{course_id: number}>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  await c.env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run()

  // 更新课程统计
  await c.env.DB.prepare(`
    UPDATE courses SET
      review_count = (SELECT COUNT(*) FROM reviews WHERE course_id = ? AND is_hidden = 0),
      review_avg = (SELECT AVG(rating) FROM reviews WHERE course_id = ? AND is_hidden = 0 AND rating > 0)
    WHERE id = ?
  `).bind(review.course_id, review.course_id, review.course_id).run()

  return c.json({ success: true })
})

// 课程管理API
admin.get('/courses', async (c) => {
  try {
    const keyword = c.req.query('q')
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const offset = (page - 1) * limit

    let whereClause = ''
    let params: string[] = []

    if (keyword) {
      whereClause = 'WHERE c.name LIKE ? OR c.code LIKE ? OR t.name LIKE ?'
      const likeKey = `%${keyword}%`
      params = [likeKey, likeKey, likeKey]
    }

    const countQuery = `SELECT COUNT(*) as total FROM courses c LEFT JOIN teachers t ON c.teacher_id = t.id ${whereClause}`
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{total: number}>()
    const total = countResult?.total || 0

    const query = `
      SELECT c.*, t.name as teacher_name
      FROM courses c LEFT JOIN teachers t ON c.teacher_id = t.id
      ${whereClause}
      ORDER BY c.id DESC
      LIMIT ? OFFSET ?
    `
    const { results } = await c.env.DB.prepare(query).bind(...params, limit, offset).all()
    return c.json({ data: results || [], total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

admin.put('/course/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { code, name, credit, department, teacher_name, search_keywords } = body

  // 查找或创建教师
  let teacherId = null
  if (teacher_name) {
    const existingTeacher = await c.env.DB.prepare('SELECT id FROM teachers WHERE name = ?').bind(teacher_name).first<{id: number}>()
    if (existingTeacher) {
      teacherId = existingTeacher.id
    } else {
      const result = await c.env.DB.prepare('INSERT INTO teachers (name) VALUES (?)').bind(teacher_name).run()
      teacherId = result.meta.last_row_id
    }
  }

  await c.env.DB.prepare(
    'UPDATE courses SET code = ?, name = ?, credit = ?, department = ?, teacher_id = ?, search_keywords = ? WHERE id = ?'
  ).bind(code, name, credit || 0, department || '', teacherId, search_keywords || '', id).run()

  return c.json({ success: true })
})

admin.delete('/course/:id', async (c) => {
  const id = c.req.param('id')
  // 先删除关联的评论
  await c.env.DB.prepare('DELETE FROM reviews WHERE course_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

admin.post('/course', async (c) => {
  const body = await c.req.json()
  const { code, name, credit, department, teacher_name, search_keywords } = body

  // 查找或创建教师
  let teacherId = null
  if (teacher_name) {
    const existingTeacher = await c.env.DB.prepare('SELECT id FROM teachers WHERE name = ?').bind(teacher_name).first<{id: number}>()
    if (existingTeacher) {
      teacherId = existingTeacher.id
    } else {
      const result = await c.env.DB.prepare('INSERT INTO teachers (name) VALUES (?)').bind(teacher_name).run()
      teacherId = result.meta.last_row_id
    }
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO courses (code, name, credit, department, teacher_id, search_keywords, is_legacy) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).bind(code, name, credit || 0, department || '', teacherId, search_keywords || `${code} ${name} ${teacher_name || ''}`).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 设置API
admin.get('/settings', async (c) => {
  const results = await c.env.DB.prepare('SELECT key, value FROM settings').all()
  const settings: Record<string, string> = {}
  for (const row of (results.results || []) as {key: string, value: string}[]) {
    settings[row.key] = row.value
  }
  return c.json(settings)
})

admin.put('/settings/:key', async (c) => {
  const key = c.req.param('key')
  const body = await c.req.json()
  const { value } = body
  await c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run()
  return c.json({ success: true })
})

app.route('/api/admin', admin)

export default app
