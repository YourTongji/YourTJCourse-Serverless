import { Hono } from 'hono'
import type { Bindings } from '../helpers/types'
import { decodeReviewId } from '../sqids'
import { syncOnesystemToPkTables } from '../pk/sync'
import { refreshCourseStats } from '../courseStats'
import {
  ensureDbInitialized,
  AUX_SCHEMA_VERSION,
  rebuildAllAuxiliaryCourseData,
  refreshAuxiliaryCourseData,
  deleteAuxiliaryCourseData,
  invalidateSettingCaches,
} from '../helpers/db'
import { adminAuthMiddleware } from '../middleware/admin-auth'
import { addSqidToReviews } from '../helpers/review'

const admin = new Hono<{ Bindings: Bindings }>()
admin.use('/*', adminAuthMiddleware)

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
      const decodedId = decodeReviewId(keyword)
      if (decodedId !== null) {
        whereClause = 'WHERE r.id = ?'
        params = [decodedId.toString()]
      } else {
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

  const review = await c.env.DB.prepare('SELECT course_id FROM reviews WHERE id = ?').bind(id).first<{course_id: number}>()
  if (review) {
    await refreshCourseStats(c.env.DB, Number(review.course_id))
  }

  return c.json({ success: true })
})

admin.post('/review/:id/toggle', async (c) => {
  const id = c.req.param('id')
  const review = await c.env.DB.prepare('SELECT course_id FROM reviews WHERE id = ?').bind(id).first<{course_id: number}>()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  await c.env.DB.prepare('UPDATE reviews SET is_hidden = NOT is_hidden WHERE id = ?').bind(id).run()

  await refreshCourseStats(c.env.DB, Number(review.course_id))

  return c.json({ success: true })
})

admin.delete('/review/:id', async (c) => {
  const id = c.req.param('id')
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
  await c.env.DB.prepare('DELETE FROM reviews WHERE course_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM course_aliases WHERE course_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(id).run()
  await deleteAuxiliaryCourseData(c.env.DB, [Number(id)])
  return c.json({ success: true })
})

admin.post('/course', async (c) => {
  const body = await c.req.json()
  const { code, name, credit, department, teacher_name, search_keywords } = body

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

export default admin
