export const AUX_SCHEMA_VERSION = '20260610-structured-search-v3'
export const COURSE_LIST_CACHE_SECONDS = 60
export const COURSE_LIST_CACHE_SWR_SECONDS = 300
export const D1_SAFE_BATCH_SIZE = 40
const PK_COURSE_DETAIL_LOOKUP_BATCH_SIZE = 25
export const SEARCH_ALIAS_MAP: Record<string, string[]> = {
  高数: ['高等数学'],
  线代: ['线性代数'],
  军理: ['军事理论'],
  复变: ['复变函数与积分变换'],
  思法: ['思想道德与法治'],
  毛概: ['毛泽东思想和中国特色社会主义理论体系概论'],
  近纲: ['中国近现代史纲要']
}

export function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function uniqueText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

export function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export function normalizeLooseSearchText(value: string) {
  return normalizeSearchText(value)
    .replace(/[\s()（）[\]【】{}<>《》"'`“”‘’、,，.。:：;；!！?？\-—_\\/·]/g, '')
    .toLowerCase()
}

export function parseSemesterNames(value: string | null | undefined) {
  return String(value || '')
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function buildCourseSearchMatchQuery(keyword: string) {
  const cleaned = normalizeSearchText(String(keyword || '').replace(/["']/g, ' '))
  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' AND ')
}

export function buildKeywordSearchVariants(keyword: string) {
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

export function buildLooseSqlExpr(column: string) {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), ' ', ''), '(', ''), ')', ''), '（', ''), '）', ''), '-', ''), '_', ''), '/', ''), '\\\\', ''), '·', ''))`
}

export function buildCourseSearchDocument(course: {
  code?: string | null
  name?: string | null
  department?: string | null
  teacher_name?: string | null
  teacher_tid?: string | null
}, aliases: string[], pkKeywords: string[] = []) {
  return normalizeSearchText([
    course.code,
    course.name,
    course.department,
    course.teacher_name,
    course.teacher_tid,
    ...aliases,
    ...pkKeywords
  ].join(' '))
}

export function combineSemesterNames(entries: Array<{ name: string; calendarId: number }>) {
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

export let dbInitPromise: Promise<void> | null = null
export async function ensureDbInitialized(db: D1Database) {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await ensureCourseAliasesTable(db)
      await ensurePkSearchIndexes(db)
      await ensureCourseSearchIndexes(db)
      await ensureReviewLikesTable(db)
      await ensureReviewReportsTable(db)
      await ensureReviewsWalletColumn(db)
      await ensureLegacyAutoDocsPurged(db)
      await ensureCourseAuxiliaryTables(db)
    })().catch((err) => {
      dbInitPromise = null // reset latch so next call retries
      throw err
    })
  }
  await dbInitPromise
}

export let showIcuCache: { value: boolean; expiresAt: number } | null = null

export function invalidateSettingCaches(key?: string) {
  if (!key || key === 'show_legacy_reviews') {
    showIcuCache = null
  }
}

type RuntimeEnv = { APP_ENV?: string }

export function isDevRuntime(env?: RuntimeEnv) {
  return String(env?.APP_ENV || '').trim().toLowerCase() === 'dev'
}

export function getMaintenanceSettingKeys(env?: RuntimeEnv) {
  if (isDevRuntime(env)) {
    return {
      modeKey: 'dev_maintenance_mode',
      configKey: 'dev_maintenance_config'
    }
  }

  return {
    modeKey: 'maintenance_mode',
    configKey: 'maintenance_config'
  }
}

export function resolveRuntimeSettingKey(key: string, env?: RuntimeEnv) {
  const keys = getMaintenanceSettingKeys(env)
  if (key === 'maintenance_mode') return keys.modeKey
  if (key === 'maintenance_config') return keys.configKey
  return key
}

export async function getShowIcuSetting(db: D1Database): Promise<boolean> {
  const now = Date.now()
  if (showIcuCache && showIcuCache.expiresAt > now) return showIcuCache.value

  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('show_legacy_reviews').first<{ value: string }>()
  const value = row?.value === 'true'
  showIcuCache = { value, expiresAt: now + 30_000 }
  return value
}

export async function getMaintenanceModeSetting(db: D1Database, env?: RuntimeEnv): Promise<boolean> {
  const { modeKey } = getMaintenanceSettingKeys(env)
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(modeKey).first<{ value: string }>()
  return row?.value === 'true'
}

export async function getMaintenanceConfigSetting(db: D1Database, env?: RuntimeEnv): Promise<any | null> {
  const { configKey } = getMaintenanceSettingKeys(env)
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(configKey).first<{ value: string }>()
  if (!row?.value) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export function parseSiteAnnouncements(value: string | null | undefined) {
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

export async function postCreditJcourseEvent(
  env: { CREDIT_API_BASE?: string; VITE_CREDIT_API_BASE?: string; CREDIT_JCOURSE_SECRET?: string; JCOURSE_INTEGRATION_SECRET?: string },
  payload: any
): Promise<{ ok: boolean; skipped?: boolean; error?: string; status?: number }> {
  const baseRaw = String(env.CREDIT_API_BASE || env.VITE_CREDIT_API_BASE || '').trim()
  const secret = String(env.CREDIT_JCOURSE_SECRET || env.JCOURSE_INTEGRATION_SECRET || '').trim()
  if (!baseRaw || !secret) return { ok: false, skipped: false, error: 'credit integration env not set' }

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

let courseAuxReadyCache: { value: boolean; expiresAt: number } | null = null

async function ensureCourseAliasesTable(db: D1Database) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS course_aliases (system TEXT NOT NULL, alias TEXT NOT NULL, course_id INTEGER NOT NULL, created_at INTEGER DEFAULT (strftime('%s','now')), PRIMARY KEY (system, alias))"
  ).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_course_aliases_course_id ON course_aliases(course_id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_course_aliases_system_alias ON course_aliases(system, alias)').run()
}

async function ensurePkSearchIndexes(db: D1Database) {
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_courseCode ON coursedetail(courseCode)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_newCourseCode ON coursedetail(newCourseCode)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_newCode ON coursedetail(newCode)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_courseName ON coursedetail(courseName)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_campus ON coursedetail(campus)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_coursedetail_faculty ON coursedetail(faculty)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_teachingClassId ON teacher(teachingClassId)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_teacherName ON teacher(teacherName)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_teacherCode ON teacher(teacherCode)').run() } catch {}
}

async function ensureCourseSearchIndexes(db: D1Database) {
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(name)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id)').run() } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers(name)').run() } catch {}
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

export async function materializePkCoursesToReviewSite(db: D1Database) {
  await ensureCourseAliasesTable(db)
  await db
    .prepare(
      `INSERT INTO teachers (name)
       SELECT DISTINCT TRIM(t.teacherName) AS name
       FROM teacher t
       WHERE TRIM(COALESCE(t.teacherName, '')) != ''
         AND NOT EXISTS (
           SELECT 1 FROM teachers tt WHERE tt.name = TRIM(t.teacherName)
         )`
    )
    .run()

  await db
    .prepare(
      `WITH
         course_teacher AS (
           SELECT
             cd.courseCode AS courseCode,
             MIN(TRIM(t.teacherName)) AS teacherName,
             GROUP_CONCAT(DISTINCT TRIM(t.teacherName)) AS teacherNames,
             GROUP_CONCAT(DISTINCT TRIM(t.teacherCode)) AS teacherCodes
           FROM coursedetail cd
           LEFT JOIN teacher t ON t.teachingClassId = cd.id
           WHERE TRIM(COALESCE(cd.courseCode, '')) != ''
           GROUP BY cd.courseCode
         ),
         course_base AS (
           SELECT
             cd.courseCode AS courseCode,
             MAX(COALESCE(NULLIF(TRIM(cd.courseName), ''), NULLIF(TRIM(cd.name), ''), cd.courseCode)) AS courseName,
             MAX(COALESCE(cd.credit, 0)) AS credit,
             MAX(COALESCE(f.facultyI18n, cd.faculty, '')) AS department,
             GROUP_CONCAT(DISTINCT TRIM(cd.code)) AS teachingClassCodes,
             GROUP_CONCAT(DISTINCT TRIM(cd.newCourseCode)) AS newCourseCodes,
             GROUP_CONCAT(DISTINCT TRIM(cd.newCode)) AS newCodes
           FROM coursedetail cd
           LEFT JOIN faculty f ON f.faculty = cd.faculty
           WHERE TRIM(COALESCE(cd.courseCode, '')) != ''
           GROUP BY cd.courseCode
         )
       INSERT INTO courses (
         code,
         name,
         credit,
         department,
         teacher_id,
         review_count,
         review_avg,
         search_keywords,
         is_legacy,
         is_icu
       )
       SELECT
         cb.courseCode AS code,
         cb.courseName AS name,
         cb.credit AS credit,
         cb.department AS department,
         tt.id AS teacher_id,
         0 AS review_count,
         0 AS review_avg,
         TRIM(
           cb.courseCode || ' ' ||
           cb.courseName || ' ' ||
           COALESCE(ct.teacherName, '') || ' ' ||
           COALESCE(ct.teacherNames, '') || ' ' ||
           COALESCE(ct.teacherCodes, '') || ' ' ||
           COALESCE(cb.teachingClassCodes, '') || ' ' ||
           COALESCE(cb.newCourseCodes, '') || ' ' ||
           COALESCE(cb.newCodes, '')
         ) AS search_keywords,
         0 AS is_legacy,
         0 AS is_icu
       FROM course_base cb
       LEFT JOIN course_teacher ct ON ct.courseCode = cb.courseCode
       LEFT JOIN teachers tt ON tt.name = ct.teacherName
       WHERE NOT EXISTS (
         SELECT 1 FROM courses c WHERE c.code = cb.courseCode AND c.is_legacy = 0
       )`
    )
    .run()

  await db
    .prepare(
      `UPDATE courses
       SET
         search_keywords = (
           SELECT TRIM(
             courses.code || ' ' ||
             courses.name || ' ' ||
             COALESCE(courses.department, '') || ' ' ||
             COALESCE(GROUP_CONCAT(DISTINCT TRIM(cd.code)), '') || ' ' ||
             COALESCE(GROUP_CONCAT(DISTINCT TRIM(cd.newCourseCode)), '') || ' ' ||
             COALESCE(GROUP_CONCAT(DISTINCT TRIM(cd.newCode)), '') || ' ' ||
             COALESCE(GROUP_CONCAT(DISTINCT TRIM(t.teacherCode)), '') || ' ' ||
             COALESCE(GROUP_CONCAT(DISTINCT TRIM(t.teacherName)), '')
           )
           FROM coursedetail cd
           LEFT JOIN teacher t ON t.teachingClassId = cd.id
           WHERE cd.courseCode = courses.code
              OR cd.newCourseCode = courses.code
              OR cd.code = courses.code
              OR cd.newCode = courses.code
         )
       WHERE is_legacy = 0
         AND EXISTS (
           SELECT 1
           FROM coursedetail cd
           WHERE cd.courseCode = courses.code
              OR cd.newCourseCode = courses.code
              OR cd.code = courses.code
              OR cd.newCode = courses.code
         )`
    )
    .run()

  await db
    .prepare(
      `UPDATE courses
       SET
         credit = (
           SELECT MAX(CAST(cd.credit AS REAL))
           FROM coursedetail cd
           WHERE cd.courseName = courses.name
             AND CAST(COALESCE(cd.credit, 0) AS REAL) > 0
             AND TRIM(COALESCE(cd.courseCode, '')) != ''
             AND LENGTH(courses.code) > LENGTH(cd.courseCode)
             AND SUBSTR(courses.code, 1, LENGTH(cd.courseCode)) = cd.courseCode
         )
       WHERE is_legacy = 0
         AND CAST(COALESCE(credit, 0) AS REAL) <= 0
         AND EXISTS (
           SELECT 1
           FROM coursedetail cd
           WHERE cd.courseName = courses.name
             AND CAST(COALESCE(cd.credit, 0) AS REAL) > 0
             AND TRIM(COALESCE(cd.courseCode, '')) != ''
             AND LENGTH(courses.code) > LENGTH(cd.courseCode)
             AND SUBSTR(courses.code, 1, LENGTH(cd.courseCode)) = cd.courseCode
         )`
    )
    .run()

  await db
    .prepare(
      `INSERT INTO course_aliases (system, alias, course_id)
       SELECT DISTINCT
         'onesystem' AS system,
         TRIM(alias.alias) AS alias,
         c.id AS course_id
       FROM (
         SELECT courseCode AS alias, courseCode AS courseCode
         FROM coursedetail
         WHERE TRIM(COALESCE(courseCode, '')) != ''
         UNION ALL
         SELECT code AS alias, courseCode AS courseCode
         FROM coursedetail
         WHERE TRIM(COALESCE(code, '')) != '' AND TRIM(COALESCE(courseCode, '')) != ''
         UNION ALL
         SELECT newCourseCode AS alias, courseCode AS courseCode
         FROM coursedetail
         WHERE TRIM(COALESCE(newCourseCode, '')) != '' AND TRIM(COALESCE(courseCode, '')) != ''
         UNION ALL
         SELECT newCode AS alias, courseCode AS courseCode
         FROM coursedetail
         WHERE TRIM(COALESCE(newCode, '')) != '' AND TRIM(COALESCE(courseCode, '')) != ''
       ) AS alias
       JOIN courses c ON c.code = alias.courseCode AND c.is_legacy = 0
       WHERE TRIM(COALESCE(alias.alias, '')) != ''
       ON CONFLICT(system, alias) DO UPDATE SET course_id = excluded.course_id`
    )
    .run()
}

export async function ensureReviewLikesTable(db: D1Database) {
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

export async function ensureReviewReportsTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS review_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(review_id, client_id),
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      )`
    )
    .run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_review_reports_review_id ON review_reports(review_id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_review_reports_status ON review_reports(status)').run()
}

export async function ensureReviewsWalletColumn(db: D1Database) {
  try {
    await db.prepare('ALTER TABLE reviews ADD COLUMN wallet_user_hash TEXT').run()
  } catch {
    // ignore: already exists
  }
  try {
    await db.prepare('ALTER TABLE reviews ADD COLUMN edit_token TEXT').run()
  } catch {
    // ignore: already exists
  }
}

async function ensureLegacyAutoDocsPurged(db: D1Database) {
  try {
    const key = 'legacy_auto_purged_v1'
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
    if (row?.value === 'true') return

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
    console.error('Failed to purge legacy AUTO docs:', e)
  }
}

export async function buildCourseAuxiliaryRecords(db: D1Database, courseIds?: number[]) {
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
  const codePkKeywordMap = new Map<string, string[]>()

  if (allCodes.length > 0) {
    for (const part of chunkArray(allCodes, PK_COURSE_DETAIL_LOOKUP_BATCH_SIZE)) {
      const placeholders = part.map(() => '?').join(',')
      const rows = await db
        .prepare(
          `SELECT
             cd.courseCode,
             cd.code,
             cd.newCourseCode,
             cd.newCode,
             cd.courseName,
             cd.name AS teachingClassName,
             cd.faculty,
             cd.campus,
             cd.calendarId,
             ca.calendarIdI18n AS semester_name,
             GROUP_CONCAT(DISTINCT t.teacherCode) AS teacher_codes,
             GROUP_CONCAT(DISTINCT t.teacherName) AS teacher_names
           FROM coursedetail cd
           JOIN calendar ca ON ca.calendarId = cd.calendarId
           LEFT JOIN teacher t ON t.teachingClassId = cd.id
           WHERE cd.courseCode IN (${placeholders})
              OR cd.code IN (${placeholders})
              OR cd.newCourseCode IN (${placeholders})
              OR cd.newCode IN (${placeholders})
           GROUP BY cd.id, cd.courseCode, cd.code, cd.newCourseCode, cd.newCode, cd.courseName, cd.name, cd.faculty, cd.campus, cd.calendarId, ca.calendarIdI18n`
        )
        .bind(...part, ...part, ...part, ...part)
        .all<any>()

      for (const row of rows.results || []) {
        const semesterName = String((row as any).semester_name || '').trim()
        const calendarId = Number((row as any).calendarId || 0)
        if (!semesterName || !Number.isFinite(calendarId)) continue
        const rowCodes = uniqueText([row.courseCode, row.code, row.newCourseCode, row.newCode])
        const pkKeywords = uniqueText([
          row.courseCode,
          row.code,
          row.newCourseCode,
          row.newCode,
          row.courseName,
          row.teachingClassName,
          row.faculty,
          row.campus,
          ...String(row.teacher_codes || '').split(','),
          ...String(row.teacher_names || '').split(',')
        ])
        for (const code of rowCodes) {
          if (!codeSemesterMap.has(code)) codeSemesterMap.set(code, [])
          codeSemesterMap.get(code)!.push({ name: semesterName, calendarId })
          if (!codePkKeywordMap.has(code)) codePkKeywordMap.set(code, [])
          codePkKeywordMap.get(code)!.push(...pkKeywords)
        }
      }
    }
  }

  return courseRows.map((row) => {
    const courseId = Number(row.id)
    const aliases = uniqueText(aliasMap.get(courseId) || [])
    const codes = uniqueText([row.code, ...aliases])
    const semesterEntries = codes.flatMap((code) => codeSemesterMap.get(code) || [])
    const pkKeywords = uniqueText(codes.flatMap((code) => codePkKeywordMap.get(code) || []))
    return {
      courseId,
      semesterNames: combineSemesterNames(semesterEntries),
      searchDoc: buildCourseSearchDocument(row, aliases, pkKeywords)
    }
  })
}

export async function deleteAuxiliaryCourseData(db: D1Database, courseIds: number[]) {
  const validCourseIds = Array.from(new Set(courseIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
  if (validCourseIds.length === 0) return

  for (const part of chunkArray(validCourseIds, D1_SAFE_BATCH_SIZE)) {
    const placeholders = part.map(() => '?').join(',')
    await db.prepare(`DELETE FROM course_semesters WHERE course_id IN (${placeholders})`).bind(...part).run()
    await db.prepare(`DELETE FROM course_search WHERE course_id IN (${placeholders})`).bind(...part).run()
  }
}

export async function upsertAuxiliaryCourseData(db: D1Database, courseIds?: number[]) {
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

export async function refreshAuxiliaryCourseData(db: D1Database, courseIds: number[]) {
  await ensureCourseAuxiliaryTables(db)
  await deleteAuxiliaryCourseData(db, courseIds)
  await upsertAuxiliaryCourseData(db, courseIds)
  courseAuxReadyCache = { value: true, expiresAt: Date.now() + 30_000 }
}

export async function rebuildAllAuxiliaryCourseData(db: D1Database) {
  await ensureCourseAuxiliaryTables(db)
  await db.prepare('DELETE FROM course_semesters').run()
  await db.prepare('DELETE FROM course_search').run()
  await upsertAuxiliaryCourseData(db)
}

export async function isAuxiliaryCourseDataReady(db: D1Database) {
  const now = Date.now()
  if (courseAuxReadyCache && courseAuxReadyCache.expiresAt > now) return courseAuxReadyCache.value

  await ensureCourseAuxiliaryTables(db)
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('aux_schema_version').first<{ value: string }>()
  const ready = row?.value === AUX_SCHEMA_VERSION
  courseAuxReadyCache = { value: ready, expiresAt: now + 30_000 }
  return ready
}

export async function getCourseSemesters(db: D1Database, courseId: number) {
  await ensureCourseAuxiliaryTables(db)
  let row = await db.prepare('SELECT semester_names FROM course_semesters WHERE course_id = ?').bind(courseId).first<{ semester_names: string | null }>()
  if (!row) {
    await refreshAuxiliaryCourseData(db, [courseId])
    row = await db.prepare('SELECT semester_names FROM course_semesters WHERE course_id = ?').bind(courseId).first<{ semester_names: string | null }>()
  }
  return parseSemesterNames(row?.semester_names)
}
