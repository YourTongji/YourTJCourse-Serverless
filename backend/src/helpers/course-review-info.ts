// 批量评课统计 + 课程解析共享逻辑。
//
// 背景（#179）：Flutter 排课器为每个教学班单独请求 /api/course/by-code，
// 校园网 NAT 下多用户共享出口 IP 时极易触发限流。批量端点把 N 个请求合并为 1 个，
// 并对统计结果做短 TTL 模块内缓存（评价变更时整体失效）。
//
// 注意：本模块刻意保持零 import（统计分块逻辑本地实现），
// 使 node --experimental-strip-types --test 可以直接加载测试。

export const REVIEW_INFO_BATCH_MAX_ITEMS = 100
const REVIEW_INFO_CACHE_TTL_MS = 60_000
const REVIEW_INFO_CACHE_MAX_ENTRIES = 2_000
// 与 helpers/db.ts 的 D1_SAFE_BATCH_SIZE 保持一致（避免循环依赖而本地声明）
const REVIEW_STATS_D1_SAFE_BATCH_SIZE = 40

export type ReviewInfoQuery = {
  code: string
  teacherCode: string
  teacherName: string
}

export type CourseReviewStats = {
  found: boolean
  review_count: number
  review_avg: number
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

// ---------- 请求体归一化 ----------

function normalizeReviewInfoItem(raw: unknown): ReviewInfoQuery | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const code = String(rec.code ?? rec.courseCode ?? '').trim().slice(0, 64)
  if (!code) return null
  const teacherCode = String(rec.teacherCode ?? '').trim().slice(0, 64)
  const teacherName = String(rec.teacherName ?? '').trim().slice(0, 128)
  return { code, teacherCode, teacherName }
}

export function normalizeReviewInfoBatch(
  raw: unknown
): { ok: true; items: ReviewInfoQuery[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const itemsRaw = (raw as Record<string, unknown>).items
  if (!Array.isArray(itemsRaw)) {
    return { ok: false, error: 'Missing items array' }
  }
  if (itemsRaw.length > REVIEW_INFO_BATCH_MAX_ITEMS) {
    return { ok: false, error: `Too many items: max ${REVIEW_INFO_BATCH_MAX_ITEMS}` }
  }

  const items: ReviewInfoQuery[] = []
  const seen = new Set<string>()
  for (let i = 0; i < itemsRaw.length; i++) {
    const item = normalizeReviewInfoItem(itemsRaw[i])
    if (!item) {
      return { ok: false, error: `Invalid item at index ${i}: missing code` }
    }
    const key = `${item.code}|${item.teacherCode}|${item.teacherName}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return { ok: true, items }
}

// ---------- 评课统计聚合（自 routes/public.ts 迁入，SQL 保持一致） ----------
// 直接从 reviews 聚合，保证与评价列表页展示的 count/avg 完全一致
// （courses.review_count/review_avg 冗余列在维护时未过滤 is_icu，会不一致）。

export async function loadCourseReviewStats(
  db: D1Database,
  courseIds: number[],
  showIcu: boolean
): Promise<{ review_count: number; review_avg: number }> {
  const ids = Array.from(new Set(courseIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (ids.length === 0) return { review_count: 0, review_avg: 0 }

  const statsFilter = showIcu ? '' : ' AND is_icu = 0'
  let totalCount = 0
  let weightedRating = 0

  for (const part of chunkArray(ids, REVIEW_STATS_D1_SAFE_BATCH_SIZE)) {
    const placeholders = part.map(() => '?').join(',')
    const row = await db
      .prepare(
        `SELECT
           COUNT(*) AS total_count,
           COALESCE(AVG(CASE WHEN rating > 0 THEN rating END), 0) AS avg_rating
         FROM reviews
         WHERE course_id IN (${placeholders})
           AND is_hidden = 0${statsFilter}`
      )
      .bind(...part)
      .first<{ total_count: number; avg_rating: number }>()

    const chunkCount = Number(row?.total_count || 0)
    const chunkAvg = Number(row?.avg_rating || 0)
    totalCount += chunkCount
    weightedRating += chunkCount * chunkAvg
  }

  return {
    review_count: totalCount,
    review_avg: totalCount > 0 ? weightedRating / totalCount : 0
  }
}

// ---------- 课程解析（自 GET /course/by-code 迁入，SQL 保持一致） ----------

export type CourseReviewTarget = {
  courseId: number
  course: Record<string, unknown>
  idList: number[]
}

export async function resolveCourseReviewTargets(
  db: D1Database,
  query: ReviewInfoQuery,
  showIcu: boolean
): Promise<CourseReviewTarget | null> {
  const code = query.code
  const teacherName = query.teacherName
  const teacherCode = query.teacherCode
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

  const pkTeacherFilter = buildTeacherFilter('pt.teacherCode', 'pt.teacherName')
  const courseTeacherFilter = buildTeacherFilter('t.tid', 't.name')

  const pkNamedRow = hasTeacherFilter
    ? await db
        .prepare(
          `SELECT c.id as id
           FROM courses c
           WHERE (
             c.code = ?
             OR EXISTS (
               SELECT 1 FROM course_aliases a
               WHERE a.system = 'onesystem'
                 AND a.alias = ?
                 AND a.course_id = c.id
             )
           )
           AND EXISTS (
             SELECT 1
             FROM coursedetail cd
             LEFT JOIN teacher pt ON pt.teachingClassId = cd.id
             WHERE (cd.code = ? OR cd.courseCode = ? OR cd.newCourseCode = ? OR cd.newCode = ?)
             ${pkTeacherFilter.sql}
           )
           ORDER BY
             CASE WHEN c.code = ? THEN 0 ELSE 1 END,
             COALESCE(c.review_count, 0) DESC,
             c.id DESC
           LIMIT 1`
        )
        .bind(code, code, code, code, code, code, ...pkTeacherFilter.args, code)
        .first<{ id: number }>()
    : null

  const preferredRow = pkNamedRow?.id
    ? pkNamedRow
    : hasTeacherFilter
    ? await db
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

  const aliasRow = preferredRow?.id
    ? null
    : await db.prepare(`SELECT course_id as id FROM course_aliases WHERE system = 'onesystem' AND alias = ? LIMIT 1`).bind(code).first<{ id: number }>()

  const directRow =
    preferredRow?.id || aliasRow?.id
      ? null
      : await db.prepare('SELECT id FROM courses WHERE code = ? LIMIT 1').bind(code).first<{ id: number }>()

  const courseId = preferredRow?.id ?? aliasRow?.id ?? directRow?.id ?? null

  if (!courseId) return null

  const course = await db
    .prepare(
      `SELECT c.*, t.name as teacher_name FROM courses c
       LEFT JOIN teachers t ON c.teacher_id = t.id
       WHERE c.id = ?`
    )
    .bind(courseId)
    .first<Record<string, unknown>>()

  if (!course) return null

  if (!showIcu && course.is_icu === 1) return null

  const matchedIds = new Set<number>()

  if (!hasTeacherFilter) {
    matchedIds.add(Number(courseId))
    const sameCodeRows = await db.prepare('SELECT id FROM courses WHERE code = ?').bind((course as any).code).all<{ id: number }>()
    for (const r of sameCodeRows.results || []) matchedIds.add(Number((r as any).id))
  }

  if (hasTeacherFilter) {
    const sameNameTeacherRows = await db
      .prepare(
        `SELECT c.id as id
         FROM courses c
         LEFT JOIN teachers t ON c.teacher_id = t.id
         WHERE c.name = ?
           AND (
             ${courseTeacherFilter.sql ? courseTeacherFilter.sql.replace(/^ AND /, '') : '0'}
             OR EXISTS (
               SELECT 1
               FROM course_aliases a
               JOIN coursedetail cd ON (
                 a.alias = cd.courseCode OR a.alias = cd.code OR a.alias = cd.newCourseCode OR a.alias = cd.newCode
               )
               LEFT JOIN teacher pt ON pt.teachingClassId = cd.id
               WHERE a.system = 'onesystem'
                 AND a.course_id = c.id
                 ${pkTeacherFilter.sql}
             )
             OR EXISTS (
               SELECT 1
               FROM coursedetail cd
               LEFT JOIN teacher pt ON pt.teachingClassId = cd.id
               WHERE (cd.courseCode = c.code OR cd.code = c.code OR cd.newCourseCode = c.code OR cd.newCode = c.code)
                 ${pkTeacherFilter.sql}
             )
           )
         ORDER BY
           CASE WHEN c.id = ? THEN 0 ELSE 1 END,
           COALESCE(c.review_count, 0) DESC,
           c.id DESC
         LIMIT 100`
      )
      .bind((course as any).name, ...courseTeacherFilter.args, ...pkTeacherFilter.args, ...pkTeacherFilter.args, Number(courseId))
      .all<{ id: number }>()

    for (const r of sameNameTeacherRows.results || []) matchedIds.add(Number((r as any).id))

    if (matchedIds.size === 0) matchedIds.add(Number(courseId))
  } else if (course.teacher_id) {
    const sameNameTeacherRows = await db
      .prepare('SELECT id FROM courses WHERE name = ? AND teacher_id = ?')
      .bind((course as any).name, course.teacher_id)
      .all<{ id: number }>()
    for (const r of sameNameTeacherRows.results || []) matchedIds.add(Number((r as any).id))
  }

  const idList = Array.from(matchedIds).filter((n) => Number.isFinite(n))
  if (idList.length === 0) return null

  return { courseId: Number(courseId), course, idList }
}

// ---------- 短 TTL 模块内缓存 ----------
//
// 缓存按归一化查询（code/teacher/showIcu）为 key；评价写入/编辑/删除/隐藏都会走
// refreshCourseStats()，由它统一调用 invalidateCourseReviewInfoCache() 清空。
// 与 refreshCourseStats 更新冗余列之间存在短暂的竞态窗口，TTL（60s）限制了最大陈旧度。

const statsCache = new Map<string, { value: CourseReviewStats; expiresAt: number }>()

export function invalidateCourseReviewInfoCache() {
  if (statsCache.size > 0) statsCache.clear()
}

function statsCacheKey(query: ReviewInfoQuery, showIcu: boolean) {
  return `icu:${showIcu ? 1 : 0}:code:${query.code}:tc:${query.teacherCode}:tn:${query.teacherName}`
}

export async function getCourseReviewStatsCached(
  db: D1Database,
  query: ReviewInfoQuery,
  showIcu: boolean
): Promise<CourseReviewStats> {
  const key = statsCacheKey(query, showIcu)
  const now = Date.now()
  const hit = statsCache.get(key)
  if (hit) {
    if (hit.expiresAt > now) return hit.value
    statsCache.delete(key)
  }

  const target = await resolveCourseReviewTargets(db, query, showIcu)
  let value: CourseReviewStats
  if (!target) {
    value = { found: false, review_count: 0, review_avg: 0 }
  } else {
    const stats = await loadCourseReviewStats(db, target.idList, showIcu)
    value = { found: true, review_count: stats.review_count, review_avg: stats.review_avg }
  }

  if (statsCache.size >= REVIEW_INFO_CACHE_MAX_ENTRIES) {
    const oldest = statsCache.keys().next().value
    if (oldest !== undefined) statsCache.delete(oldest)
  }
  statsCache.set(key, { value, expiresAt: now + REVIEW_INFO_CACHE_TTL_MS })
  return value
}
