export function buildCacheControl(maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
  return staleWhileRevalidateSeconds > 0
    ? `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
    : `public, max-age=${maxAgeSeconds}`
}

const DEFAULT_PROCESS_CACHE_MAX_ENTRIES = 256
const DEFAULT_PROCESS_CACHE_MAX_BYTES = 16 * 1024 * 1024

type ProcessCacheEntry = {
  status: number
  headers: Array<[string, string]>
  body: Uint8Array
  expiresAt: number
}

export type ProcessResponseCacheOptions = {
  maxEntries?: number
  maxBytes?: number
  now?: () => number
}

function parsePublicMaxAge(response: Response) {
  const cacheControl = response.headers.get('Cache-Control') || ''
  if (!/(^|,)\s*public(?:\s*,|$)/i.test(cacheControl)) return 0
  if (/(^|,)\s*no-store(?:\s*,|$)/i.test(cacheControl)) return 0
  const match = cacheControl.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/i)
  const maxAge = Number(match?.[1] || 0)
  return Number.isSafeInteger(maxAge) && maxAge > 0 ? maxAge : 0
}

/**
 * Bounded response cache used only by the Node/VPS runtime.
 * Worker runtimes leave it uninstalled and continue using Cloudflare Cache API.
 */
export class ProcessResponseCache {
  private readonly entries = new Map<string, ProcessCacheEntry>()
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly now: () => number
  private currentBytes = 0

  constructor(options: ProcessResponseCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries || DEFAULT_PROCESS_CACHE_MAX_ENTRIES))
    this.maxBytes = Math.max(1, Math.floor(options.maxBytes || DEFAULT_PROCESS_CACHE_MAX_BYTES))
    this.now = options.now || Date.now
  }

  async match(key: string): Promise<Response | null> {
    const entry = this.entries.get(key)
    if (!entry) return null

    const now = this.now()
    if (entry.expiresAt <= now) {
      this.delete(key)
      return null
    }

    // Map insertion order is the LRU order. Refresh on every successful hit.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return new Response(entry.body.slice(), {
      status: entry.status,
      headers: entry.headers
    })
  }

  async put(key: string, response: Response): Promise<void> {
    const maxAge = parsePublicMaxAge(response)
    if (!response.ok || maxAge <= 0) return

    try {
      const body = new Uint8Array(await response.clone().arrayBuffer())
      if (body.byteLength > this.maxBytes) return

      this.delete(key)
      const now = this.now()
      this.entries.set(key, {
        status: response.status,
        headers: Array.from(response.headers.entries()),
        body,
        expiresAt: now + maxAge * 1000,
      })
      this.currentBytes += body.byteLength
      this.evictIfNeeded()
    } catch {
      // The process cache is an optimization only. A locked/invalid body must
      // never turn a successful API response into a failed request.
    }
  }

  clear() {
    this.entries.clear()
    this.currentBytes = 0
  }

  getStats() {
    return {
      entries: this.entries.size,
      bytes: this.currentBytes
    }
  }

  private delete(key: string) {
    const previous = this.entries.get(key)
    if (!previous) return
    this.entries.delete(key)
    this.currentBytes -= previous.body.byteLength
  }

  private evictIfNeeded() {
    while (this.entries.size > this.maxEntries || this.currentBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.delete(oldestKey)
    }
  }
}

let processResponseCache: ProcessResponseCache | null = null

export function installProcessResponseCache(options?: ProcessResponseCacheOptions) {
  processResponseCache = new ProcessResponseCache(options)
  return processResponseCache
}

export function getProcessResponseCache() {
  return processResponseCache
}

export function clearProcessResponseCache() {
  processResponseCache?.clear()
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

export const COURSE_DETAIL_CACHE_VERSION = 'review-dislike-v1'

export function buildCourseDetailCacheRequest(courseId: string | number, showIcu: boolean) {
  const url = `https://cache.yourtj.de/api/course-base/${encodeURIComponent(String(courseId))}?showIcu=${showIcu ? '1' : '0'}&creditFallback=${COURSE_DETAIL_CACHE_VERSION}`
  return new Request(url, { method: 'GET' })
}

export async function purgeCourseDetailCache(courseIds: Array<string | number>) {
  clearProcessResponseCache()
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
    .prepare(
      `SELECT c.id, c.code, c.name, c.teacher_id, t.name AS teacher_name
       FROM courses c
       LEFT JOIN teachers t ON t.id = c.teacher_id
       WHERE c.id = ?
       LIMIT 1`
    )
    .bind(courseId)
    .first<{ id: number; code?: string | null; name?: string | null; teacher_id?: number | null; teacher_name?: string | null }>()
  if (!course) return [courseId]

  const ids = new Set<number>([courseId])
  const teacherName = String((course as any).teacher_name || '').trim()
  if (teacherName) {
    const teacherIdsRows = await db
      .prepare('SELECT id FROM teachers WHERE name = ?')
      .bind(teacherName)
      .all<{ id: number }>()
    const teacherIds = (teacherIdsRows.results || [])
      .map((row) => Number((row as any).id))
      .filter((id) => Number.isFinite(id))
    if (teacherIds.length === 0) return Array.from(ids)

    const placeholdersT = teacherIds.map(() => '?').join(',')
    const rows = await db
      .prepare(
        `SELECT id FROM courses
         WHERE code = ?
           AND name = ?
           AND teacher_id IN (${placeholdersT})
           AND NOT (is_legacy = 1 AND code LIKE '%AUTO%')`
      )
      .bind(String((course as any).code || ''), String((course as any).name || ''), ...teacherIds)
      .all<{ id: number }>()
    for (const row of rows.results || []) {
      const id = Number((row as any).id)
      if (Number.isFinite(id) && id > 0) ids.add(id)
    }
  } else {
    const rows = await db
      .prepare(
        `SELECT id FROM courses
         WHERE code = ?
           AND name = ?
           AND COALESCE(teacher_id, -1) = COALESCE(?, -1)
           AND NOT (is_legacy = 1 AND code LIKE '%AUTO%')`
      )
      .bind(String((course as any).code || ''), String((course as any).name || ''), -1)
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
