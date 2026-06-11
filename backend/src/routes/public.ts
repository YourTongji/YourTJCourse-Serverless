import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Bindings } from '../helpers/types'
import { encodeReviewId, decodeReviewId } from '../sqids'
import { refreshCourseStats } from '../courseStats'
import {
  ensureDbInitialized,
  getShowIcuSetting,
  COURSE_LIST_CACHE_SECONDS,
  COURSE_LIST_CACHE_SWR_SECONDS,
  D1_SAFE_BATCH_SIZE,
  chunkArray,
  escapeLikePattern,
  normalizeLooseSearchText,
  parseSemesterNames,
  buildCourseSearchMatchQuery,
  buildKeywordSearchVariants,
  buildLooseSqlExpr,
  combineSemesterNames,
  buildCourseAuxiliaryRecords,
  deleteAuxiliaryCourseData,
  upsertAuxiliaryCourseData,
  refreshAuxiliaryCourseData,
  rebuildAllAuxiliaryCourseData,
  isAuxiliaryCourseDataReady,
  getCourseSemesters,
  getMaintenanceModeSetting,
  getMaintenanceConfigSetting,
  parseSiteAnnouncements,
  postCreditJcourseEvent,
  ensureReviewsWalletColumn,
  ensureReviewLikesTable,
  ensureReviewReportsTable,
} from '../helpers/db'
import { verifyTurnstile, isAllowedTurnstileHostname } from '../helpers/turnstile'
import { verifyTongjiCaptcha } from '../helpers/captcha'
import { addSqidToReviews, getReviewLikeClientKey, normalizeReviewerAvatar, sha256Hex } from '../helpers/review'
import { notifyReportToFeishu, verifyActionToken } from '../helpers/feishu'
import { getMiniSearchCourseCandidates } from '../helpers/course-mini-search'
import {
  buildCacheControl,
  COURSE_DETAIL_CACHE_VERSION,
  buildCourseDetailCacheRequest,
  buildJsonResponse,
  purgeRelatedCourseDetailCache,
  setPublicCacheHeaders
} from '../helpers/cache'

const publicRoutes = new Hono<{ Bindings: Bindings }>()
type AppContext = Context<{ Bindings: Bindings }>

const REPORT_REASONS = new Set(['spam', 'harassment', 'misinformation', 'other'])

function containsLikePattern(value: string) {
  return `%${escapeLikePattern(value)}%`
}

function isLikelyChineseTeacherName(value: string) {
  return /^[\u4e00-\u9fa5]{2,3}$/.test(value)
}

function buildStructuredKeywordTerms(keyword: string) {
  const raw = String(keyword || '').trim()
  const normalized = raw
    .replace(/[+＋]/g, ' ')
    .replace(/\s*的\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return []
  const terms = Array.from(new Set(normalized.split(' ').map((item) => item.trim()).filter((item) => item.length >= 2)))
  if (terms.length < 2) return []
  const hasExplicitRelation = /[+＋的]/.test(raw)
  const hasLikelyChineseName = terms.some(isLikelyChineseTeacherName)
  return hasExplicitRelation || hasLikelyChineseName ? terms : []
}

async function loadReviewIdSetByClient(
  db: D1Database,
  reviewIds: number[],
  clientId: string
) {
  const result = new Set<number>()
  const ids = Array.from(new Set(reviewIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (!clientId || ids.length === 0) return result

  for (const part of chunkArray(ids, D1_SAFE_BATCH_SIZE)) {
    const placeholders = part.map(() => '?').join(',')
    const rows = await db
      .prepare(`SELECT review_id FROM review_likes WHERE client_id = ? AND review_id IN (${placeholders})`)
      .bind(clientId, ...part)
      .all<{ review_id: number }>()
    for (const row of rows.results || []) {
      result.add(Number((row as any).review_id))
    }
  }

  return result
}

function parseReviewEditProofs(raw: string) {
  const proofs = new Map<number, string>()
  for (const item of String(raw || '').split(',')) {
    const [idPart, tokenPart] = item.split(':')
    const id = Number(idPart)
    const token = String(tokenPart || '').trim()
    if (Number.isFinite(id) && id > 0 && /^[a-f0-9]{64}$/i.test(token)) {
      proofs.set(id, token)
    }
  }
  return proofs
}

async function loadEditableReviewIdSetByToken(
  db: D1Database,
  proofs: Map<number, string>
) {
  const result = new Set<number>()
  const entries = Array.from(proofs.entries()).filter(([id]) => Number.isFinite(id) && id > 0)
  if (entries.length === 0) return result

  for (const part of chunkArray(entries, D1_SAFE_BATCH_SIZE)) {
    const reviewIds = part.map(([id]) => id)
    const placeholders = reviewIds.map(() => '?').join(',')
    const rows = await db
      .prepare(`SELECT id, edit_token FROM reviews WHERE id IN (${placeholders})`)
      .bind(...reviewIds)
      .all<{ id: number; edit_token?: string | null }>()
    for (const row of rows.results || []) {
      const id = Number((row as any).id)
      const expected = String((row as any).edit_token || '').trim()
      if (!expected) continue
      const expectedProof = await sha256Hex(`yourtj:can-edit:${expected}`)
      if (proofs.get(id) === expectedProof) result.add(id)
    }
  }

  return result
}

function stripWalletUserHash<T extends Record<string, any>>(review: T) {
  const { wallet_user_hash: _walletUserHash, ...safeReview } = review
  return safeReview
}

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
    const canUseWorkerCache = !includeTotal

    if (canUseWorkerCache) {
      const cacheUrl = new URL(c.req.url)
      cacheUrl.searchParams.set('__showIcu', showIcu ? '1' : '0')
      cacheUrl.searchParams.set('__creditFallback', COURSE_DETAIL_CACHE_VERSION)
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
    let miniSearchCandidate:
      | Awaited<ReturnType<typeof getMiniSearchCourseCandidates>>
      | null = null

    if (!showIcu) {
      baseWhere += ' AND (c.is_icu = 0 OR c.is_icu IS NULL)'
    }

    baseWhere += " AND NOT (c.is_legacy = 1 AND c.code LIKE '%AUTO%')"

    if (keyword) {
      try {
        miniSearchCandidate = await getMiniSearchCourseCandidates(
          c.env.DB,
          showIcu,
          keyword,
          {
            departments,
            courseName,
            courseCode,
            teacherName,
            teacherCode,
            campus,
            faculty
          },
          c.env.COURSE_SEARCH_INDEX
        )
      } catch {
        miniSearchCandidate = null
      }

      const courseAuxReady = miniSearchCandidate ? false : await isAuxiliaryCourseDataReady(c.env.DB)
      const ftsQuery = courseAuxReady ? buildCourseSearchMatchQuery(keyword) : ''
      const rawVariants = buildKeywordSearchVariants(keyword)
      const looseVariants = Array.from(new Set(rawVariants.map((item) => normalizeLooseSearchText(item)).filter(Boolean)))
      const structuredKeywordTerms = buildStructuredKeywordTerms(keyword)
      const keywordClauses: string[] = []

      if (miniSearchCandidate) {
        if (miniSearchCandidate.courseIds.length > 0) {
          // #119: D1 has a 100-bind-variable limit; chunk courseIds into safe batches
          const MAX_SAFE_VARS = 80
          const chunks = chunkArray(miniSearchCandidate.courseIds, MAX_SAFE_VARS)
          const conditions = chunks.map((chunk) => {
            const phs = chunk.map(() => '?').join(',')
            return `c.id IN (${phs})`
          })
          baseWhere += ` AND (${conditions.join(' OR ')})`
          for (const chunk of chunks) baseParams.push(...chunk)
        } else {
          baseWhere += ' AND 0'
        }
      } else if (courseAuxReady && ftsQuery) {
        keywordClauses.push('c.id IN (SELECT course_id FROM course_search WHERE search_doc MATCH ?)')
        baseParams.push(ftsQuery)
      }

      if (!miniSearchCandidate && rawVariants.length > 0) {
        const perVariant =
          "(c.code LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR t.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM course_aliases a WHERE a.system = 'onesystem' AND a.course_id = c.id AND a.alias LIKE ? ESCAPE '\\'))"
        keywordClauses.push(rawVariants.map(() => perVariant).join(' OR '))
        for (const variant of rawVariants) {
          const likeKey = containsLikePattern(variant)
          baseParams.push(likeKey, likeKey, likeKey, likeKey)
        }
      }

      if (!miniSearchCandidate && looseVariants.length > 0) {
        const looseExprs = [
          buildLooseSqlExpr('c.code'),
          buildLooseSqlExpr('c.name'),
          buildLooseSqlExpr('t.name')
        ]
        const perVariant = `(${looseExprs.map((expr) => `${expr} LIKE ? ESCAPE '\\'`).join(' OR ')} OR EXISTS (SELECT 1 FROM course_aliases a WHERE a.system = 'onesystem' AND a.course_id = c.id AND ${buildLooseSqlExpr('a.alias')} LIKE ? ESCAPE '\\'))`
        keywordClauses.push(looseVariants.map(() => perVariant).join(' OR '))
        for (const variant of looseVariants) {
          const likeKey = containsLikePattern(variant)
          baseParams.push(likeKey, likeKey, likeKey, likeKey)
        }
      }

      if (structuredKeywordTerms.length >= 2) {
        const perTermSql =
          "(cd.courseName LIKE ? ESCAPE '\\' OR cd.name LIKE ? ESCAPE '\\' OR cd.courseCode LIKE ? ESCAPE '\\' OR cd.code LIKE ? ESCAPE '\\' OR cd.newCourseCode LIKE ? ESCAPE '\\' OR cd.newCode LIKE ? ESCAPE '\\' OR kt.teacherName LIKE ? ESCAPE '\\' OR kt.teacherCode LIKE ? ESCAPE '\\')"
        const structuredWhere = structuredKeywordTerms.map(() => perTermSql).join(' AND ')
        const structuredParams = structuredKeywordTerms.flatMap((term) => {
          const likeTerm = containsLikePattern(term)
          return [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm]
        })

        ctes.push(`
          pk_keyword_match AS (
            SELECT DISTINCT c2.id AS id, TRIM(kt.teacherName) AS matched_teacher_name
            FROM courses c2
            JOIN coursedetail cd ON (
              cd.courseCode = c2.code OR cd.code = c2.code OR cd.newCourseCode = c2.code OR cd.newCode = c2.code
            )
            JOIN teacher kt ON kt.teachingClassId = cd.id
            WHERE ${structuredWhere}
            UNION
            SELECT DISTINCT a.course_id AS id, TRIM(kt.teacherName) AS matched_teacher_name
            FROM course_aliases a
            JOIN coursedetail cd ON (
              a.alias = cd.courseCode OR a.alias = cd.code OR a.alias = cd.newCourseCode OR a.alias = cd.newCode
            )
            JOIN teacher kt ON kt.teachingClassId = cd.id
            WHERE a.system = 'onesystem' AND ${structuredWhere}
          )
        `)
        cteParams.push(...structuredParams, ...structuredParams)
        keywordClauses.push('c.id IN (SELECT id FROM pk_keyword_match)')
      }

      if (keywordClauses.length > 0) {
        baseWhere += ` AND (${keywordClauses.join(' OR ')})`
      }
    }

    if (courseCode) {
      baseWhere +=
        " AND (c.code LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM course_aliases a WHERE a.system = 'onesystem' AND a.course_id = c.id AND a.alias LIKE ? ESCAPE '\\'))"
      const likeCode = containsLikePattern(courseCode)
      baseParams.push(likeCode, likeCode)
    }

    // Teacher filters resolve precisely through the main `teachers` table. Each `courses`
    // row is a (course, teacher) section via teacher_id, so this matches exactly the sections
    // the teacher actually teaches — and the displayed teacher (t.name) then matches the course
    // detail page. The aggregated CTE already joins `teachers t ON c.teacher_id = t.id`, so we
    // filter that alias directly. The PK coursedetail/teacher tables can only be joined to main
    // courses by shared course code, which is NOT teacher-specific: short shared codes (e.g. the
    // 形势与政策 / 思修 family) link one teacher's section to many other teachers' sections, so a
    // PK-based teacher match returns the wrong teachers' courses (filtering 弓昭民 surfaced 陈双珠
    // etc. in issue #86). Teacher filters therefore must not go through the PK code join.
    if (teacherName) {
      baseWhere += " AND t.name LIKE ? ESCAPE '\\'"
      baseParams.push(containsLikePattern(teacherName))
    }
    if (teacherCode) {
      baseWhere += " AND t.tid LIKE ? ESCAPE '\\'"
      baseParams.push(containsLikePattern(teacherCode))
    }

    // courseName / campus / faculty live in the PK coursedetail table. campus & faculty are
    // PK-only; courseName also exists as courses.name in the main table, so it additionally
    // matches there (the search index draws course name from the main table). The main-table
    // branch only applies when no PK-only column is requested, since a main course without a
    // coursedetail section cannot satisfy campus/faculty. This code-level join is correct for
    // courseName/campus/faculty because those are properties of the course, not of a specific
    // teacher's section.
    const needPkFilter = Boolean(courseName || campus || faculty)
    if (needPkFilter) {
      const pkWhere: string[] = []
      const pkParams: any[] = []

      if (courseName) {
        pkWhere.push("cd.courseName LIKE ? ESCAPE '\\'")
        pkParams.push(containsLikePattern(courseName))
      }
      if (campus) {
        pkWhere.push('cd.campus = ?')
        pkParams.push(campus)
      }
      if (faculty) {
        pkWhere.push('cd.faculty = ?')
        pkParams.push(faculty)
      }

      const pkExtraWhere = ` AND ${pkWhere.join(' AND ')}`

      const mainCourseNameBranch = courseName && !campus && !faculty
        ? `
          UNION
          SELECT DISTINCT c2.id AS id
          FROM courses c2
          WHERE c2.name LIKE ? ESCAPE '\\'`
        : ''

      ctes.push(`
        pk_match AS (
          SELECT DISTINCT c2.id AS id
          FROM courses c2
          JOIN coursedetail cd ON (
            cd.courseCode = c2.code OR cd.code = c2.code OR cd.newCourseCode = c2.code OR cd.newCode = c2.code
          )
          WHERE 1=1${pkExtraWhere}
          UNION
          SELECT DISTINCT a.course_id AS id
          FROM course_aliases a
          JOIN coursedetail cd ON (
            a.alias = cd.courseCode OR a.alias = cd.code OR a.alias = cd.newCourseCode OR a.alias = cd.newCode
          )
          WHERE a.system = 'onesystem'${pkExtraWhere}${mainCourseNameBranch}
        )
      `)

      baseWhere += ` AND c.id IN (SELECT id FROM pk_match)`

      cteParams.push(...pkParams, ...pkParams, ...(mainCourseNameBranch ? [containsLikePattern(courseName)] : []))
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
    const matchedTeacherExprs: string[] = []
    if (keyword && buildStructuredKeywordTerms(keyword).length >= 2) {
      matchedTeacherExprs.push("(SELECT GROUP_CONCAT(DISTINCT matched_teacher_name) FROM pk_keyword_match pkm WHERE pkm.id = c.id AND TRIM(COALESCE(matched_teacher_name, '')) != '')")
    }
    const displayTeacherExpr = matchedTeacherExprs.length > 0
      ? `COALESCE(${matchedTeacherExprs.join(', ')}, t.name, '')`
      : "COALESCE(t.name, '')"
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
          ${displayTeacherExpr} AS teacher_name,
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
    if (miniSearchCandidate) {
      c.header('x-course-search-index-source', miniSearchCandidate.source)
      c.header('x-course-search-index-docs', String(miniSearchCandidate.docCount))
      c.header('x-course-search-index-ms', String(miniSearchCandidate.elapsedMs))
    }

    if (!canUseWorkerCache) {
      setPublicCacheHeaders(c, 15, 30)
      return c.json(payload)
    }

    const cacheUrl = new URL(c.req.url)
    cacheUrl.searchParams.set('__showIcu', showIcu ? '1' : '0')
    cacheUrl.searchParams.set('__creditFallback', COURSE_DETAIL_CACHE_VERSION)
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
    const editProofs = parseReviewEditProofs(c.req.query('editReviewProofs') || '')
    const bypassCourseDetailCache = Boolean((c.req.query('_') || c.req.query('reviewRefresh') || '').trim())
    const cacheKey = buildCourseDetailCacheRequest(id, showIcu)
    const cache = caches.default

    try {
      const cached = bypassCourseDetailCache ? null : await cache.match(cacheKey)
      if (cached) {
        const cachedPayload = (await cached.json()) as Record<string, any>
        const cachedReviews = Array.isArray((cachedPayload as any).reviews)
          ? (cachedPayload as any).reviews.map((r: any) => stripWalletUserHash(r))
          : []
        const basePayload = {
          ...cachedPayload,
          credit: effectiveCourse.credit,
          reviews: cachedReviews
        }

        if (!clientId && editProofs.size === 0) {
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

        const likedSet = await loadReviewIdSetByClient(c.env.DB, reviewIds, clientId)
        const editableSet = await loadEditableReviewIdSetByToken(c.env.DB, editProofs)

        const personalized = {
          ...(basePayload as any),
          reviews: ((basePayload as any).reviews || []).map((r: any) => ({
            ...r,
            liked: likedSet.has(Number(r?.id)),
            can_edit: editableSet.has(Number(r?.id))
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
                reviewer_name, reviewer_avatar, wallet_user_hash
         FROM reviews WHERE ${baseWhere} ORDER BY created_at DESC`
      )
      .bind(...idList)
      .all()

    const rawReviews = (reviews.results || []) as any[]
    const reviewsWithSqid = addSqidToReviews(rawReviews).map((r: any) => ({
      ...stripWalletUserHash(r),
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

    if (!clientId && editProofs.size === 0) return cacheRes

    const reviewIds = rawReviews.map((r) => Number(r?.id)).filter((n) => Number.isFinite(n))
    const likedSet = await loadReviewIdSetByClient(c.env.DB, reviewIds, clientId)
    const editableSet = await loadEditableReviewIdSetByToken(c.env.DB, editProofs)

    const personalized = {
      ...basePayload,
      reviews: (basePayload.reviews || []).map((r: any) => ({
        ...r,
        liked: likedSet.has(Number(r?.id)),
        can_edit: editableSet.has(Number(r?.id))
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
      likedSet = await loadReviewIdSetByClient(c.env.DB, ids, clientId)
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
      teacher_name: teacherName || (course as any).teacher_name,
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
  const safeAvatar = normalizeReviewerAvatar(reviewer_avatar)
  const safeSemester = String(semester || '').trim().slice(0, 20)

  await ensureReviewsWalletColumn(c.env.DB)

  const insert = await c.env.DB.prepare(
    `INSERT INTO reviews (course_id, rating, comment, semester, is_legacy, reviewer_name, reviewer_avatar, wallet_user_hash)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
  ).bind(courseId, safeRating, safeComment, safeSemester, safeName, safeAvatar, walletHash || null).run()

  const reviewId = Number((insert as any)?.meta?.last_row_id || 0)

  await refreshCourseStats(c.env.DB, courseId)
  await purgeRelatedCourseDetailCache(c.env.DB, courseId)

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
  const safeAvatar = normalizeReviewerAvatar(reviewer_avatar)

  await c.env.DB
    .prepare(
      `UPDATE reviews
       SET rating = ?, comment = ?, semester = ?, reviewer_name = ?, reviewer_avatar = ?
       WHERE id = ?`
    )
    .bind(safeRating, safeComment, safeSemester, safeName, safeAvatar, id)
    .run()

  await refreshCourseStats(c.env.DB, Number(existing.course_id))
  await purgeRelatedCourseDetailCache(c.env.DB, Number(existing.course_id))

  return c.json({ success: true })
})

publicRoutes.post('/review/:id/report', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'Invalid review id' }, 400)

  await ensureReviewReportsTable(c.env.DB)

  const body = await c.req.json().catch(() => ({} as any))
  const requestedClientId = String(body?.clientId || '').trim()
  const rawReason = String(body?.reason || '').trim()
  const reason = REPORT_REASONS.has(rawReason) ? rawReason : 'other'

  if (!requestedClientId) return c.json({ error: 'Missing clientId' }, 400)

  const clientId = await getReviewLikeClientKey(c)
  if (!clientId) return c.json({ error: 'Unable to identify client' }, 400)

  const reviewRow = await c.env.DB
    .prepare(
      `SELECT r.id, r.comment, r.rating, r.semester, r.course_id,
              c.name AS course_name
       FROM reviews r
       JOIN courses c ON c.id = r.course_id
       WHERE r.id = ? AND r.is_hidden = 0 LIMIT 1`
    )
    .bind(id)
    .first<{ id: number; comment?: string | null; rating: number; semester?: string | null; course_id: number; course_name: string }>()
  if (!reviewRow) return c.json({ error: 'Review not found' }, 404)

  const report = await c.env.DB
    .prepare(
      `INSERT INTO review_reports (review_id, client_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, 'open', strftime('%s', 'now'), strftime('%s', 'now'))
       ON CONFLICT(review_id, client_id)
       DO NOTHING
       RETURNING id`
    )
    .bind(id, clientId, reason)
    .first<{ id: number }>()

  const reportId = Number(report?.id || 0) || null
  const isNewReport = Boolean(reportId)
  let effectiveReportId = reportId
  let isReopenedReport = false
  if (!isNewReport) {
    const existing = await c.env.DB
      .prepare('SELECT id, status FROM review_reports WHERE review_id = ? AND client_id = ? LIMIT 1')
      .bind(id, clientId)
      .first<{ id: number; status: string }>()
    // Re-reporting a processed report reopens it; admins must hear about it too.
    isReopenedReport = Boolean(existing && existing.status !== 'open')
    await c.env.DB
      .prepare(
        `UPDATE review_reports
         SET reason = ?, status = 'open', updated_at = strftime('%s', 'now')
         WHERE review_id = ? AND client_id = ?`
      )
      .bind(reason, id, clientId)
      .run()
    effectiveReportId = Number(existing?.id || 0) || null
  }

  let feishuResult: any = undefined
  if ((isNewReport || isReopenedReport) && effectiveReportId) {
    // Fire-and-forget Feishu notification (don't block response)
    const origin = new URL(c.req.url).origin
    // Restrict debug mode to non-production environments (avoid DoS / info leak)
    const isDevOrTest = String(c.env.APP_ENV || '').trim() !== 'production'
    const debugFeishu = isDevOrTest && String(c.req.header('x-debug-feishu') || '') === '1'
    const feishuPromise = notifyReportToFeishu(
      {
        reportId: effectiveReportId,
        reviewId: id,
        reviewSqid: encodeReviewId(id),
        courseName: String(reviewRow.course_name || ''),
        courseId: Number(reviewRow.course_id),
        reason,
        reporterClientId: clientId,
        reviewSnippet: String(reviewRow.comment || '').trim(),
        rating: Number(reviewRow.rating || 0),
        semester: String(reviewRow.semester || ''),
        reopened: isReopenedReport,
      },
      c.env,
      origin,
    ).catch((e): any => ({ enabled: true, ok: false, error: e instanceof Error ? e.message : String(e) }))

    if (debugFeishu) {
      // Sanitize debug output: only expose coarse-grained status, not raw response/full error
      const raw = await feishuPromise
      feishuResult = { enabled: raw.enabled, ok: raw.ok, status: raw.status }
    } else {
      c.executionCtx.waitUntil(feishuPromise)
    }
  }

  return c.json({ success: true, reportId: effectiveReportId, ...(feishuResult ? { debug: { feishu: feishuResult } } : {}) })
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

function buildReportActionHtml(options: {
  title: string
  message: string
  statusCode?: number
  action?: string
  actionLabel?: string
  reportId?: number
  deadline?: string
  sig?: string
  color?: string
}) {
  const statusCode = options.statusCode || 200
  const color = options.color || '#111827'
  const form = options.action && options.reportId && options.deadline && options.sig
    ? `<form method="post" action="/api/admin/report/${options.reportId}/resolve" style="margin-top:24px">
        <input type="hidden" name="action" value="${options.action}" />
        <input type="hidden" name="deadline" value="${options.deadline}" />
        <input type="hidden" name="sig" value="${options.sig}" />
        <button type="submit" style="appearance:none;border:0;border-radius:10px;background:${color};color:white;padding:12px 18px;font-size:16px;cursor:pointer">${options.actionLabel}</button>
      </form>`
    : ''

  return {
    statusCode,
    html: `<html><body style="font-family:system-ui;padding:40px;text-align:center">
      <h1 style="color:${color}">${options.title}</h1>
      <p>${options.message}</p>
      ${form}
      <p style="color:#6b7280;font-size:14px;margin-top:24px">您可以关闭此页面。</p>
    </body></html>`
  }
}

function reportActionResponse(page: ReturnType<typeof buildReportActionHtml>) {
  return new Response(page.html, {
    status: page.statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}

async function renderReportActionConfirm(c: AppContext) {
  const reportId = Number(c.req.param('reportId'))
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return c.json({ error: 'Invalid report id' }, 400)
  }

  const action = String(c.req.query('action') || '').trim()
  const deadline = String(c.req.query('deadline') || '').trim()
  const sig = String(c.req.query('sig') || '').trim()

  if (!['resolved', 'rejected'].includes(action)) {
    return c.json({ error: 'Invalid action' }, 400)
  }
  if (!deadline || !sig) {
    return c.json({ error: 'Missing signature params' }, 400)
  }

  const valid = await verifyActionToken(reportId, action, deadline, sig, c.env.ADMIN_SECRET)
  if (!valid) {
    const page = buildReportActionHtml({
      title: '链接无效或已过期',
      message: '该操作链接已失效，请从飞书卡片重新操作。',
      statusCode: 403,
      color: '#dc2626'
    })
    return reportActionResponse(page)
  }

  await ensureReviewReportsTable(c.env.DB)

  const report = await c.env.DB
    .prepare('SELECT id, status FROM review_reports WHERE id = ? LIMIT 1')
    .bind(reportId)
    .first<{ id: number; status: string }>()

  if (!report) {
    const page = buildReportActionHtml({
      title: '举报不存在',
      message: '该举报记录已被删除。',
      statusCode: 404,
      color: '#dc2626'
    })
    return reportActionResponse(page)
  }

  if (report.status !== 'open') {
    const label = report.status === 'resolved' ? '已处理（通过）' : '已处理（驳回）'
    const page = buildReportActionHtml({
      title: '举报已处理',
      message: `该举报已被标记为：${label}`,
      color: '#ca8a04'
    })
    return reportActionResponse(page)
  }

  const isResolve = action === 'resolved'
  const page = buildReportActionHtml({
    title: isResolve ? '确认通过举报？' : '确认驳回举报？',
    message: isResolve
      ? `举报 #${reportId} 将被标记为通过，被举报的评价将被隐藏。`
      : `举报 #${reportId} 将被驳回，评价保留显示。`,
    action,
    actionLabel: isResolve ? '确认通过' : '确认驳回',
    reportId,
    deadline,
    sig,
    color: isResolve ? '#16a34a' : '#dc2626'
  })
  return reportActionResponse(page)
}

// Feishu card action confirmation page. Old card links also land here and must
// be explicitly submitted before mutating report state.
publicRoutes.get('/admin/report/:reportId/confirm', renderReportActionConfirm)
publicRoutes.get('/admin/report/:reportId/resolve', renderReportActionConfirm)

publicRoutes.post('/admin/report/:reportId/resolve', async (c) => {
  const reportId = Number(c.req.param('reportId'))
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return c.json({ error: 'Invalid report id' }, 400)
  }

  const form = await c.req.formData().catch(() => null)
  const action = String(form?.get('action') || '').trim()
  const deadline = String(form?.get('deadline') || '').trim()
  const sig = String(form?.get('sig') || '').trim()

  if (!['resolved', 'rejected'].includes(action)) {
    return c.json({ error: 'Invalid action' }, 400)
  }
  if (!deadline || !sig) {
    return c.json({ error: 'Missing signature params' }, 400)
  }

  const valid = await verifyActionToken(reportId, action, deadline, sig, c.env.ADMIN_SECRET)
  if (!valid) {
    const page = buildReportActionHtml({
      title: '链接无效或已过期',
      message: '该操作链接已失效，请从飞书卡片重新操作。',
      statusCode: 403,
      color: '#dc2626'
    })
    return reportActionResponse(page)
  }

  await ensureReviewReportsTable(c.env.DB)

  const report = await c.env.DB
    .prepare('SELECT id, review_id, status FROM review_reports WHERE id = ? LIMIT 1')
    .bind(reportId)
    .first<{ id: number; review_id: number; status: string }>()

  if (!report) {
    const page = buildReportActionHtml({
      title: '举报不存在',
      message: '该举报记录已被删除。',
      statusCode: 404,
      color: '#dc2626'
    })
    return reportActionResponse(page)
  }

  if (report.status !== 'open') {
    const label = report.status === 'resolved' ? '已处理（通过）' : '已处理（驳回）'
    const page = buildReportActionHtml({
      title: '举报已处理',
      message: `该举报已被标记为：${label}`,
      color: '#ca8a04'
    })
    return reportActionResponse(page)
  }

  const now = Math.floor(Date.now() / 1000)
  const updateResult = await c.env.DB
    .prepare(
      `UPDATE review_reports
       SET status = ?, resolved_at = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`
    )
    .bind(action, now, now, reportId)
    .run()

  if (Number(updateResult.meta?.changes || 0) === 0) {
    const latest = await c.env.DB
      .prepare('SELECT status FROM review_reports WHERE id = ? LIMIT 1')
      .bind(reportId)
      .first<{ status: string }>()
    const latestLabel = latest?.status === 'resolved'
      ? '已处理（通过）'
      : latest?.status === 'rejected'
        ? '已处理（驳回）'
        : '状态未变更'
    const page = buildReportActionHtml({
      title: '举报已处理',
      message: `该举报当前状态为：${latestLabel}`,
      color: '#ca8a04'
    })
    return reportActionResponse(page)
  }

  if (action === 'resolved') {
    // UGC compliance: approving a report removes the offending review from public view.
    const review = await c.env.DB
      .prepare('SELECT course_id FROM reviews WHERE id = ? LIMIT 1')
      .bind(report.review_id)
      .first<{ course_id: number }>()
    await c.env.DB.prepare('UPDATE reviews SET is_hidden = 1 WHERE id = ?').bind(report.review_id).run()
    if (review) {
      await refreshCourseStats(c.env.DB, Number(review.course_id))
      await purgeRelatedCourseDetailCache(c.env.DB, Number(review.course_id))
    }
  }

  const label = action === 'resolved' ? '已通过（评价已隐藏）' : '已驳回（评价保留）'
  const color = action === 'resolved' ? '#16a34a' : '#dc2626'
  const page = buildReportActionHtml({
    title: '操作完成',
    message: `举报 #${reportId} 已标记为：${label}`,
    color
  })
  return reportActionResponse(page)
})

export default publicRoutes
