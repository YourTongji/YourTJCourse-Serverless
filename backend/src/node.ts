import { serve } from '@hono/node-server'
import app from './index'
import { createBindings } from './runtime/env'
import { installNoopCaches } from './runtime/cache'

/**
 * VPS 上的 Node.js 启动入口。
 * 启动流程：注入 no-op Cache API → 构造 Bindings → 初始化 SQLite → 监听 8787。
 */
async function main() {
  installNoopCaches()

  const bindings = createBindings()
  await bindings.DB.init()

  const port = Number(process.env.PORT || 8787)

  serve({
    fetch: (request) => app.fetch(request, bindings),
    port
  })

  console.log(`[backend] jcourse backend listening on http://127.0.0.1:${port}`)
}

main().catch((error) => {
  console.error('[backend] failed to start:', error)
  process.exit(1)
})
