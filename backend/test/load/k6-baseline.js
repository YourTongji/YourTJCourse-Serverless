import http from 'k6/http'
import { check, sleep } from 'k6'

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const courseId = __ENV.COURSE_ID || '1'

// 20 slots: 25% courses, 20% detail, 15% runtime-state,
// 15% calendar/campus, 25% second public-list shape.
const paths = [
  '/api/courses', '/api/courses', '/api/courses', '/api/courses', '/api/courses',
  `/api/course/${encodeURIComponent(courseId)}`,
  `/api/course/${encodeURIComponent(courseId)}`,
  `/api/course/${encodeURIComponent(courseId)}`,
  `/api/course/${encodeURIComponent(courseId)}`,
  '/api/settings/runtime-state', '/api/settings/runtime-state', '/api/settings/runtime-state',
  '/api/getAllCalendar', '/api/getAllCampus', '/api/getAllCalendar',
  '/api/courses?onlyWithReviews=true&limit=20',
  '/api/courses?onlyWithReviews=true&limit=20',
  '/api/courses?onlyWithReviews=true&limit=20',
  '/api/courses?onlyWithReviews=true&limit=20',
  '/api/courses?onlyWithReviews=true&limit=20'
]

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '10m',
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<500', 'p(99)<1500']
  }
}

export default function () {
  const response = http.get(`${baseUrl}${paths[__ITER % paths.length]}`, {
    tags: { suite: 'baseline' },
    timeout: '5s'
  })
  check(response, { 'public request succeeds': (res) => res.status >= 200 && res.status < 300 })
  sleep(0.2)
}
