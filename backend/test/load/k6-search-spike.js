import http from 'k6/http'
import { check, sleep } from 'k6'

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const queries = ['高数', '高等数学', '线代', '复变', '数学', '工程', '大学', '基础', '老师姓名', '课程号', '教师工号']

export const options = {
  scenarios: {
    search_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '10s', target: 0 }
      ],
      gracefulRampDown: '10s'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<500', 'p(99)<1500']
  }
}

export default function () {
  const query = encodeURIComponent(queries[__ITER % queries.length])
  const response = http.get(`${baseUrl}/api/courses?q=${query}&limit=20`, {
    tags: { suite: 'search-spike' },
    timeout: '5s'
  })
  check(response, { 'search request succeeds': (res) => res.status >= 200 && res.status < 300 })
  sleep(0.1)
}
