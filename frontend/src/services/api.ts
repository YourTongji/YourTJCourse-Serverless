import { fetchWithTimeout } from '../utils/fetch'

function trimApiBase(value: string | undefined | null) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function resolveApiBase() {
  const envBase = trimApiBase(import.meta.env.VITE_API_URL)
  if (envBase) return envBase

  if (typeof window === 'undefined') return ''

  const { hostname } = window.location
  if (hostname === 'xk.yourtj.de') return 'https://jcourse.yourtj.de'
  if (hostname === '127.0.0.1' || hostname === 'localhost') return ''

  return trimApiBase(window.location.origin)
}

export const API_BASE = resolveApiBase()

export type CourseAdvancedFilters = {
  departments?: string[]
  onlyWithReviews?: boolean
  courseName?: string
  courseCode?: string
  teacherName?: string
  teacherCode?: string
  campus?: string
  faculty?: string
}

export type AnnouncementType = 'info' | 'warning' | 'error' | 'success'

export interface SiteAnnouncement {
  id: string
  type: AnnouncementType
  content: string
  enabled?: boolean
}

export interface MaintenanceSettingsResponse {
  enabled: boolean
  config?: unknown
}

export interface SiteRuntimeStateResponse {
  maintenance: MaintenanceSettingsResponse
  announcements: SiteAnnouncement[]
  updatedAt: number
}

export async function fetchCourses(
  keyword?: string,
  legacy?: boolean,
  page = 1,
  limit = 20,
  filters?: CourseAdvancedFilters,
  options?: { includeTotal?: boolean }
) {
  let url = `${API_BASE}/api/courses?page=${page}&limit=${limit}&`
  if (keyword) url += `q=${encodeURIComponent(keyword)}&`
  if (legacy) url += `legacy=true&`
  if (options?.includeTotal) url += 'includeTotal=true&'
  if (filters?.departments && filters.departments.length > 0) url += `departments=${encodeURIComponent(filters.departments.join(','))}&`
  if (filters?.onlyWithReviews) url += `onlyWithReviews=true&`
  if (filters?.courseName) url += `courseName=${encodeURIComponent(filters.courseName)}&`
  if (filters?.courseCode) url += `courseCode=${encodeURIComponent(filters.courseCode)}&`
  if (filters?.teacherName) url += `teacherName=${encodeURIComponent(filters.teacherName)}&`
  if (filters?.teacherCode) url += `teacherCode=${encodeURIComponent(filters.teacherCode)}&`
  if (filters?.campus) url += `campus=${encodeURIComponent(filters.campus)}&`
  if (filters?.faculty) url += `faculty=${encodeURIComponent(filters.faculty)}&`
  const needHeavyFilter = Boolean(
    filters?.courseName || filters?.teacherName || filters?.teacherCode || filters?.campus || filters?.faculty
  )
  const res = await fetchWithTimeout(url, undefined, needHeavyFilter ? 25000 : 15000)
  if (!res.ok) throw new Error('Failed to fetch courses')
  return res.json()
}

export async function fetchDepartments(legacy?: boolean) {
  let url = `${API_BASE}/api/departments?`
  if (legacy) url += `legacy=true`
  const res = await fetchWithTimeout(url, undefined, 15000)
  if (!res.ok) throw new Error('Failed to fetch departments')
  return res.json()
}

export async function fetchCourse(id: string, opts?: { clientId?: string; legacy?: boolean }) {
  const q = new URLSearchParams()
  if (opts?.clientId) q.set('clientId', opts.clientId)
  if (opts?.legacy) q.set('legacy', 'true')
  const suffix = q.toString() ? `?${q.toString()}` : ''
  const res = await fetchWithTimeout(`${API_BASE}/api/course/${id}${suffix}`, undefined, 15000)
  if (!res.ok) throw new Error('Failed to fetch course')
  return res.json()
}

export async function fetchCourseRelated(id: string, opts?: { legacy?: boolean }) {
  const q = new URLSearchParams()
  if (opts?.legacy) q.set('legacy', 'true')
  const suffix = q.toString() ? `?${q.toString()}` : ''
  const res = await fetchWithTimeout(`${API_BASE}/api/course/${id}/related${suffix}`, undefined, 15000)
  if (!res.ok) throw new Error('Failed to fetch related course data')
  return res.json()
}

export async function fetchSiteRuntimeState() {
  const res = await fetchWithTimeout(`${API_BASE}/api/settings/runtime-state`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  }, 15000)
  if (!res.ok) throw new Error('Failed to fetch runtime state')
  return res.json() as Promise<SiteRuntimeStateResponse>
}

export async function submitReview(data: {
  course_id: number
  rating: number
  comment: string
  semester: string
  turnstile_token: string
  reviewer_name?: string
  reviewer_avatar?: string
  walletUserHash?: string
}) {
  const res = await fetchWithTimeout(`${API_BASE}/api/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }, 15000)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    try {
      const json = JSON.parse(text)
      throw new Error(json?.error || json?.message || `提交失败 (HTTP ${res.status})`)
    } catch {
      throw new Error(text || `提交失败 (HTTP ${res.status})`)
    }
  }
  return res.json()
}

export async function likeReview(reviewId: number, clientId: string) {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId })
  }, 15000)
  if (!res.ok) throw new Error('Failed to like review')
  return res.json()
}

export async function unlikeReview(reviewId: number, clientId: string) {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}/like`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId })
  }, 15000)
  if (!res.ok) throw new Error('Failed to unlike review')
  return res.json()
}

export async function patchReviewEditToken(reviewId: number, editToken: string, walletUserHash: string) {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}/edit-token`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edit_token: editToken, walletUserHash })
  })
  return res.json()
}

export async function updateReview(reviewId: number, data: {
  rating: number
  comment: string
  semester: string
  turnstile_token: string
  reviewer_name?: string
  reviewer_avatar?: string
  walletUserHash?: string
}) {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }, 15000)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    try {
      const json = JSON.parse(text)
      throw new Error(json?.error || json?.message || `提交失败 (HTTP ${res.status})`)
    } catch {
      throw new Error(text || `提交失败 (HTTP ${res.status})`)
    }
  }
  return res.json()
}
