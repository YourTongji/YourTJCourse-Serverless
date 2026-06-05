import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { encodeReviewId, decodeReviewId } from './sqids'
import { registerPkRoutes } from './pk/routes'
import { syncOnesystemToPkTables } from './pk/sync'
import { refreshCourseStats } from './courseStats'

type Bindings = {
  DB: D1Database
  CAPTCHA_SITEVERIFY_URL: string
  ADMIN_SECRET: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_SITEVERIFY_URL?: string
  ONESYSTEM_COOKIE?: string
  CREDIT_API_BASE?: string
  CREDIT_JCOURSE_SECRET?: string
  // compat: some deployments may reuse frontend env name or Credit backend secret name
  VITE_CREDIT_API_BASE?: string
  JCOURSE_INTEGRATION_SECRET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

const ALLOWED_ORIGINS = [
  'https://xk.yourtj.de',
  'https://xk.xialing.icu',
  'https://jcourse.yourtj.de',
]

app.use('/*', cors({
  origin: (origin, c) => {
    // Allow requests with no origin (server-side, curl, etc.)
    if (!origin) return '*'
    // Allow known production origins
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    // Allow development origins (localhost + 127.0.0.1)
    try {
      const u = new URL(origin)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return origin
    } catch { /* ignore invalid URLs */ }
    return null // block everything else
  },
  allowHeaders: ['Content-Type', 'x-admin-secret', 'Cache-Control'],
  allowMethods: ['POST', 'GET', 'DELETE', 'PUT', 'OPTIONS']
}))

app.use('/*', async (c, next) => {
  await next()
  if (!c.res.headers.has('Cache-Control')) {
    c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    c.res.headers.set('Pragma', 'no-cache')
  }
})

// redeploy marker (no-op) v2

app.onError((err, c) => {
  console.error('Error:', err)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// pk(排课模拟器) 兼容接口：给嵌入的 Vue 子应用使用
registerPkRoutes(app)

type TurnstileSiteverifyResponse = {
  success?: boolean
  hostname?: string
  action?: string
  cdata?: string
  'error-codes'?: string[]
}

function isAllowedTurnstileHostname(hostname: string) {
  const value = String(hostname || '').trim().toLowerCase()
  if (!value) return false
  if (value === 'xk.yourtj.de') return true
  if (value === 'xk.xialing.icu') return true
  if (value === 'localhost') return true
  if (value.endsWith('.yourtj.de')) return true
  if (value.endsWith('.xialing.icu')) return true
  if (value.endsWith('.pages.dev')) return true
  return false
}

async function verifyTurnstile(token: string, env: Bindings, opts?: { expectedAction?: string; remoteip?: string }) {
  try {
    const secret = String(env.TURNSTILE_SECRET_KEY || '').trim()
    if (!secret) return { ok: false, error: 'missing_secret' as const }

    const response = String(token || '').trim()
    if (!response) return { ok: false, error: 'missing_token' as const }

    const url = String(env.TURNSTILE_SITEVERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify').trim()
    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', response)
    if (opts?.remoteip) body.set('remoteip', String(opts.remoteip))

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('Turnstile siteverify HTTP error:', res.status, text.slice(0, 200))
      return { ok: false, error: 'siteverify_http_error' as const }
    }

    const data = await res.json().catch(() => null) as TurnstileSiteverifyResponse | null
    if (!data || typeof data.success !== 'boolean') {
      console.error('Turnstile siteverify invalid response')
      return { ok: false, error: 'invalid_response' as const }
    }

    if (!data.success) {
      const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : []
      return { ok: false, error: 'verify_failed' as const, codes }
    }

    if (opts?.expectedAction) {
      if (String(data.action || '').trim() !== opts.expectedAction) {
        console.error('Turnstile action mismatch:', data.action, 'expected:', opts.expectedAction)
        return { ok: false, error: 'action_mismatch' as const }
      }
    }

    if (data.hostname && !isAllowedTurnstileHostname(data.hostname)) {
      console.error('Turnstile hostname not allowed:', data.hostname)
      return { ok: false, error: 'hostname_not_allowed' as const }
    }

    return { ok: true }
  } catch (e) {
    console.error('Turnstile service error:', e)
    return { ok: false, error: 'unknown_error' as const }
  }
}

// 启动前检查：服务端验证 Turnstile token（避免纯前端放行被自动化绕过）
app.post('/api/startup/verify', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const maintenanceMode = await getMaintenanceModeSetting(c.env.DB)
  if (maintenanceMode) {
    return c.json({ success: true, bypassed: 'maintenance_mode' })
  }

  const body = await c.req.json().catch(() => ({} as any))
  const token = String(body?.token || '').trim()
  if (!token) return c.json({ success: false, error: 'missing_token' }, 400)

  const remoteip = String(c.req.header('CF-Connecting-IP') || '').trim()
  const result = await verifyTurnstile(token, c.env, { expectedAction: 'startup_gate', remoteip })

  if (!result.ok) {
    return c.json({ success: false, error: result.error, codes: (result as any).codes || [] }, 403)
  }

  return c.json({ success: true })
})

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

const AUX_SCHEMA_VERSION = '20260605-query-opt-v2'
const COURSE_LIST_CACHE_SECONDS = 60
const COURSE_LIST_CACHE_SWR_SECONDS = 300
const D1_SAFE_BATCH_SIZE = 40
const SEARCH_ALIAS_MAP: Record<string, string[]> = {
  高数: ['高等数学'],
  线代: ['线性代数'],
  军理: ['军事理论'],
  复变: ['复变函数与积分变换'],
  思法: ['思想道德与法治'],
  毛概: ['毛泽东思想和中国特色社会主义理论体系概论'],
  近纲: ['中国近现代史纲要']
}

function buildCacheControl(maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
  return staleWhileRevalidateSeconds > 0
    ? `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
    : `public, max-age=${maxAgeSeconds}`
}

function buildJsonResponse(payload: unknown, cacheControl: string) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    }
  })
}

function setPublicCacheHeaders(c: any, maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
  c.header('Cache-Control', buildCacheControl(maxAgeSeconds, staleWhileRevalidateSeconds))
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function uniqueText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeLooseSearchText(value: string) {
  return normalizeSearchText(value)
    .replace(/[\s()（）[\]【】{}<>《》"'`“”‘’、,，.。:：;；!！?？\-—_\\/·]/g, '')
    .toLowerCase()
}

function parseSemesterNames(value: string | null | undefined) {
  return String(value || '')
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildCourseSearchMatchQuery(keyword: string) {
  const cleaned = normalizeSearchText(String(keyword || '').replace(/["']/g, ' '))
  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' AND ')
}

function buildKeywordSearchVariants(keyword: string) {
  const cleaned = normalizeSearchText(String(keyword || ''))
  if (!cleaned) return []

  const variants = new Set<string>([cleaned])
  const aliasValues = SEARCH_ALIAS_MAP[cleaned]
  if (aliasValues) {
    for (const alias of aliasValues) variants.add(alias)
  }

  const bracketed = cleaned.match(/^(.+?)([0-9]+|[一二三四五六七八九十]+)$/)
  if (bracketed && !/[()（）]/.test(cleaned)) {
    variants.add(`${bracketed[1]}(${bracketed[2]})`)
    variants.add(`${bracketed[1]}（${bracketed[2]}）`)
  }

  return Array.from(variants)
}

function buildLooseSqlExpr(column: string) {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), ' ', ''), '(', ''), ')', ''), '（', ''), '）', ''), '-', ''), '_', ''), '/', ''), '\\\\', ''), '·', ''))`
}

function buildCourseSearchDocument(course: {
  code?: string | null
  name?: string | null
  department?: string | null
  teacher_name?: string | null
  teacher_tid?: string | null
  search_keywords?: string | null
}, aliases: string[]) {
  return normalizeSearchText([
    course.code,
    course.name,
    course.department,
    course.teacher_name,
    course.teacher_tid,
    course.search_keywords,
    ...aliases
  ].join(' '))
}

function combineSemesterNames(entries: Array<{ name: string; calendarId: number }>) {
  const sorted = entries
    .filter((entry) => entry.name)
    .sort((left, right) => right.calendarId - left.calendarId)

  const seen = new Set<string>()
  const names: string[] = []
  for (const entry of sorted) {
    if (seen.has(entry.name)) continue
    seen.add(entry.name)
    names.push(entry.name)
  }
  return names.join('||')
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

async function ensureCourseAuxiliaryTables(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS course_semesters (
      course_id INTEGER PRIMARY KEY,
      semester_names TEXT DEFAULT ''
    )`
  ).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_course_semesters_course_id ON course_semesters(course_id)').run()

  try {
    await db.prepare(
      "CREATE VIRTUAL TABLE IF NOT EXISTS course_search USING fts5(course_id UNINDEXED, search_doc, tokenize='trigram')"
    ).run()
  } catch {
    await db.prepare(
      'CREATE VIRTUAL TABLE IF NOT EXISTS course_search USING fts5(course_id UNINDEXED, search_doc)'
    ).run()
  }
}

async function buildCourseAuxiliaryRecords(db: D1Database, courseIds?: number[]) {
  const validCourseIds = Array.from(new Set((courseIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
  const scoped = validCourseIds.length > 0

  const courseRows: Array<{
    id: number
    code: string
    name: string
    department: string | null
    search_keywords: string | null
    teacher_name: string | null
    teacher_tid: string | null
  }> = []

  if (scoped) {
    for (const part of chunkArray(validCourseIds, D1_SAFE_BATCH_SIZE)) {
      const placeholders = part.map(() => '?').join(',')
      const rows = await db
        .prepare(
          `SELECT
             c.id,
             c.code,
             c.name,
             c.department,
             c.search_keywords,
             t.name AS teacher_name,
             t.tid AS teacher_tid
           FROM courses c
           LEFT JOIN teachers t ON t.id = c.teacher_id
           WHERE c.id IN (${placeholders})`
        )
        .bind(...part)
        .all<any>()
      if (rows.results?.length) courseRows.push(...(rows.results as any[]))
    }
  } else {
    const rows = await db
      .prepare(
        `SELECT
           c.id,
           c.code,
           c.name,
           c.department,
           c.search_keywords,
           t.name AS teacher_name,
           t.tid AS teacher_tid
         FROM courses c
         LEFT JOIN teachers t ON t.id = c.teacher_id`
      )
      .all<any>()
    if (rows.results?.length) courseRows.push(...(rows.results as any[]))
  }

  if (courseRows.length === 0) return []

  const aliasMap = new Map<number, string[]>()
  if (scoped) {
    for (const part of chunkArray(validCourseIds, D1_SAFE_BATCH_SIZE)) {
      const placeholders = part.map(() => '?').join(',')
      const rows = await db
        .prepare(
          `SELECT course_id, alias
           FROM course_aliases
           WHERE system = 'onesystem' AND course_id IN (${placeholders})`
        )
        .bind(...part)
        .all<{ course_id: number; alias: string }>()
      for (const row of rows.results || []) {
        const courseId = Number((row as any).course_id)
        if (!aliasMap.has(courseId)) aliasMap.set(courseId, [])
        aliasMap.get(courseId)!.push(String((row as any).alias || '').trim())
      }
    }
  } else {
    const rows = await db
      .prepare("SELECT course_id, alias FROM course_aliases WHERE system = 'onesystem'")
      .all<{ course_id: number; alias: string }>()
    for (const row of rows.results || []) {
      const courseId = Number((row as any).course_id)
      if (!aliasMap.has(courseId)) aliasMap.set(courseId, [])
      aliasMap.get(courseId)!.push(String((row as any).alias || '').trim())
    }
  }

  const allCodes = uniqueText(courseRows.flatMap((row) => [row.code, ...(aliasMap.get(Number(row.id)) || [])]))
  const codeSemesterMap = new Map<string, Array<{ name: string; calendarId: number }>>()

  if (allCodes.length > 0) {
    for (const part of chunkArray(allCodes, D1_SAFE_BATCH_SIZE)) {
      const placeholders = part.map(() => '?').join(',')
      const rows = await db
        .prepare(
          `SELECT
             cd.courseCode,
             cd.newCourseCode,
             cd.calendarId,
             ca.calendarIdI18n AS semester_name
           FROM coursedetail cd
           JOIN calendar ca ON ca.calendarId = cd.calendarId
           WHERE cd.courseCode IN (${placeholders})
              OR cd.newCourseCode IN (${placeholders})`
        )
        .bind(...part, ...part)
        .all<any>()

      for (const row of rows.results || []) {
        const semesterName = String((row as any).semester_name || '').trim()
        const calendarId = Number((row as any).calendarId || 0)
        if (!semesterName || !Number.isFinite(calendarId)) continue
        for (const code of uniqueText([row.courseCode, row.newCourseCode])) {
          if (!codeSemesterMap.has(code)) codeSemesterMap.set(code, [])
          codeSemesterMap.get(code)!.push({ name: semesterName, calendarId })
        }
      }
    }
  }

  return courseRows.map((row) => {
    const courseId = Number(row.id)
    const aliases = uniqueText(aliasMap.get(courseId) || [])
    const codes = uniqueText([row.code, ...aliases])
    const semesterEntries = codes.flatMap((code) => codeSemesterMap.get(code) || [])
    return {
      courseId,
      semesterNames: combineSemesterNames(semesterEntries),
      searchDoc: buildCourseSearchDocument(row, aliases)
    }
  })
}

async function deleteAuxiliaryCourseData(db: D1Database, courseIds: number[]) {
  const validCourseIds = Array.from(new Set(courseIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
  if (validCourseIds.length === 0) return

  for (const part of chunkArray(validCourseIds, D1_SAFE_BATCH_SIZE)) {
    const placeholders = part.map(() => '?').join(',')
    await db.prepare(`DELETE FROM course_semesters WHERE course_id IN (${placeholders})`).bind(...part).run()
    await db.prepare(`DELETE FROM course_search WHERE course_id IN (${placeholders})`).bind(...part).run()
  }
}

async function upsertAuxiliaryCourseData(db: D1Database, courseIds?: number[]) {
  const records = await buildCourseAuxiliaryRecords(db, courseIds)
  if (records.length === 0) return

  for (const record of records) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO course_semesters (course_id, semester_names)
         VALUES (?, ?)`
      )
      .bind(record.courseId, record.semesterNames)
      .run()
  }

  for (const record of records) {
    await db
      .prepare('INSERT INTO course_search (course_id, search_doc) VALUES (?, ?)')
      .bind(record.courseId, record.searchDoc)
      .run()
  }
}

async function refreshAuxiliaryCourseData(db: D1Database, courseIds: number[]) {
  await ensureCourseAuxiliaryTables(db)
  await deleteAuxiliaryCourseData(db, courseIds)
  await upsertAuxiliaryCourseData(db, courseIds)
  courseAuxReadyCache = { value: true, expiresAt: Date.now() + 30_000 }
}

async function rebuildAllAuxiliaryCourseData(db: D1Database) {
  await ensureCourseAuxiliaryTables(db)
  await db.prepare('DELETE FROM course_semesters').run()
  await db.prepare('DELETE FROM course_search').run()
  await upsertAuxiliaryCourseData(db)
}

let courseAuxReadyCache: { value: boolean; expiresAt: number } | null = null
let courseAuxBuildPromise: Promise<void> | null = null

async function isAuxiliaryCourseDataReady(db: D1Database) {
  const now = Date.now()
  if (courseAuxReadyCache && courseAuxReadyCache.expiresAt > now) return courseAuxReadyCache.value

  await ensureCourseAuxiliaryTables(db)
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('aux_schema_version').first<{ value: string }>()
  const ready = row?.value === AUX_SCHEMA_VERSION
  courseAuxReadyCache = { value: ready, expiresAt: now + 30_000 }
  return ready
}

async function ensureAuxiliaryCourseData(db: D1Database) {
  await ensureCourseAuxiliaryTables(db)
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('aux_schema_version').first<{ value: string }>()
  if (row?.value === AUX_SCHEMA_VERSION) {
    courseAuxReadyCache = { value: true, expiresAt: Date.now() + 30_000 }
    return
  }

  await rebuildAllAuxiliaryCourseData(db)
  await db
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind('aux_schema_version', AUX_SCHEMA_VERSION)
    .run()
  courseAuxReadyCache = { value: true, expiresAt: Date.now() + 30_000 }
}

function triggerAuxiliaryCourseDataBuild(db: D1Database) {
  if (!courseAuxBuildPromise) {
    courseAuxBuildPromise = ensureAuxiliaryCourseData(db)
      .catch((error) => {
        courseAuxReadyCache = { value: false, expiresAt: Date.now() + 10_000 }
        console.error('Failed to build course auxiliary data:', error)
      })
      .finally(() => {
        courseAuxBuildPromise = null
      })
  }
  return courseAuxBuildPromise
}

async function getCourseSemesters(db: D1Database, courseId: number) {
  await ensureCourseAuxiliaryTables(db)
  let row = await db.prepare('SELECT semester_names FROM course_semesters WHERE course_id = ?').bind(courseId).first<{ semester_names: string | null }>()
  if (!row) {
    await refreshAuxiliaryCourseData(db, [courseId])
    row = await db.prepare('SELECT semester_names FROM course_semesters WHERE course_id = ?').bind(courseId).first<{ semester_names: string | null }>()
  }
  return parseSemesterNames(row?.semester_names)
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
      await ensureCourseAuxiliaryTables(db)
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
      for (const part of chunkArray(idList, D1_SAFE_BATCH_SIZE)) {
        const placeholders = part.map(() => '?').join(',')
        await db.prepare(`DELETE FROM reviews WHERE course_id IN (${placeholders})`).bind(...part).run()
        await db.prepare(`DELETE FROM course_aliases WHERE course_id IN (${placeholders})`).bind(...part).run()
        await db.prepare(`DELETE FROM courses WHERE id IN (${placeholders})`).bind(...part).run()
      }
    }

    await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'true')`).bind(key).run()
  } catch (e) {
    // best-effort; don't block API
    console.error('Failed to purge legacy AUTO docs:', e)
  }
}

let showIcuCache: { value: boolean; expiresAt: number } | null = null

function invalidateSettingCaches(key?: string) {
  if (!key || key === 'show_legacy_reviews') {
    showIcuCache = null
  }
}

async function getShowIcuSetting(db: D1Database): Promise<boolean> {
  const now = Date.now()
  if (showIcuCache && showIcuCache.expiresAt > now) return showIcuCache.value

  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('show_legacy_reviews').first<{ value: string }>()
  const value = row?.value === 'true'
  showIcuCache = { value, expiresAt: now + 30_000 }
  return value
}

async function getMaintenanceModeSetting(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('maintenance_mode').first<{ value: string }>()
  return row?.value === 'true'
}

async function getMaintenanceConfigSetting(db: D1Database): Promise<any | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('maintenance_config').first<{ value: string }>()
  if (!row?.value) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

function parseSiteAnnouncements(value: string | null | undefined) {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed
          .map((item) => ({
            id: String(item?.id || ''),
            type: ['info', 'warning', 'error', 'success'].includes(String(item?.type)) ? String(item?.type) : 'info',
            content: String(item?.content || '').trim(),
            enabled: item?.enabled !== false
          }))
          .filter((item) => item.id && item.content && item.enabled)
      : []
  } catch {
    return []
  }
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
  setPublicCacheHeaders(c, 30, 60)
  return c.json({ show_icu: showIcu })
})

app.get('/api/settings/runtime-state', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const [maintenanceEnabled, maintenanceConfig, announcementsRow] = await Promise.all([
    getMaintenanceModeSetting(c.env.DB),
    getMaintenanceConfigSetting(c.env.DB),
    c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('site_announcements').first<{ value: string }>()
  ])

  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  return c.json({
    maintenance: {
      enabled: maintenanceEnabled,
      config: maintenanceConfig
    },
    announcements: parseSiteAnnouncements(announcementsRow?.value),
    updatedAt: Date.now()
  })
})

app.get('/api/settings/announcements', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const row = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('site_announcements').first<{ value: string }>()

  if (!row?.value) {
    setPublicCacheHeaders(c, 60, 300)
    return c.json({ announcements: [] })
  }

  try {
    const announcements = parseSiteAnnouncements(row.value)
    setPublicCacheHeaders(c, 60, 300)
    return c.json({ announcements })
  } catch {
    setPublicCacheHeaders(c, 60, 300)
    return c.json({ announcements: [] })
  }
})

app.get('/api/settings/maintenance', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const enabled = await getMaintenanceModeSetting(c.env.DB)
  const config = await getMaintenanceConfigSetting(c.env.DB)
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  return c.json({ enabled, config })
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
    setPublicCacheHeaders(c, 300, 900)
    return c.json({ departments })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.get('/api/courses', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const keyword = (c.req.query('q') || '').trim()
    const departments = c.req.query('departments') // 逗号分隔的开课单位列表
    const onlyWithReviews = c.req.query('onlyWithReviews') === 'true'
    const courseName = (c.req.query('courseName') || '').trim()
    const courseCode = (c.req.query('courseCode') || '').trim()
    const teacherName = (c.req.query('teacherName') || '').trim()
    const teacherCode = (c.req.query('teacherCode') || '').trim()
    const campus = (c.req.query('campus') || '').trim()
    const faculty = (c.req.query('faculty') || '').trim()
    const includeTotal = c.req.query('includeTotal') === 'true'
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20', 10) || 20))
    const offset = (page - 1) * limit

    // 检查是否显示 is_icu 数据
    const showIcu = await getShowIcuSetting(c.env.DB)
    const courseAuxReady = await isAuxiliaryCourseDataReady(c.env.DB)
    if (!courseAuxReady) {
      c.executionCtx.waitUntil(triggerAuxiliaryCourseDataBuild(c.env.DB))
    }
    const canUseWorkerCache = !includeTotal

    if (canUseWorkerCache) {
      const cacheUrl = new URL(c.req.url)
      cacheUrl.searchParams.set('__showIcu', showIcu ? '1' : '0')
      const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
      try {
        const cached = await caches.default.match(cacheKey)
        if (cached) return cached
      } catch {
        // ignore cache failures
      }
    }

    let baseWhere = ' WHERE 1=1'
    const baseParams: any[] = []
    const ctes: string[] = []
    const cteParams: any[] = []

    // 当关闭乌龙茶显示时，过滤掉 is_icu=1 的课程
    if (!showIcu) {
      baseWhere += ' AND (c.is_icu = 0 OR c.is_icu IS NULL)'
    }

    // safety: ignore any leftover AUTO legacy docs (should have been purged)
    baseWhere += " AND NOT (c.is_legacy = 1 AND c.code LIKE '%AUTO%')"

    if (keyword) {
      const ftsQuery = courseAuxReady ? buildCourseSearchMatchQuery(keyword) : ''
      const rawVariants = buildKeywordSearchVariants(keyword)
      const looseVariants = Array.from(new Set(rawVariants.map((item) => normalizeLooseSearchText(item)).filter(Boolean)))
      const keywordClauses: string[] = []

      if (courseAuxReady && ftsQuery) {
        keywordClauses.push('c.id IN (SELECT course_id FROM course_search WHERE search_doc MATCH ?)')
        baseParams.push(ftsQuery)
      }

      if (rawVariants.length > 0) {
        const perVariant = '(c.search_keywords LIKE ? OR c.code LIKE ? OR c.name LIKE ? OR t.name LIKE ?)'
        keywordClauses.push(rawVariants.map(() => perVariant).join(' OR '))
        for (const variant of rawVariants) {
          const likeKey = `%${variant}%`
          baseParams.push(likeKey, likeKey, likeKey, likeKey)
        }
      }

      if (looseVariants.length > 0) {
        const looseExprs = [
          buildLooseSqlExpr('c.search_keywords'),
          buildLooseSqlExpr('c.code'),
          buildLooseSqlExpr('c.name'),
          buildLooseSqlExpr('t.name')
        ]
        const perVariant = `(${looseExprs.map((expr) => `${expr} LIKE ?`).join(' OR ')})`
        keywordClauses.push(looseVariants.map(() => perVariant).join(' OR '))
        for (const variant of looseVariants) {
          const likeKey = `%${variant}%`
          baseParams.push(likeKey, likeKey, likeKey, likeKey)
        }
      }

      if (keywordClauses.length > 0) {
        baseWhere += ` AND (${keywordClauses.join(' OR ')})`
      }
    }

    // 课程代码（支持别名）
    if (courseCode) {
      baseWhere +=
        " AND (c.code LIKE ? OR EXISTS (SELECT 1 FROM course_aliases a WHERE a.system = 'onesystem' AND a.course_id = c.id AND a.alias LIKE ?))"
      const likeCode = `%${courseCode}%`
      baseParams.push(likeCode, likeCode)
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

      ctes.push(`
        pk_match AS (
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
      `)

      baseWhere += ` AND c.id IN (SELECT id FROM pk_match)`

      cteParams.push(...pkParams, ...pkParams)
    }

    // 开课单位筛选
    if (departments) {
      const deptList = departments.split(',').filter(d => d.trim())
      if (deptList.length > 0) {
        const placeholders = deptList.map(() => '?').join(',')
        baseWhere += ` AND c.department IN (${placeholders})`
        baseParams.push(...deptList)
      }
    }

    const groupKey = `c.code, c.name, COALESCE(t.name, '')`
    const having = onlyWithReviews ? 'HAVING SUM(COALESCE(c.review_count, 0)) > 0' : ''
    const representativeValueExpr = `COALESCE(
      MAX(CASE WHEN c.is_legacy = 0 THEN printf('%010d|%s', c.id, c.code) END),
      MAX(printf('%010d|%s', c.id, c.code))
    )`

    ctes.push(`
      aggregated AS (
        SELECT
          CAST(substr(${representativeValueExpr}, 1, 10) AS INTEGER) AS id,
          substr(${representativeValueExpr}, 12) AS code,
          c.name AS name,
          CASE
            WHEN SUM(COALESCE(c.review_count, 0)) > 0
              THEN ROUND(SUM(COALESCE(c.review_avg, 0) * COALESCE(c.review_count, 0)) * 1.0 / SUM(COALESCE(c.review_count, 0)), 4)
            ELSE 0
          END AS rating,
          SUM(COALESCE(c.review_count, 0)) AS review_count,
          CASE WHEN SUM(CASE WHEN c.is_legacy = 0 THEN 1 ELSE 0 END) > 0 THEN 0 ELSE 1 END AS is_legacy,
          COALESCE(t.name, '') AS teacher_name,
          COALESCE(MAX(CASE WHEN c.is_legacy = 0 THEN c.department END), MAX(c.department)) AS department,
          COALESCE(MAX(CASE WHEN c.is_legacy = 0 THEN c.credit END), MAX(c.credit), 0) AS credit
        FROM courses c
        LEFT JOIN teachers t ON c.teacher_id = t.id
        ${baseWhere}
        GROUP BY ${groupKey}
        ${having}
      )
    `)

    const withClause = `WITH ${ctes.join(',\n')}`
    const queryParams = [...cteParams, ...baseParams]

    let total: number | undefined
    if (includeTotal) {
      const countResult = await c.env.DB
        .prepare(`${withClause} SELECT COUNT(*) AS total FROM aggregated`)
        .bind(...queryParams)
        .first<{ total: number }>()
      total = Number(countResult?.total || 0)
    }

    const queryLimit = includeTotal ? limit : limit + 1
    const { results } = await c.env.DB
      .prepare(
        `${withClause}
         SELECT
           a.*,
           COALESCE(cs.semester_names, '') AS semester_names
         FROM aggregated a
         LEFT JOIN course_semesters cs ON cs.course_id = a.id
         ORDER BY a.review_count DESC, a.rating DESC, a.id DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...queryParams, queryLimit, offset)
      .all()

    const rawRows = (results || []) as any[]
    const hasMore = !includeTotal && rawRows.length > limit
    const visibleRows = hasMore ? rawRows.slice(0, limit) : rawRows

    const normalized = visibleRows.map((r: any) => ({
      ...r,
      semesters: parseSemesterNames(r.semester_names)
    }))

    const payload: Record<string, any> = { data: normalized, page, limit, hasMore }
    if (typeof total === 'number') {
      payload.total = total
      payload.totalPages = Math.ceil(total / limit)
    }

    if (!canUseWorkerCache) {
      setPublicCacheHeaders(c, 15, 30)
      return c.json(payload)
    }

    const cacheUrl = new URL(c.req.url)
    cacheUrl.searchParams.set('__showIcu', showIcu ? '1' : '0')
    const response = buildJsonResponse(payload, buildCacheControl(COURSE_LIST_CACHE_SECONDS, COURSE_LIST_CACHE_SWR_SECONDS))
    c.executionCtx.waitUntil(caches.default.put(new Request(cacheUrl.toString(), { method: 'GET' }), response.clone()))
    return response
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

    const semesters = await getCourseSemesters(c.env.DB, Number((course as any).id)).catch(() => [])

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

app.get('/api/course/:id/related', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const id = Number(c.req.param('id') || '0')
    if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'Invalid course id' }, 400)

    const showIcu = await getShowIcuSetting(c.env.DB)

    const course = await c.env.DB.prepare(
      `SELECT c.id, c.code, c.name, c.teacher_id, c.is_icu
       FROM courses c
       WHERE c.id = ?`
    ).bind(id).first<any>()

    if (!course) return c.json({ error: 'Course not found' }, 404)
    if (!showIcu && Number(course.is_icu || 0) === 1) return c.json({ error: 'Course not found' }, 404)

    const sourceFilter = showIcu ? '' : ' AND (c.is_icu = 0 OR c.is_icu IS NULL)'
    const otherSourceFilter = showIcu ? '' : ' AND (other.is_icu = 0 OR other.is_icu IS NULL)'

    let teacherOtherCourses: any[] = []
    if (course.teacher_id) {
      const res = await c.env.DB.prepare(
        `SELECT
           c.id,
           c.code,
           c.name,
           COALESCE(t.name, '') AS teacher_name,
           COALESCE(c.review_avg, 0) AS review_avg,
           COALESCE(c.review_count, 0) AS review_count
         FROM courses c
         LEFT JOIN teachers t ON t.id = c.teacher_id
         WHERE c.teacher_id = ?
           AND c.id != ?
           AND NOT (c.is_legacy = 1 AND c.code LIKE '%AUTO%')
           ${sourceFilter}
         ORDER BY c.review_count DESC, c.review_avg DESC, c.id DESC
         LIMIT 5`
      ).bind(course.teacher_id, id).all()
      teacherOtherCourses = res.results || []
    }

    let sameCourseOtherTeachers: any[] = []
    if (course.code && !String(course.code).startsWith('AUTO')) {
      const res = await c.env.DB.prepare(
        `SELECT
           other.id,
           other.code,
           other.name,
           COALESCE(t.name, '') AS teacher_name,
           COALESCE(other.review_avg, 0) AS review_avg,
           COALESCE(other.review_count, 0) AS review_count
         FROM courses other
         LEFT JOIN teachers t ON t.id = other.teacher_id
         WHERE other.code = ?
           AND other.id != ?
           AND COALESCE(other.teacher_id, -1) != COALESCE(?, -1)
           AND NOT (other.is_legacy = 1 AND other.code LIKE '%AUTO%')
           ${otherSourceFilter}
         ORDER BY other.review_count DESC, other.review_avg DESC, other.id DESC
         LIMIT 5`
      ).bind(course.code, id, course.teacher_id ?? null).all()
      sameCourseOtherTeachers = res.results || []
    }

    if (sameCourseOtherTeachers.length === 0) {
      const res = await c.env.DB.prepare(
        `SELECT
           other.id,
           other.code,
           other.name,
           COALESCE(t.name, '') AS teacher_name,
           COALESCE(other.review_avg, 0) AS review_avg,
           COALESCE(other.review_count, 0) AS review_count
         FROM courses other
         LEFT JOIN teachers t ON t.id = other.teacher_id
         WHERE other.name = ?
           AND other.id != ?
           AND COALESCE(other.teacher_id, -1) != COALESCE(?, -1)
           AND NOT (other.is_legacy = 1 AND other.code LIKE '%AUTO%')
           ${otherSourceFilter}
         ORDER BY
           CASE WHEN other.code = ? THEN 0 ELSE 1 END,
           other.review_count DESC,
           other.review_avg DESC,
           other.id DESC
         LIMIT 5`
      ).bind(course.name, id, course.teacher_id ?? null, course.code || '').all()
      sameCourseOtherTeachers = res.results || []
    }

    setPublicCacheHeaders(c, 60, 300)
    return c.json({
      teacher_other_courses: teacherOtherCourses,
      same_course_other_teachers: sameCourseOtherTeachers
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
    const teacherCode = (c.req.query('teacherCode') || '').trim()
    const clientId = (c.req.query('clientId') || '').trim()
    const hasTeacherFilter = Boolean(teacherCode || teacherName)

    const buildTeacherFilter = (codeColumn: string, nameColumn: string) => {
      if (teacherCode && teacherName) {
        return {
          sql: ` AND (${codeColumn} = ? OR ${nameColumn} = ?)`,
          args: [teacherCode, teacherName] as string[]
        }
      }
      if (teacherCode) {
        return {
          sql: ` AND ${codeColumn} = ?`,
          args: [teacherCode] as string[]
        }
      }
      if (teacherName) {
        return {
          sql: ` AND ${nameColumn} = ?`,
          args: [teacherName] as string[]
        }
      }
      return {
        sql: '',
        args: [] as string[]
      }
    }

    // ICU 显示开关
    const showIcu = await getShowIcuSetting(c.env.DB)

    const pkTeacherFilter = buildTeacherFilter('pt.teacherCode', 'pt.teacherName')
    const courseTeacherFilter = buildTeacherFilter('t.tid', 't.name')

    // 先用排课库里的课名 + 教师做一次精确定位，避免像体育课这种同总课号下多个老师都落到旧 canonical 课程上
    const pkNamedRow = hasTeacherFilter
      ? await c.env.DB
          .prepare(
            `SELECT c.id as id
             FROM courses c
             LEFT JOIN teachers t ON c.teacher_id = t.id
             WHERE c.name IN (
               SELECT DISTINCT cd.courseName
               FROM coursedetail cd
               LEFT JOIN teacher pt ON pt.teachingClassId = cd.id
               WHERE (cd.code = ? OR cd.courseCode = ? OR cd.newCourseCode = ?)
               ${pkTeacherFilter.sql}
             )
             ${courseTeacherFilter.sql}
             ORDER BY COALESCE(c.review_count, 0) DESC, c.id DESC
             LIMIT 1`
          )
          .bind(code, code, code, ...pkTeacherFilter.args, ...courseTeacherFilter.args)
          .first<{ id: number }>()
      : null

    // 若带 teacherName / teacherCode：再尝试命中“课号/别名 + 教师”，避免同课号不同老师的评价混在一起
    const preferredRow = pkNamedRow?.id
      ? pkNamedRow
      : hasTeacherFilter
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
             ${courseTeacherFilter.sql}
             LIMIT 1`
          )
          .bind(code, code, ...courseTeacherFilter.args)
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

    let courseId = preferredRow?.id ?? aliasRow?.id ?? directRow?.id ?? null

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
      await refreshAuxiliaryCourseData(c.env.DB, [Number(courseId)])
    }

    let course = await c.env.DB.prepare(
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
    // - 若带 teacherCode / teacherName：只按“同课程名 + 同教师”聚合（避免同课号不同老师混入）
    const matchedIds = new Set<number>()

    if (!hasTeacherFilter) {
      matchedIds.add(Number(courseId))
      const sameCodeRows = await c.env.DB.prepare('SELECT id FROM courses WHERE code = ?').bind((course as any).code).all<{ id: number }>()
      for (const r of sameCodeRows.results || []) matchedIds.add(Number((r as any).id))
    }

    if (hasTeacherFilter) {
      const sameNameTeacherRows = await c.env.DB
        .prepare(
          `SELECT c.id as id
           FROM courses c
           LEFT JOIN teachers t ON c.teacher_id = t.id
           WHERE c.name = ?
           ${courseTeacherFilter.sql}
           ORDER BY COALESCE(c.review_count, 0) DESC, c.id DESC`
        )
        .bind((course as any).name, ...courseTeacherFilter.args)
        .all<{ id: number }>()

      for (const r of sameNameTeacherRows.results || []) matchedIds.add(Number((r as any).id))

      const primaryMatchedId = Number((sameNameTeacherRows.results || [])[0]?.id || 0)
      if (primaryMatchedId && primaryMatchedId !== Number(courseId)) {
        const matchedCourse = await c.env.DB.prepare(
          `SELECT c.*, t.name as teacher_name FROM courses c
           LEFT JOIN teachers t ON c.teacher_id = t.id
           WHERE c.id = ?`
        ).bind(primaryMatchedId).first()
        if (matchedCourse) {
          course = matchedCourse
          courseId = primaryMatchedId
        }
      }

      if (matchedIds.size === 0) matchedIds.add(Number(courseId))
    } else if ((course as any).teacher_id) {
      const sameNameTeacherRows = await c.env.DB
        .prepare('SELECT id FROM courses WHERE name = ? AND teacher_id = ?')
        .bind((course as any).name, (course as any).teacher_id)
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

    const semesters = await getCourseSemesters(c.env.DB, Number(courseId)).catch(() => [])

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

  await refreshCourseStats(c.env.DB, Number(course_id))

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

  await refreshCourseStats(c.env.DB, Number(existing.course_id))

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

// Simple in-memory rate limiter (per-isolate; reset on cold start)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

admin.use('/*', async (c, next) => {
  const input = c.req.header('x-admin-secret')
  if (!input || input !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Rate limit by client IP
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Too many requests' }, 429)
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

    await rebuildAllAuxiliaryCourseData(c.env.DB)
    await c.env.DB
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind('aux_schema_version', AUX_SCHEMA_VERSION)
      .run()

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
    await refreshCourseStats(c.env.DB, Number(review.course_id))
  }

  return c.json({ success: true })
})

admin.post('/review/:id/toggle', async (c) => {
  const id = c.req.param('id')
  // 先获取评论的course_id
  const review = await c.env.DB.prepare('SELECT course_id FROM reviews WHERE id = ?').bind(id).first<{course_id: number}>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  await c.env.DB.prepare('UPDATE reviews SET is_hidden = NOT is_hidden WHERE id = ?').bind(id).run()

  await refreshCourseStats(c.env.DB, Number(review.course_id))

  return c.json({ success: true })
})

admin.delete('/review/:id', async (c) => {
  const id = c.req.param('id')
  // 先获取评论的course_id
  const review = await c.env.DB.prepare('SELECT course_id FROM reviews WHERE id = ?').bind(id).first<{course_id: number}>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  await c.env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run()

  await refreshCourseStats(c.env.DB, Number(review.course_id))

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

  await refreshAuxiliaryCourseData(c.env.DB, [Number(id)])

  return c.json({ success: true })
})

admin.delete('/course/:id', async (c) => {
  const id = c.req.param('id')
  // 先删除关联的评论
  await c.env.DB.prepare('DELETE FROM reviews WHERE course_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM course_aliases WHERE course_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(id).run()
  await deleteAuxiliaryCourseData(c.env.DB, [Number(id)])
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

  await refreshAuxiliaryCourseData(c.env.DB, [Number(result.meta.last_row_id)])

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
  invalidateSettingCaches(key)
  return c.json({ success: true })
})

app.route('/api/admin', admin)

export default app
