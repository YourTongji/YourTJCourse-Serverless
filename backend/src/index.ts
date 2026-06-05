import { Hono } from 'hono'
import type { Bindings } from './helpers/types'
import { registerPkRoutes } from './pk/routes'
import { corsMiddleware } from './middleware/cors'
import { cacheControlMiddleware } from './middleware/cache-control'
import publicRoutes from './routes/public'
import adminRoutes from './routes/admin'
import settingsRoutes from './routes/settings'

const app = new Hono<{ Bindings: Bindings }>()

// Global middleware
app.use('/*', corsMiddleware)
app.use('/*', cacheControlMiddleware)

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

// pk(排课模拟器) 兼容接口：给嵌入的 Vue 子应用使用
registerPkRoutes(app)

export default app
