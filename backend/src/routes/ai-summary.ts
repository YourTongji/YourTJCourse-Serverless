import { Hono } from 'hono'
import type { Bindings } from '../helpers/types'
import type { AiSummaryResult } from '../helpers/summary'
import { generateSummary } from '../helpers/summary'

const aiSummary = new Hono<{ Bindings: Bindings }>()

// Per-course rate limit (10 min window)
const summaryRateLimit = new Map<string, { count: number; windowStart: number }>()
const SUMMARY_LIMIT_WINDOW = 600_000 // 10 min
const SUMMARY_LIMIT_MAX = 1

function checkSummaryLimit(courseId: string | number): boolean {
  const key = `course:${courseId}`
  const now = Date.now()
  const entry = summaryRateLimit.get(key)
  if (!entry || now - entry.windowStart > SUMMARY_LIMIT_WINDOW) {
    summaryRateLimit.set(key, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= SUMMARY_LIMIT_MAX) return false
  entry.count++
  return true
}

aiSummary.get('/course/:id/summary', async (c) => {
  try {
    const courseId = Number(c.req.param('id'))
    if (!Number.isFinite(courseId) || courseId <= 0) {
      return c.json({ error: 'Invalid course id' }, 400)
    }

    const refresh = c.req.query('refresh') === 'true'
    const cacheKey = `summary:${courseId}`

    // Check cache (unless refresh)
    if (!refresh) {
      const cache = caches.default
      const cached = await cache.match(`https://jcourse-summary/${cacheKey}`)
      if (cached) {
        const data: any = await cached.json()
        return c.json({ ...(data || {}), cache: 'hit' })
      }
    }

    // Rate limit (only applies to active generation)
    if (!checkSummaryLimit(courseId)) {
      return c.json({ error: '该课程的 AI 总结已生成，10 分钟内可刷新一次' }, 429)
    }

    // Get course info
    const course = await c.env.DB
      .prepare('SELECT id, code, name FROM courses WHERE id = ? LIMIT 1')
      .bind(courseId)
      .first<{ id: number; code: string; name: string }>()

    if (!course) return c.json({ error: 'Course not found' }, 404)

    // Get reviews (non-hidden, with content)
    const { results } = await c.env.DB
      .prepare(
        `SELECT id, rating, comment FROM reviews
         WHERE course_id = ? AND is_hidden = 0 AND comment IS NOT NULL AND comment != ''
         ORDER BY created_at DESC LIMIT 30`
      )
      .bind(courseId)
      .all<{ id: number; rating: number; comment: string }>()

    if (!results || results.length === 0) {
      return c.json({
        data: {
          rating_consensus: '数据不足',
          keywords: [],
          pros: [],
          cons: [],
          representative: []
        } as AiSummaryResult,
        generatedAt: Date.now()
      })
    }

    // Truncate long comments
    const reviews = (results as any[]).map((r: any) => ({
      id: Number(r.id),
      rating: Math.max(0, Math.min(5, Number(r.rating || 0))),
      comment: String(r.comment || '').slice(0, 2000)
    }))

    // Generate summary via AI
    const data = await generateSummary(c.env, course.name, course.code, reviews)

    const responseBody = { data, generatedAt: Date.now() }

    // Cache for 1 hour
    const cacheRes = new Response(JSON.stringify(responseBody), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    })
    c.executionCtx.waitUntil(caches.default.put(`https://jcourse-summary/${cacheKey}`, cacheRes.clone()))

    return c.json({ ...responseBody, cache: 'miss' })
  } catch (err: any) {
    console.error('AI summary error:', err)
    return c.json({ error: err.message || '生成失败' }, 500)
  }
})

export default aiSummary
