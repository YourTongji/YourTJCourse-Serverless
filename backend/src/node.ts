import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import app from './index'
import { createBindings } from './runtime/env'
import { installNoopCaches } from './runtime/cache'
import { ensureDbInitialized } from './helpers/db'
import {
  setSearchRuntimeState,
  setShuttingDown
} from './runtime/service-state'
import {
  createLocalCourseSearchProvider,
  LocalCourseSearchIndexManager
} from './runtime/course-search-local'
import { installLocalCourseSearchProvider } from './helpers/course-mini-search'
import {
  decrementActiveRequests,
  getActiveRequests,
  incrementActiveRequests,
  startRuntimeTelemetry
} from './runtime/telemetry'

/**
 * VPS 上的 Node.js 启动入口。
 * 启动流程：注入 no-op Cache API → 构造 Bindings → 初始化 SQLite → 监听 8787。
 */
export async function main() {
  installNoopCaches()

  const bindings = createBindings()
  await bindings.DB.init()
  // Schema/bootstrap writes are allowed before the listener accepts traffic.
  // Keeping this out of public GET handlers prevents the first user request
  // after a restart from paying the migration/DDL cost.
  await ensureDbInitialized(bindings.DB as any)

  const searchIndexDir = process.env.COURSE_SEARCH_INDEX_DIR || '/data/search-index/current'
  const searchManager = new LocalCourseSearchIndexManager(searchIndexDir, bindings.DB)
  installLocalCourseSearchProvider(createLocalCourseSearchProvider(searchManager))

  try {
    await searchManager.preload()
    const status = searchManager.getStatus()
    setSearchRuntimeState({
      mode: status.usable ? 'local-prebuilt' : 'fts-fallback',
      ...status
    })
    console.log(JSON.stringify({
      event: 'course_search_preloaded',
      searchIndexDir,
      ...status
    }))
  } catch (error: any) {
    const message = error?.message || 'failed to preload local search index'
    const status = searchManager.getStatus()
    setSearchRuntimeState({
      mode: 'fts-fallback',
      ...status,
      lastError: message
    })
    console.error(JSON.stringify({
      event: 'course_search_preload_failed',
      searchIndexDir,
      error: message,
      fallback: 'sqlite_fts'
    }))
  }

  const port = Number(process.env.PORT || 8787)
  const hostname = process.env.BIND_HOST || '0.0.0.0'
  const stopTelemetry = startRuntimeTelemetry()

  const server = serve({
    fetch: async (request) => {
      const startedAt = performance.now()
      const requestId = request.headers.get('x-request-id') || randomUUID()
      incrementActiveRequests()

      try {
        const response = await app.fetch(request, bindings)
        const durationMs = performance.now() - startedAt

        response.headers.set('x-request-id', requestId)
        console.log(JSON.stringify({
          event: 'http_request',
          ts: new Date().toISOString(),
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          status: response.status,
          durationMs: Number(durationMs.toFixed(2)),
          activeRequests: getActiveRequests()
        }))

        return response
      } catch (error: any) {
        const durationMs = performance.now() - startedAt
        console.error(JSON.stringify({
          event: 'http_request',
          ts: new Date().toISOString(),
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          status: 500,
          durationMs: Number(durationMs.toFixed(2)),
          activeRequests: getActiveRequests(),
          error: error?.message || String(error)
        }))
        throw error
      } finally {
        decrementActiveRequests()
      }
    },
    hostname,
    port
  })

  console.log(JSON.stringify({
    event: 'backend_started',
    ts: new Date().toISOString(),
    hostname,
    port,
    buildSha: process.env.BUILD_SHA || null
  }))

  let searchReloadInFlight: Promise<void> | null = null
  process.on('SIGHUP', () => {
    if (searchReloadInFlight) return
    searchManager.invalidateGenerationCheck()

    const task = (async () => {
      try {
        await searchManager.reload()
        const status = searchManager.getStatus()
        setSearchRuntimeState({
          mode: status.usable ? 'local-prebuilt' : 'fts-fallback',
          ...status
        })
        console.log(JSON.stringify({ event: 'course_search_reloaded', ...status }))
      } catch (error: any) {
        const status = searchManager.getStatus()
        setSearchRuntimeState({
          mode: status.usable ? 'local-prebuilt' : 'fts-fallback',
          ...status,
          lastError: error?.message || 'search index reload failed'
        })
        console.error(JSON.stringify({
          event: 'course_search_reload_failed',
          error: error?.message || String(error),
          preservedGeneration: status.generation
        }))
      }
    })()
    searchReloadInFlight = task.finally(() => {
      searchReloadInFlight = null
    })
  })

  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    setShuttingDown(true)

    console.log(JSON.stringify({
      event: 'backend_shutdown_begin',
      signal,
      activeRequests: getActiveRequests()
    }))

    stopTelemetry()

    const forceTimer = setTimeout(() => {
      console.error(JSON.stringify({
        event: 'backend_shutdown_forced',
        signal,
        activeRequests: getActiveRequests()
      }))
      process.exit(1)
    }, 25_000)
    forceTimer.unref()

    server.close((error) => {
      clearTimeout(forceTimer)
      if (error) {
        console.error('[backend] graceful shutdown failed:', error)
        process.exit(1)
      }
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error) => {
  console.error('[backend] failed to start:', error)
  process.exit(1)
})
