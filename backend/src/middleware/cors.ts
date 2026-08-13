import { cors } from 'hono/cors'

const ALLOWED_ORIGINS = [
  'https://xk.yourtj.de',
  'https://xk.xialing.icu',
  'https://jcourse.yourtj.de',
  'https://jcourse-web.pages.dev',
  'https://dev.jcourse-web.pages.dev',
]

export const corsMiddleware = cors({
  origin: (origin, c) => {
    if (!origin) return '*'
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    if (/^https:\/\/[a-z0-9-]+\.jcourse-web\.pages\.dev$/i.test(origin)) return origin
    // Netlify 临时域名（迁移测试期；正式绑定 xk.yourtj.de 后保留无害）
    if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(origin)) return origin
    try {
      const u = new URL(origin)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return origin
    } catch { /* ignore invalid URLs */ }
    return null
  },
  allowHeaders: ['Content-Type', 'x-admin-secret', 'Cache-Control'],
  allowMethods: ['POST', 'GET', 'DELETE', 'PUT', 'PATCH', 'OPTIONS']
})
