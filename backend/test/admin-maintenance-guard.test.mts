import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../src/index'

const bindings = {
  DB: {
    prepare() {
      throw new Error('production VPS maintenance guard must run before DB access')
    }
  },
  COURSE_SEARCH_INDEX: undefined,
  CAPTCHA_SITEVERIFY_URL: '',
  ADMIN_SECRET: 'test-secret',
  APP_ENV: 'production'
} as any

for (const path of ['/api/admin/pk/sync', '/api/admin/pk/refresh-review-index']) {
  test(`${path} rejects online production VPS maintenance`, async () => {
    const response = await app.fetch(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: {
          'x-admin-secret': 'test-secret',
          'content-type': 'application/json'
        },
        body: '{}'
      }),
      bindings
    )
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      error: 'offline_maintenance_required',
      message: path.endsWith('sync')
        ? 'Production VPS synchronization must run through the maintenance CLI.'
        : 'Production VPS index refresh must run through the maintenance CLI.'
    })
  })
}
