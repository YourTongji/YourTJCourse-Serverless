export function buildCacheControl(maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
  return staleWhileRevalidateSeconds > 0
    ? `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
    : `public, max-age=${maxAgeSeconds}`
}

export function buildJsonResponse(payload: unknown, cacheControl: string) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    }
  })
}

export function setPublicCacheHeaders(c: any, maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
  c.header('Cache-Control', buildCacheControl(maxAgeSeconds, staleWhileRevalidateSeconds))
}

export const COURSE_DETAIL_CACHE_VERSION = 'credit-fallback-v1'

export function buildCourseDetailCacheRequest(courseId: string | number, showIcu: boolean) {
  const url = `https://cache.yourtj.de/api/course-base/${encodeURIComponent(String(courseId))}?showIcu=${showIcu ? '1' : '0'}&creditFallback=${COURSE_DETAIL_CACHE_VERSION}`
  return new Request(url, { method: 'GET' })
}

export async function purgeCourseDetailCache(courseIds: Array<string | number>) {
  const ids = Array.from(new Set(courseIds.map((id) => String(id || '').trim()).filter(Boolean)))
  if (ids.length === 0) return

  const cache = caches.default
  await Promise.all(ids.flatMap((id) => [
    cache.delete(buildCourseDetailCacheRequest(id, false)),
    cache.delete(buildCourseDetailCacheRequest(id, true))
  ]))
}

export async function collectRelatedCourseDetailCacheIds(db: D1Database, courseId: number) {
  if (!Number.isFinite(courseId) || courseId <= 0) return []

  const course = await db
    .prepare('SELECT id, code, name, teacher_id FROM courses WHERE id = ? LIMIT 1')
    .bind(courseId)
    .first<{ id: number; code?: string | null; name?: string | null; teacher_id?: number | null }>()
  if (!course) return [courseId]

  const ids = new Set<number>([courseId])
  const teacherId = Number((course as any).teacher_id || 0)
  if (teacherId > 0) {
    const rows = await db
      .prepare(`SELECT id FROM courses WHERE name = ? AND teacher_id = ? AND NOT (is_legacy = 1 AND code LIKE '%AUTO%')`)
      .bind(String((course as any).name || ''), teacherId)
      .all<{ id: number }>()
    for (const row of rows.results || []) {
      const id = Number((row as any).id)
      if (Number.isFinite(id) && id > 0) ids.add(id)
    }
  } else {
    const rows = await db
      .prepare(`SELECT id FROM courses WHERE code = ? AND NOT (is_legacy = 1 AND code LIKE '%AUTO%')`)
      .bind(String((course as any).code || ''))
      .all<{ id: number }>()
    for (const row of rows.results || []) {
      const id = Number((row as any).id)
      if (Number.isFinite(id) && id > 0) ids.add(id)
    }
  }

  return Array.from(ids)
}

export async function purgeRelatedCourseDetailCache(db: D1Database, courseId: number) {
  await purgeCourseDetailCache(await collectRelatedCourseDetailCacheIds(db, courseId))
}
