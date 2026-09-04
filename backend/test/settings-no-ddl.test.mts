import assert from 'node:assert/strict'
import test from 'node:test'

import app from '../src/index.ts'

function createReadOnlyDb() {
  const statements: string[] = []
  const db = {
    prepare(sql: string) {
      statements.push(sql)
      if (/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(sql)) {
        throw new Error(`public GET attempted write SQL: ${sql}`)
      }

      return {
        bind(...values: unknown[]) {
          return {
            first: async () => {
              if (sql.includes('sqlite_master')) return { cnt: 5 }
              if (sql.includes('site_announcements')) return null
              if (values.includes('show_legacy_reviews')) return { value: 'false' }
              if (values.includes('maintenance_mode')) return { value: 'false' }
              if (values.includes('maintenance_config')) return null
              return null
            }
          }
        },
        first: async () => {
          if (sql.includes('sqlite_master')) return { cnt: 5 }
          return null
        }
      }
    },
    statements
  }

  return db
}

function bindingsWithDb(db: any) {
  return {
    DB: db,
    COURSE_SEARCH_INDEX: undefined,
    CAPTCHA_SITEVERIFY_URL: '',
    ADMIN_SECRET: '',
    APP_ENV: 'production'
  }
}

for (const path of [
  '/api/settings/runtime-state',
  '/api/settings/show_icu',
  '/api/settings/announcements',
  '/api/settings/maintenance'
]) {
  test(`${path} does not execute DDL or writes`, async () => {
    const db = createReadOnlyDb()
    const response = await app.fetch(
      new Request(`http://localhost${path}`),
      bindingsWithDb(db)
    )

    assert.notEqual(response.status, 500)
    assert.ok(db.statements.length > 0)
    assert.equal(
      db.statements.some((sql) => /^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(sql)),
      false
    )
  })
}
