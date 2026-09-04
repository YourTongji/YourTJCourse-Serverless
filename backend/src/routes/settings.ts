import { Hono } from 'hono'
import type { Bindings } from '../helpers/types'
import {
  ensurePublicReadReady,
  getShowIcuSetting,
  getMaintenanceModeSetting,
  getMaintenanceConfigSetting,
  parseSiteAnnouncements,
} from '../helpers/db'
import { setPublicCacheHeaders } from '../helpers/cache'

const settings = new Hono<{ Bindings: Bindings }>()

const RUNTIME_STATE_CACHE_TTL_MS = 15_000
type RuntimeStatePayload = {
  maintenance: {
    enabled: boolean
    config: any | null
  }
  announcements: any[]
  updatedAt: number
}

let runtimeStateCache: { payload: RuntimeStatePayload; expiresAt: number } | null = null
let runtimeStateRefresh: Promise<RuntimeStatePayload> | null = null

async function loadRuntimeState(db: D1Database, env: Bindings): Promise<RuntimeStatePayload> {
  await ensurePublicReadReady(db)
  const [maintenanceEnabled, maintenanceConfig, announcementsRow] = await Promise.all([
    getMaintenanceModeSetting(db, env),
    getMaintenanceConfigSetting(db, env),
    db.prepare('SELECT value FROM settings WHERE key = ?').bind('site_announcements').first<{ value: string }>()
  ])

  return {
    maintenance: {
      enabled: maintenanceEnabled,
      config: maintenanceConfig
    },
    announcements: parseSiteAnnouncements(announcementsRow?.value),
    updatedAt: Date.now()
  }
}

settings.get('/show_icu', async (c) => {
  await ensurePublicReadReady(c.env.DB)
  const showIcu = await getShowIcuSetting(c.env.DB)
  setPublicCacheHeaders(c, 30, 60)
  return c.json({ show_icu: showIcu })
})

settings.get('/runtime-state', async (c) => {
  const now = Date.now()
  if (runtimeStateCache && runtimeStateCache.expiresAt > now) {
    c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=45')
    return c.json(runtimeStateCache.payload)
  }

  const refresh = runtimeStateRefresh || (runtimeStateRefresh = loadRuntimeState(c.env.DB, c.env))
  try {
    const payload = await refresh
    runtimeStateCache = {
      payload,
      expiresAt: Date.now() + RUNTIME_STATE_CACHE_TTL_MS
    }
    c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=45')
    return c.json(payload)
  } finally {
    if (runtimeStateRefresh === refresh) runtimeStateRefresh = null
  }
})

settings.get('/announcements', async (c) => {
  await ensurePublicReadReady(c.env.DB)
  const row = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('site_announcements').first<{ value: string }>()

  if (!row?.value) {
    setPublicCacheHeaders(c, 60, 300)
    return c.json({ announcements: [] })
  }

  try {
    const announcements = parseSiteAnnouncements(row.value)
    setPublicCacheHeaders(c, 60, 300)
    return c.json({ announcements })
  } catch {
    setPublicCacheHeaders(c, 60, 300)
    return c.json({ announcements: [] })
  }
})

settings.get('/maintenance', async (c) => {
  await ensurePublicReadReady(c.env.DB)
  const enabled = await getMaintenanceModeSetting(c.env.DB, c.env)
  const config = await getMaintenanceConfigSetting(c.env.DB, c.env)
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  return c.json({ enabled, config })
})

export default settings
