import assert from 'node:assert/strict'
import test from 'node:test'

import app from '../src/index'

test('POST /api/review is closed before captcha or database access', async () => {
  const db = {
    prepare() {
      throw new Error('database must not be touched when review creation is disabled')
    }
  }

  const response = await app.fetch(
    new Request('http://localhost/api/review', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': '198.51.100.10'
      },
      body: '{}'
    }),
    {
      DB: db,
      COURSE_SEARCH_INDEX: undefined,
      CAPTCHA_SITEVERIFY_URL: '',
      ADMIN_SECRET: '',
      APP_ENV: 'production',
      MIGRATION_READONLY: ''
    } as any
  )

  assert.equal(response.status, 410)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), {
    error: 'review_creation_disabled',
    message: '新课程评价写入功能已关闭'
  })
})
