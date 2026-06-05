import { Hono } from 'hono'
import type { Bindings } from '../helpers/types'
import {
  ensureDbInitialized,
  getShowIcuSetting,
  getMaintenanceModeSetting,
  getMaintenanceConfigSetting,
  parseSiteAnnouncements,
} from '../helpers/db'
import { setPublicCacheHeaders } from '../helpers/cache'

const settings = new Hono<{ Bindings: Bindings }>()

settings.get('/show_icu', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const showIcu = await getShowIcuSetting(c.env.DB)
  setPublicCacheHeaders(c, 30, 60)
  return c.json({ show_icu: showIcu })
})

settings.get('/runtime-state', async (c) => {
  await ensureDbInitialized(c.env.DB)
  const [maintenanceEnabled, maintenanceConfig, announcementsRow] = await Promise.all([
    getMaintenanceModeSetting(c.env.DB, c.env),
    getMaintenanceConfigSetting(c.env.DB, c.env),
    c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('site_announcements').first<{ value: string }>()
  ])

  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  return c.json({
    maintenance: {
      enabled: maintenanceEnabled,
      config: maintenanceConfig
    },
    announcements: parseSiteAnnouncements(announcementsRow?.value),
    updatedAt: Date.now()
  })
})

settings.get('/announcements', async (c) => {
  await ensureDbInitialized(c.env.DB)
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
  await ensureDbInitialized(c.env.DB)
  const enabled = await getMaintenanceModeSetting(c.env.DB, c.env)
  const config = await getMaintenanceConfigSetting(c.env.DB, c.env)
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  return c.json({ enabled, config })
})

export default settings
