export type MaintenanceStatus = 'scheduled' | 'in-progress' | 'almost-done' | 'completed'

export interface ProgressStep {
  id: string
  label: string
  done: boolean
  active: boolean
}

export interface HistoryRecord {
  id: string
  date: string
  title: string
  description: string
}

export interface SocialLink {
  platform: string
  url: string
  label: string
}

export interface MaintenanceConfig {
  title: string
  subtitle: string
  status: MaintenanceStatus
  statusLabel: string
  message: string
  eta: string
  progress: ProgressStep[]
  contact: {
    email: string
  }
  socialLinks: SocialLink[]
  history: HistoryRecord[]
  lastUpdated: string
}

export interface MaintenanceDisplayConfig {
  message: string
  eta: string
  progress: ProgressStep[]
  lastUpdated: string
}

export interface MaintenanceSnapshot {
  enabled: boolean
  config: MaintenanceDisplayConfig
  savedAt: number
}

export const MAINTENANCE_CACHE_KEY = 'yourtj_maintenance_snapshot'
export const MAINTENANCE_EVENT = 'yourtj:maintenance-updated'
export const MAINTENANCE_CACHE_TTL_MS = 60_000

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  title: 'YourTJ选课社区',
  subtitle: '正在维护中，请稍候...',
  status: 'in-progress',
  statusLabel: '维护中',
  message: '正在进行数据迁移与系统性能优化',
  eta: '最晚 6 月 6 日 8:00 前恢复',
  progress: [
    { id: 'step-1', label: '合并 tongji.icu 点评数据', done: true, active: false },
    { id: 'step-2', label: '添加相关课程信息', done: true, active: false },
    { id: 'step-3', label: '排课模拟器重构', done: false, active: true },
    { id: 'step-4', label: '响应速度优化', done: false, active: false },
  ],
  contact: {
    email: 'support@yourtj.de',
  },
  socialLinks: [
    {
      platform: 'GitHub',
      url: 'https://github.com/WALKERKILLER/TongjiCourses-Serverless',
      label: 'GitHub 仓库',
    },
    {
      platform: 'Telegram',
      url: 'https://t.me/yourtongji',
      label: 'Telegram 频道',
    },
    {
      platform: 'QQ',
      url: 'https://qm.qq.com/q/6imb9Px7ws',
      label: 'QQ 群',
    },
  ],
  history: [
    {
      id: 'hist-1',
      date: '2026-05-28',
      title: '数据库性能优化',
      description: '优化选课高峰期数据库查询性能',
    },
    {
      id: 'hist-2',
      date: '2026-05-15',
      title: '排课模拟器更新',
      description: '新增学期切换与冲突检测功能',
    },
    {
      id: 'hist-3',
      date: '2026-04-20',
      title: '服务器迁移',
      description: '迁移至全新 CDN 节点提升访问速度',
    },
  ],
  lastUpdated: '2026-06-04 09:00',
}

export function normalizeMaintenanceDisplayConfig(value: unknown): MaintenanceDisplayConfig {
  const input = value && typeof value === 'object' ? (value as Record<string, any>) : {}
  const progress = Array.isArray(input.progress)
    ? input.progress
        .map((item, index) => ({
          id: String((item as any)?.id || `step-${index + 1}`),
          label: String((item as any)?.label || '').trim(),
          done: Boolean((item as any)?.done),
          active: Boolean((item as any)?.active)
        }))
        .filter((item) => item.label)
    : []

  return {
    message: String(input.message || DEFAULT_MAINTENANCE_CONFIG.message).trim() || DEFAULT_MAINTENANCE_CONFIG.message,
    eta: String(input.eta || DEFAULT_MAINTENANCE_CONFIG.eta).trim() || DEFAULT_MAINTENANCE_CONFIG.eta,
    progress: progress.length > 0 ? progress : DEFAULT_MAINTENANCE_CONFIG.progress,
    lastUpdated: String(input.lastUpdated || DEFAULT_MAINTENANCE_CONFIG.lastUpdated).trim() || DEFAULT_MAINTENANCE_CONFIG.lastUpdated
  }
}

export function readMaintenanceSnapshot(): MaintenanceSnapshot | null {
  try {
    const raw = localStorage.getItem(MAINTENANCE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MaintenanceSnapshot> | null
    if (!parsed || typeof parsed !== 'object') return null

    return {
      enabled: Boolean(parsed.enabled),
      config: normalizeMaintenanceDisplayConfig(parsed.config),
      savedAt: Number(parsed.savedAt || 0)
    }
  } catch {
    return null
  }
}

export function isMaintenanceSnapshotFresh(snapshot: MaintenanceSnapshot | null, now = Date.now()) {
  if (!snapshot) return false
  return now - snapshot.savedAt <= MAINTENANCE_CACHE_TTL_MS
}

export function writeMaintenanceSnapshot(enabled: boolean, config?: unknown) {
  const snapshot: MaintenanceSnapshot = {
    enabled,
    config: normalizeMaintenanceDisplayConfig(config),
    savedAt: Date.now()
  }

  try {
    localStorage.setItem(MAINTENANCE_CACHE_KEY, JSON.stringify(snapshot))
    window.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT, { detail: snapshot }))
  } catch {
    // ignore
  }

  return snapshot
}
