import type { MiddlewareHandler } from 'hono'
import type { Bindings } from '../helpers/types'

/**
 * 迁移期只读中间件：MIGRATION_READONLY=1 时拒绝用户写请求（503 maintenance），
 * 保证正式切流期间 D1 的最后一份数据与 VPS SQLite 的第一份数据一致。
 *
 * 放行例外：
 * - 管理接口 /api/admin/*（管理员维护必需）
 * - 排课模拟器（pk）的 POST 查询接口（/api/find*、/api/getAll*、/api/getLatest*）
 * - /api/startup/verify（Turnstile 校验，只读）
 */
const READONLY_EXEMPT_PREFIXES = [
  '/api/admin/',
  '/api/find',
  '/api/getAll',
  '/api/getLatest',
  '/api/startup/verify'
]

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const migrationReadonlyMiddleware: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  if (String(c.env.MIGRATION_READONLY || '').trim() !== '1') return next()
  if (!WRITE_METHODS.has(c.req.method)) return next()

  const pathname = new URL(c.req.url).pathname
  if (READONLY_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return next()
  }

  return c.json({ error: 'maintenance' }, 503)
}
