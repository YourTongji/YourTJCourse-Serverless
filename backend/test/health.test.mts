import assert from 'node:assert/strict'
import test from 'node:test'

import app from '../src/index.ts'
import {
  getServiceRuntimeState,
  setSearchRuntimeState,
  setShuttingDown
} from '../src/runtime/service-state.ts'

function bindingsWithDb(db: any) {
  return {
    DB: db,
    COURSE_SEARCH_INDEX: undefined,
    CAPTCHA_SITEVERIFY_URL: '',
    ADMIN_SECRET: '',
    APP_ENV: 'production'
  }
}

test('GET /livez does not touch the database', async () => {
  const db = {
    prepare() {
      throw new Error('DB MUST NOT BE TOUCHED')
    }
  }

  const response = await app.fetch(
    new Request('http://localhost/livez'),
    bindingsWithDb(db)
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    shuttingDown: false
  })
})

test('GET /readyz reports database readiness', async () => {
  const statements: string[] = []
  const db = {
    prepare(sql: string) {
      statements.push(sql)
      return {
        first: async () => ({ ok: 1 })
      }
    }
  }

  const response = await app.fetch(
    new Request('http://localhost/readyz'),
    bindingsWithDb(db)
  )
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.degraded, false)
  assert.deepEqual(statements, ['SELECT 1'])
})

test('GET /healthz remains a compatible readiness alias', async () => {
  const db = {
    prepare() {
      return {
        first: async () => ({ ok: 1 })
      }
    }
  }

  const response = await app.fetch(
    new Request('http://localhost/healthz'),
    bindingsWithDb(db)
  )

  assert.equal(response.status, 200)
  assert.equal((await response.json() as any).ok, true)
})

test('GET /readyz returns 503 when the database is unavailable', async () => {
  const db = {
    prepare() {
      return {
        first: async () => {
          throw new Error('database unavailable')
        }
      }
    }
  }

  const response = await app.fetch(
    new Request('http://localhost/readyz'),
    bindingsWithDb(db)
  )
  const body = await response.json() as any

  assert.equal(response.status, 503)
  assert.equal(body.ok, false)
  assert.equal(body.reason, 'db_unavailable')
})

test('GET /readyz reports degraded search while serving from fallback', async () => {
  setSearchRuntimeState({
    mode: 'fts-fallback',
    loaded: false,
    usable: false,
    lastError: 'index unavailable'
  })

  try {
    const db = {
      prepare() {
        return {
          first: async () => ({ ok: 1 })
        }
      }
    }

    const response = await app.fetch(
      new Request('http://localhost/readyz'),
      bindingsWithDb(db)
    )
    const body = await response.json() as any

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.degraded, true)
    assert.equal(body.search.mode, 'fts-fallback')
  } finally {
    setSearchRuntimeState({
      mode: 'worker-kv',
      loaded: true,
      usable: true,
      lastError: null
    })
  }
})

test('GET /readyz returns 503 without touching the database while shutting down', async () => {
  setShuttingDown(true)

  try {
    const db = {
      prepare() {
        throw new Error('DB MUST NOT BE TOUCHED during shutdown')
      }
    }

    const response = await app.fetch(
      new Request('http://localhost/readyz'),
      bindingsWithDb(db)
    )
    const body = await response.json() as any

    assert.equal(response.status, 503)
    assert.equal(body.ok, false)
    assert.equal(body.reason, 'shutting_down')
  } finally {
    setShuttingDown(false)
  }
})

test('runtime state is returned as a defensive copy', () => {
  const state = getServiceRuntimeState()
  state.search.mode = 'fts-fallback'
  assert.equal(getServiceRuntimeState().search.mode, 'worker-kv')
})
