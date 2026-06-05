import axios from 'axios'

// Base URL is set in main.ts via axios.defaults.baseURL
const api = axios.create()

// Error helper
function extractError(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { msg?: string } } }
  return e?.response?.data?.msg || fallback
}

// ---- API functions ----

export async function getAllCalendar() {
  const res = await api.get('/api/getAllCalendar')
  return res.data?.data || res.data
}

export async function findGradeByCalendarId(calendarId: number) {
  const res = await api.post('/api/findGradeByCalendarId', { calendarId })
  return res.data?.data || res.data
}

export async function findMajorByGrade(calendarId: number, grade: string) {
  const res = await api.post('/api/findMajorByGrade', { calendarId, grade })
  return res.data?.data || res.data
}

export async function findCourseByMajor(calendarId: number, grade: string, code: string) {
  const res = await api.post('/api/findCourseByMajor', { calendarId, grade, code })
  return res.data?.data || res.data
}

export async function findOptionalCourseType(calendarId: number) {
  const res = await api.post('/api/findOptionalCourseType', { calendarId })
  return res.data?.data || res.data
}

export async function findOptionalCourseByNatureId(calendarId: number, natureIds: number[]) {
  const res = await api.post('/api/findCourseByNatureId', { calendarId, typeIds: natureIds })
  return res.data?.data || res.data
}

export async function findCourseDetailByCode(calendarId: number, codes: string[]) {
  const res = await api.post('/api/findCourseDetailByCode', { calendarId, codes })
  return res.data?.data || res.data
}

export async function findCourseByTime(calendarId: number, day: number, section: number) {
  const res = await api.post('/api/findCourseByTime', { calendarId, day, section })
  return res.data?.data || res.data
}

export async function findCourseBySearch(params: { calendarId: number; courseName?: string; courseCode?: string; teacherCode?: string; teacherName?: string; campus?: string; faculty?: string }) {
  const res = await api.post('/api/findCourseBySearch', params)
  return res.data?.data || res.data
}

export async function getAllCampus() {
  const res = await api.get('/api/getAllCampus')
  return res.data?.data || res.data
}

export async function getAllFaculty() {
  const res = await api.get('/api/getAllFaculty')
  return res.data?.data || res.data
}

export async function getLatestUpdateTime() {
  const res = await api.get('/api/getLatestUpdateTime')
  return res.data?.data || res.data
}

export async function getLatestCourseInfo(calendarId: number, codes: string[]) {
  const res = await api.post('/api/getLatestCourseInfo', { calendarId, codes })
  return res.data?.data || res.data
}

export async function getCourseByCode(code: string, teacherCode?: string, teacherName?: string) {
  const params: any = {}
  if (teacherCode) params.teacherCode = teacherCode
  if (teacherName) params.teacherName = teacherName
  const res = await api.get(`/api/course/by-code/${code}`, { params })
  return res.data?.data || res.data
}

export async function likeReview(reviewId: number) {
  await api.post(`/api/review/${reviewId}/like`)
}

export async function unlikeReview(reviewId: number) {
  await api.delete(`/api/review/${reviewId}/like`)
}

export { extractError }
