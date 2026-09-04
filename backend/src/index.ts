import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Bindings } from './helpers/types'
import { registerPkRoutes } from './pk/routes'
import { corsMiddleware } from './middleware/cors'
import { cacheControlMiddleware } from './middleware/cache-control'
import { migrationReadonlyMiddleware } from './middleware/migration-readonly'
import { rateLimitMiddleware } from './middleware/rate-limit'
import publicRoutes from './routes/public'
import adminRoutes from './routes/admin'
import settingsRoutes from './routes/settings'
import aiSummaryRoutes from './routes/ai-summary'
import { getServiceRuntimeState } from './runtime/service-state'

const app = new Hono<{ Bindings: Bindings }>()

// Global middleware
app.use('/*', corsMiddleware)
app.use('/*', cacheControlMiddleware)
// 迁移切流期只读保护（仅对用户写接口生效，管理接口放行）
app.use('/api/*', migrationReadonlyMiddleware)
// 分布式近似限流（Node 环境缓存为 no-op 时自动退化为内存限流）
app.use('/api/*', rateLimitMiddleware)

// 存活探针：只表示 Node 事件循环还能立即处理请求。
app.get('/livez', (c) => {
  const runtime = getServiceRuntimeState()
  return c.json({
    ok: true,
    shuttingDown: runtime.shuttingDown
  })
})

async function readinessResponse(c: Context<{ Bindings: Bindings }>) {
  const runtime = getServiceRuntimeState()

  if (runtime.shuttingDown) {
    return c.json({
      ok: false,
      reason: 'shutting_down',
      search: runtime.search
    }, 503)
  }

  try {
    await c.env.DB.prepare('SELECT 1').first()

    return c.json({
      ok: true,
      degraded: !runtime.search.usable,
      search: runtime.search
    })
  } catch (error: any) {
    return c.json({
      ok: false,
      reason: 'db_unavailable',
      error: error?.message || 'db error',
      search: runtime.search
    }, 503)
  }
}

// 就绪探针：数据库可读即可服务，搜索索引不可用时报告 degraded 并走 FTS。
app.get('/readyz', readinessResponse)

// 兼容已有反代、部署脚本和运维探测；新探测应使用 /readyz。
app.get('/healthz', readinessResponse)

// redeploy marker (no-op) v2

// Error handler
app.onError((err, c) => {
  console.error('Error:', err)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// Mount route groups
app.route('/api', publicRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api', aiSummaryRoutes)

// pk(排课模拟器) 兼容接口：给嵌入的 Vue 子应用使用
registerPkRoutes(app)

export default app
