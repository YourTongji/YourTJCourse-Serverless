import http from 'k6/http'
import { check, sleep } from 'k6'

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const courseId = __ENV.COURSE_ID || '1'
const paths = [
  '/api/courses',
  '/api/courses?q=%E9%AB%98%E6%95%B0&limit=20',
  '/api/settings/runtime-state',
  '/api/getAllCalendar',
  `/api/course/${encodeURIComponent(courseId)}`
]

// Run this for 20 VU while the operator performs the documented maintenance
// CLI sequence. It intentionally has no endpoint that triggers maintenance.
export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '20m',
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<500', 'p(99)<1500']
  }
}

export default function () {
  const response = http.get(`${baseUrl}${paths[__ITER % paths.length]}`, {
    tags: { suite: 'search-maintenance' },
    timeout: '5s'
  })
  check(response, { 'request succeeds': (res) => res.status >= 200 && res.status < 300 })
  sleep(0.2)
}
