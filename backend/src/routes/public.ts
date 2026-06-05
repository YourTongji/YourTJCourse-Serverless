import { Hono } from 'hono'
import type { Bindings } from '../helpers/types'
import { encodeReviewId, decodeReviewId } from '../sqids'
import { refreshCourseStats } from '../courseStats'
import {
  ensureDbInitialized,
  getShowIcuSetting,
  COURSE_LIST_CACHE_SECONDS,
  COURSE_LIST_CACHE_SWR_SECONDS,
  SEARCH_ALIAS_MAP,
  D1_SAFE_BATCH_SIZE,
  chunkArray,
  uniqueText,
  normalizeSearchText,
  normalizeLooseSearchText,
  parseSemesterNames,
  buildCourseSearchMatchQuery,
  buildKeywordSearchVariants,
  buildLooseSqlExpr,
  buildCourseSearchDocument,
  combineSemesterNames,
  buildCourseAuxiliaryRecords,
  deleteAuxiliaryCourseData,
  upsertAuxiliaryCourseData,
  refreshAuxiliaryCourseData,
  rebuildAllAuxiliaryCourseData,
  isAuxiliaryCourseDataReady,
  triggerAuxiliaryCourseDataBuild,
  getCourseSemesters,
  getMaintenanceModeSetting,
  getMaintenanceConfigSetting,
  parseSiteAnnouncements,
  postCreditJcourseEvent,
  ensureReviewsWalletColumn,
  ensureReviewLikesTable,
} from '../helpers/db'
import { verifyTurnstile, isAllowedTurnstileHostname } from '../helpers/turnstile'
import { verifyTongjiCaptcha } from '../helpers/captcha'
import { addSqidToReviews, getReviewLikeClientKey } from '../helpers/review'
import { buildCacheControl, buildJsonResponse, setPublicCacheHeaders } from '../helpers/cache'

const publicRoutes = new Hono<{ Bindings: Bindings }>()
const CREDIT_FALLBACK_CACHE_VERSION = 'credit-fallback-v1'

async function loadPkCreditFallbacks(db: D1Database, courseIds: number[]) {
  const ids = Array.from(new Set(courseIds.filter((id) => Number.isFinite(id) && id > 0)))
  const creditById = new Map<number, number>()
  if (ids.length === 0) return creditById

  for (const part of chunkArray(ids, D1_SAFE_BATCH_SIZE)) {
    const placeholders = part.map(() => '?').join(',')
    const rows = await db
      .prepare(
        `SELECT c.id AS id, MAX(CAST(cd.credit AS REAL)) AS credit
         FROM courses c
         JOIN coursedetail cd
           ON cd.courseName = c.name
          AND CAST(COALESCE(cd.credit, 0) AS REAL) > 0
          AND TRIM(COALESCE(cd.courseCode, '')) != ''
          AND (
            cd.courseCode = c.code
            OR cd.newCourseCode = c.code
            OR (
              LENGTH(c.code) > LENGTH(cd.courseCode)
              AND SUBSTR(c.code, 1, LENGTH(cd.courseCode)) = cd.courseCode
            )
          )
         WHERE c.id IN (${placeholders})
         GROUP BY c.id`
      )
      .bind(...part)
      .all<{ id: number; credit: number }>()

    for (const row of rows.results || []) {
      const id = Number((row as any).id)
      const credit = Number((row as any).credit)
      if (Number.isFinite(id) && Number.isFinite(credit) && credit > 0) {
        creditById.set(id, credit)
      }
    }
  }

  return creditById
}

// 启动前检查：服务端验证 Turnstile token（避免纯前端放行被自动化绕过）
publicRoutes.post('/startup/verify', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const maintenanceMode = await getMaintenanceModeSetting(c.env.DB, c.env)
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

// 获取开课单位列表
publicRoutes.get('/departments', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)

    const showIcu = await getShowIcuSetting(c.env.DB)

    let whereClause = ' WHERE department IS NOT NULL AND department != ""'

    if (!showIcu) {
      whereClause += ' AND (is_icu = 0 OR is_icu IS NULL)'
    }

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

publicRoutes.get('/courses', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const keyword = (c.req.query('q') || '').trim()
    const departments = c.req.query('departments')
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

    const showIcu = await getShowIcuSetting(c.env.DB)
    const courseAuxReady = await isAuxiliaryCourseDataReady(c.env.DB)
    if (!courseAuxReady) {
      c.executionCtx.waitUntil(triggerAuxiliaryCourseDataBuild(c.env.DB))
    }
    const canUseWorkerCache = !includeTotal

    if (canUseWorkerCache) {
      const cacheUrl = new URL(c.req.url)
      cacheUrl.searchParams.set('__showIcu', showIcu ? '1' : '0')
      cacheUrl.searchParams.set('__creditFallback', CREDIT_FALLBACK_CACHE_VERSION)
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

    if (!showIcu) {
      baseWhere += ' AND (c.is_icu = 0 OR c.is_icu IS NULL)'
    }

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

    if (courseCode) {
      baseWhere +=
        " AND (c.code LIKE ? OR EXISTS (SELECT 1 FROM course_aliases a WHERE a.system = 'onesystem' AND a.course_id = c.id AND a.alias LIKE ?))"
      const likeCode = `%${courseCode}%`
      baseParams.push(likeCode, likeCode)
    }

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

    const fallbackCredits = await loadPkCreditFallbacks(
      c.env.DB,
      visibleRows
        .filter((r: any) => Number(r?.credit || 0) <= 0)
        .map((r: any) => Number(r?.id))
    )
    const normalized = visibleRows.map((r: any) => ({
      ...r,
      credit: Number(r?.credit || 0) > 0 ? r.credit : fallbackCredits.get(Number(r?.id)) ?? r.credit,
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
    cacheUrl.searchParams.set('__creditFallback', CREDIT_FALLBACK_CACHE_VERSION)
    const response = buildJsonResponse(payload, buildCacheControl(COURSE_LIST_CACHE_SECONDS, COURSE_LIST_CACHE_SWR_SECONDS))
    c.executionCtx.waitUntil(caches.default.put(new Request(cacheUrl.toString(), { method: 'GET' }), response.clone()))
    return response
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

publicRoutes.get('/course/:id', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const id = c.req.param('id')

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

    if (!showIcu && (course as any).is_icu === 1) {
      return c.json({ error: 'Course not found' }, 404)
    }

    const fallbackCredits = await loadPkCreditFallbacks(c.env.DB, [Number((course as any).id)])
    const effectiveCourse = {
      ...(course as any),
      credit: Number((course as any).credit || 0) > 0
        ? (course as any).credit
        : fallbackCredits.get(Number((course as any).id)) ?? (course as any).credit
    }

    const hasClientId = Boolean((c.req.query('clientId') || '').trim())
    const clientId = hasClientId ? await getReviewLikeClientKey(c) : ''
    const cacheKey = new Request(
      `https://cache.yourtj.de/api/course-base/${encodeURIComponent(String(id))}?showIcu=${showIcu ? '1' : '0'}&creditFallback=${CREDIT_FALLBACK_CACHE_VERSION}`,
      { method: 'GET' }
    )
    const cache = caches.default

    try {
      const cached = await cache.match(cacheKey)
      if (cached) {
        const cachedPayload = (await cached.json()) as Record<string, any>
        const basePayload = {
          ...cachedPayload,
          credit: effectiveCourse.credit
        }

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

    const matchedIds = new Set<number>([Number((course as any).id)])
    const teacherName = String((course as any).teacher_name || '').trim()

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
      .prepare(
        `SELECT id, course_id, semester, rating, comment, score, created_at,
                approve_count, disapprove_count, is_hidden, is_legacy, is_icu,
                reviewer_name, reviewer_avatar
         FROM reviews WHERE ${baseWhere} ORDER BY created_at DESC`
      )
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

publicRoutes.get('/course/:id/related', async (c) => {
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
publicRoutes.get('/course/by-code/:code', async (c) => {
  try {
    await ensureDbInitialized(c.env.DB)
    const code = (c.req.param('code') || '').trim()
    if (!code) return c.json({ error: 'Missing code' }, 400)
    const teacherName = (c.req.query('teacherName') || '').trim()
    const teacherCode = (c.req.query('teacherCode') || '').trim()
    const hasClientId = Boolean((c.req.query('clientId') || '').trim())
    const clientId = hasClientId ? await getReviewLikeClientKey(c) : ''
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

    const showIcu = await getShowIcuSetting(c.env.DB)

    const pkTeacherFilter = buildTeacherFilter('pt.teacherCode', 'pt.teacherName')
    const courseTeacherFilter = buildTeacherFilter('t.tid', 't.name')

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

    const aliasRow = preferredRow?.id
      ? null
      : await c.env.DB.prepare(`SELECT course_id as id FROM course_aliases WHERE system = 'onesystem' AND alias = ? LIMIT 1`).bind(code).first<{ id: number }>()

    const directRow =
      preferredRow?.id || aliasRow?.id
        ? null
        : await c.env.DB.prepare('SELECT id FROM courses WHERE code = ? LIMIT 1').bind(code).first<{ id: number }>()

    let courseId = preferredRow?.id ?? aliasRow?.id ?? directRow?.id ?? null

    if (!courseId) return c.json({ error: 'Course not found' }, 404)

    if (!aliasRow?.id && directRow?.id) {
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
      .prepare(
        `SELECT id, course_id, semester, rating, comment, score, created_at,
                approve_count, disapprove_count, is_hidden, is_legacy, is_icu,
                reviewer_name, reviewer_avatar
         FROM reviews WHERE ${baseWhere} ORDER BY created_at DESC LIMIT 30`
      )
      .bind(...idList)
      .all()
    const reviewsWithSqid = addSqidToReviews(reviews.results || [])

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
    const fallbackCredits = await loadPkCreditFallbacks(c.env.DB, [Number((course as any).id)])
    const effectiveCourse = {
      ...(course as any),
      credit: Number((course as any).credit || 0) > 0
        ? (course as any).credit
        : fallbackCredits.get(Number((course as any).id)) ?? (course as any).credit
    }

    return c.json({
      ...effectiveCourse,
      review_count: reviewCount,
      review_avg: reviewAvg,
      semesters,
      reviews: mappedReviews
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Simple in-memory rate limiter for public write endpoints
const reviewRateLimit = new Map<string, { count: number; windowStart: number }>()
const REVIEW_RATE_LIMIT_WINDOW_MS = 60_000
const REVIEW_RATE_LIMIT_MAX = 5

function checkReviewRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = reviewRateLimit.get(ip)
  if (!entry || now - entry.windowStart > REVIEW_RATE_LIMIT_WINDOW_MS) {
    reviewRateLimit.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= REVIEW_RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

publicRoutes.post('/review', async (c) => {
  // Rate limit: 5 reviews per minute per IP
  const ip = String(c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown').trim()
  if (!checkReviewRateLimit(ip)) {
    return c.json({ error: '提交过于频繁，请稍后再试' }, 429)
  }

  const body = await c.req.json()
  const { turnstile_token, semester, reviewer_name, reviewer_avatar, walletUserHash, wallet_user_hash } = body
  const walletHash = String(walletUserHash || wallet_user_hash || '').trim()

  if (!(await verifyTongjiCaptcha(turnstile_token, c.env.CAPTCHA_SITEVERIFY_URL))) {
    return c.json({ error: '人机验证无效或已过期' }, 403)
  }

  // Server-side input validation (#41)
  const courseId = Number(body.course_id || 0)
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return c.json({ error: '课程 ID 无效' }, 400)
  }
  const exists = await c.env.DB.prepare('SELECT 1 FROM courses WHERE id = ? LIMIT 1').bind(courseId).first<{ 1: number }>()
  if (!exists) return c.json({ error: '课程不存在' }, 404)

  const safeRating = Math.max(0, Math.min(5, Number(body.rating || 0)))
  const safeComment = String(body.comment || '').trim().slice(0, 10000)
  if (!safeComment) return c.json({ error: '点评内容不能为空' }, 400)
  const safeName = String(reviewer_name || '').trim().slice(0, 100)
  const safeAvatar = String(reviewer_avatar || '').trim().slice(0, 500)
  const safeSemester = String(semester || '').trim().slice(0, 20)

  await ensureReviewsWalletColumn(c.env.DB)

  const insert = await c.env.DB.prepare(
    `INSERT INTO reviews (course_id, rating, comment, semester, is_legacy, reviewer_name, reviewer_avatar, wallet_user_hash)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(courseId, safeRating, safeComment, safeSemester, safeName, safeAvatar, walletHash || null).run()

  const reviewId = Number((insert as any)?.meta?.last_row_id || 0)

  await refreshCourseStats(c.env.DB, courseId)

  // Credit reward moved to PATCH /review/:id/edit-token after HMAC ownership proof
  return c.json({ success: true, reviewId })
})

// 设置编辑令牌：POST 创建 review 后，客户端调用此接口提交 edit_token
// edit_token = HMAC-SHA256(userSecret, 'jcourse:edit-review:' + reviewId)
// 换设备后钱包恢复可重新计算同一 token，无需服务器存储秘密
publicRoutes.patch('/review/:id/edit-token', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid review id' }, 400)

  const body = await c.req.json().catch(() => ({} as any))
  const editToken = String(body?.edit_token || '').trim()
  const walletHash = String(body?.walletUserHash || body?.wallet_user_hash || '').trim()
  if (!editToken) return c.json({ error: 'Missing edit_token' }, 400)
  if (!/^[a-f0-9]{64}$/i.test(editToken)) return c.json({ error: 'Invalid edit_token' }, 400)
  if (!/^[a-f0-9]{64}$/i.test(walletHash)) return c.json({ error: 'Missing wallet binding' }, 400)

  await ensureReviewsWalletColumn(c.env.DB)

  const existing = await c.env.DB
    .prepare('SELECT id, edit_token, wallet_user_hash FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ id: number; edit_token?: string | null; wallet_user_hash?: string | null }>()
  if (!existing) return c.json({ error: 'Review not found' }, 404)

  if (String(existing.wallet_user_hash || '').trim() !== walletHash) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const existingToken = String(existing.edit_token || '').trim()
  if (existingToken) {
    if (existingToken === editToken) return c.json({ success: true })
    return c.json({ error: 'edit_token already set' }, 409)
  }

  await c.env.DB
    .prepare("UPDATE reviews SET edit_token = ? WHERE id = ? AND wallet_user_hash = ? AND (edit_token IS NULL OR edit_token = '')")
    .bind(editToken, id, walletHash)
    .run()

  // Now that ownership is proven via HMAC, issue credit reward
  // Read wallet_user_hash and comment from DB (not request body) to prevent tampering
  const review = await c.env.DB
    .prepare('SELECT wallet_user_hash, comment FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ wallet_user_hash?: string | null; comment?: string | null }>()

  let creditReward: any = { ok: false, skipped: true }
  if (review) {
    const storedHash = String(review.wallet_user_hash || '').trim()
    const storedComment = String(review.comment || '').trim()
    if (/^[a-f0-9]{64}$/i.test(storedHash) && storedComment.length >= 50) {
      creditReward = await postCreditJcourseEvent(c.env, {
        kind: 'review_reward',
        eventId: `review:${id}`,
        userHash: storedHash,
        amount: 10,
        metadata: { reviewId: id }
      })
    }
  }

  return c.json({ success: true, creditReward })
})

// 编辑评价（需要 edit_token 鉴权，替代旧版 wallet_user_hash 比对）
// 向后兼容：旧 review 没有 edit_token 时仍使用 wallet_user_hash 比对
publicRoutes.put('/review/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid review id' }, 400)

  const body = await c.req.json().catch(() => ({} as any))
  const { turnstile_token, reviewer_name, reviewer_avatar, edit_token, walletUserHash, wallet_user_hash } = body

  if (!(await verifyTongjiCaptcha(turnstile_token, c.env.CAPTCHA_SITEVERIFY_URL))) {
    return c.json({ error: '人机验证无效或已过期' }, 403)
  }

  await ensureReviewsWalletColumn(c.env.DB)

  const existing = await c.env.DB
    .prepare('SELECT id, course_id, edit_token, wallet_user_hash FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ id: number; course_id: number; edit_token?: string | null; wallet_user_hash?: string | null }>()
  if (!existing) return c.json({ error: 'Review not found' }, 404)

  // Authorize via edit_token (HMAC-based), fall back to wallet_user_hash for legacy reviews
  const inputEditToken = String(edit_token || '').trim()
  const hasEditToken = !!(existing.edit_token || '').trim()
  const tokenMatch = hasEditToken && existing.edit_token === inputEditToken
  const legacyMatch = !hasEditToken &&
    String(existing.wallet_user_hash || '').trim() !== '' &&
    String(existing.wallet_user_hash || '').trim() === String(walletUserHash || wallet_user_hash || '').trim()

  if (!tokenMatch && !legacyMatch) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const safeRating = Math.max(0, Math.min(5, Number(body.rating || 0)))
  const safeComment = String(body.comment || '').trim().slice(0, 10000)
  const safeSemester = String(body.semester || '').trim().slice(0, 20)
  const safeName = String(reviewer_name || '').trim().slice(0, 100)
  const safeAvatar = String(reviewer_avatar || '').trim().slice(0, 500)

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

publicRoutes.post('/review/:id/like', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid review id' }, 400)

  await ensureReviewLikesTable(c.env.DB)
  await ensureReviewsWalletColumn(c.env.DB)

  const body = await c.req.json().catch(() => ({} as any))
  const requestedClientId = String(body?.clientId || '').trim()
  if (!requestedClientId) return c.json({ error: 'Missing clientId' }, 400)

  const clientId = await getReviewLikeClientKey(c)
  if (!clientId) return c.json({ error: 'Unable to identify client' }, 400)

  const existing = await c.env.DB
    .prepare('SELECT 1 as x FROM review_likes WHERE review_id = ? AND client_id = ? LIMIT 1')
    .bind(id, clientId)
    .first<{ x: number }>()

  let changed = false
  if (!existing) {
    await c.env.DB.prepare('INSERT INTO review_likes (review_id, client_id) VALUES (?, ?)').bind(id, clientId).run()
    await c.env.DB.prepare('UPDATE reviews SET approve_count = approve_count + 1 WHERE id = ?').bind(id).run()
    changed = true
  }

  const review = await c.env.DB
    .prepare('SELECT approve_count, wallet_user_hash FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ approve_count: number; wallet_user_hash?: string | null }>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  const walletHash = String(review.wallet_user_hash || '').trim()
  if (changed && walletHash && /^[a-f0-9]{64}$/i.test(walletHash)) {
    await postCreditJcourseEvent(c.env, {
      kind: 'like',
      reviewId: String(id),
      actorId: clientId,
      targetUserHash: walletHash,
      metadata: { reviewId: id }
    })
  }

  return c.json({ success: true, liked: true, like_count: Number(review.approve_count || 0) })
})

publicRoutes.delete('/review/:id/like', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid review id' }, 400)

  await ensureReviewLikesTable(c.env.DB)
  await ensureReviewsWalletColumn(c.env.DB)

  const body = await c.req.json().catch(() => ({} as any))
  const requestedClientId = String(body?.clientId || '').trim()
  if (!requestedClientId) return c.json({ error: 'Missing clientId' }, 400)

  const clientId = await getReviewLikeClientKey(c)
  if (!clientId) return c.json({ error: 'Unable to identify client' }, 400)

  const existing = await c.env.DB
    .prepare('SELECT 1 as x FROM review_likes WHERE review_id = ? AND client_id = ? LIMIT 1')
    .bind(id, clientId)
    .first<{ x: number }>()

  let changed = false
  if (existing) {
    await c.env.DB.prepare('DELETE FROM review_likes WHERE review_id = ? AND client_id = ?').bind(id, clientId).run()
    await c.env.DB
      .prepare('UPDATE reviews SET approve_count = CASE WHEN approve_count > 0 THEN approve_count - 1 ELSE 0 END WHERE id = ?')
      .bind(id)
      .run()
    changed = true
  }

  const review = await c.env.DB
    .prepare('SELECT approve_count, wallet_user_hash FROM reviews WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ approve_count: number; wallet_user_hash?: string | null }>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  const walletHash = String(review.wallet_user_hash || '').trim()
  if (changed && walletHash && /^[a-f0-9]{64}$/i.test(walletHash)) {
    await postCreditJcourseEvent(c.env, {
      kind: 'unlike',
      reviewId: String(id),
      actorId: clientId,
      targetUserHash: walletHash,
      metadata: { reviewId: id }
    })
  }

  return c.json({ success: true, liked: false, like_count: Number(review.approve_count || 0) })
})

export default publicRoutes
