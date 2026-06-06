import { Hono } from 'hono'
import type { Bindings } from '../helpers/types'
import type { AiSummaryResult } from '../helpers/summary'
import { generateSummary } from '../helpers/summary'

const aiSummary = new Hono<{ Bindings: Bindings }>()

// Per-course rate limit (10 min window) — only for active AI generation
const summaryRateLimit = new Map<string, { count: number; windowStart: number }>()
const SUMMARY_LIMIT_WINDOW = 600_000 // 10 min
const SUMMARY_LIMIT_MAX = 1

function tryConsumeLimit(courseId: string | number): boolean {
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

interface AiSummaryRow {
  course_id: number
  summary_json: string
  rating_consensus: string
  model: string
  generated_at: number
}

aiSummary.get('/course/:id/summary', async (c) => {
  try {
    const courseId = Number(c.req.param('id'))
    if (!Number.isFinite(courseId) || courseId <= 0) {
      return c.json({ error: 'Invalid course id' }, 400)
    }

    const refresh = c.req.query('refresh') === 'true'
    const db = c.env.DB

    // Try DB lookup first (unless refresh)
    if (!refresh) {
      const row = await db
        .prepare('SELECT course_id, summary_json, rating_consensus, model, generated_at FROM ai_summaries WHERE course_id = ?')
        .bind(courseId)
        .first<AiSummaryRow>()

      if (row) {
        const data: AiSummaryResult = JSON.parse(row.summary_json)
        return c.json({ data, generatedAt: Number(row.generated_at) * 1000, cache: 'db' })
      }
    }

    // Rate limit — protects AI API calls
    if (!tryConsumeLimit(courseId)) {
      // Rate limited: try DB fallback (for when refresh is rate-limited but DB has data)
      const row = await db
        .prepare('SELECT course_id, summary_json, rating_consensus, model, generated_at FROM ai_summaries WHERE course_id = ?')
        .bind(courseId)
        .first<AiSummaryRow>()
      if (row) {
        const data: AiSummaryResult = JSON.parse(row.summary_json)
        return c.json({ data, generatedAt: Number(row.generated_at) * 1000, cache: 'rate-limited' })
      }
      return c.json({ error: '该课程正在生成总结，请稍后再试' }, 429)
    }

    // Get course info
    const course = await db
      .prepare('SELECT id, code, name FROM courses WHERE id = ? LIMIT 1')
      .bind(courseId)
      .first<{ id: number; code: string; name: string }>()

    if (!course) return c.json({ error: 'Course not found' }, 404)

    // Get reviews (non-hidden, with content)
    const { results } = await db
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

    const nowUnix = Math.floor(Date.now() / 1000)
    const model = String(c.env.AI_SUMMARY_MODEL || '').trim() || 'qwen3.6-flash-2026-04-16'

    // Persist to DB
    c.executionCtx.waitUntil(
      db
        .prepare(
          `INSERT OR REPLACE INTO ai_summaries (course_id, summary_json, rating_consensus, model, generated_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          courseId,
          JSON.stringify(data),
          data.rating_consensus || '',
          model,
          nowUnix
        )
        .run()
    )

    return c.json({ data, generatedAt: nowUnix * 1000, cache: 'miss' })
  } catch (err: any) {
    console.error('AI summary error:', err)
    return c.json({ error: err.message || '生成失败' }, 500)
  }
})

export default aiSummary
