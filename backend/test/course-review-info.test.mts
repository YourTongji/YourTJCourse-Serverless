import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeReviewInfoBatch,
  loadCourseReviewStats,
  getCourseReviewStatsCached,
  invalidateCourseReviewInfoCache,
  REVIEW_INFO_BATCH_MAX_ITEMS,
} from '../src/helpers/course-review-info.ts'

// ---------- 测试用最小 D1 mock ----------
// 按 SQL 特征路由返回值：
//  - 聚合查询（FROM reviews）依次返回 reviewStats 中的结果
//  - 课程解析查询（FROM courses ...）返回 courseFirst / courseAll
//  - 其他查询返回空
// totalCalls 记录全部查询次数，用于断言"缓存命中后不再产生任何查询"。

type FakeDbOptions = {
  reviewStats?: Array<{ total_count: number; avg_rating: number }>
  courseFirst?: Record<string, unknown> | null
  courseAll?: Array<Record<string, unknown>>
}

function createFakeDb(options: FakeDbOptions = {}) {
  const { reviewStats = [], courseFirst = null, courseAll = [] } = options
  let totalCalls = 0
  let reviewCalls = 0
  const db = {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          totalCalls++
          const isReviewStats = /FROM reviews/.test(sql)
          const isCourseLookup = /FROM courses/.test(sql)
          if (isReviewStats) {
            const result = reviewStats[reviewCalls] ?? { total_count: 0, avg_rating: 0 }
            reviewCalls++
            return {
              first: async () => result,
              all: async () => ({ results: [] }),
            }
          }
          if (isCourseLookup) {
            return {
              first: async () => courseFirst,
              all: async () => ({ results: courseAll }),
            }
          }
          return {
            first: async () => null,
            all: async () => ({ results: [] }),
          }
        },
      }
    },
  }
  return {
    db: db as unknown as D1Database,
    getTotalCalls: () => totalCalls,
    getReviewCalls: () => reviewCalls,
  }
}

// ---------- normalizeReviewInfoBatch ----------

test('normalizes items, trims fields, and dedupes identical queries', () => {
  const parsed = normalizeReviewInfoBatch({
    items: [
      { code: ' 320001 ', teacherCode: ' 10094 ', teacherName: '李彬' },
      { courseCode: '320001', teacherCode: '10094', teacherName: '李彬' },
      { code: '320001' },
    ],
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.items, [
    { code: '320001', teacherCode: '10094', teacherName: '李彬' },
    { code: '320001', teacherCode: '', teacherName: '' },
  ])
})

test('rejects non-object bodies and missing/oversized items arrays', () => {
  assert.deepEqual(normalizeReviewInfoBatch(null), { ok: false, error: 'Request body must be a JSON object' })
  assert.deepEqual(normalizeReviewInfoBatch([1, 2]), { ok: false, error: 'Request body must be a JSON object' })
  assert.deepEqual(normalizeReviewInfoBatch({}), { ok: false, error: 'Missing items array' })

  const oversized = normalizeReviewInfoBatch({
    items: Array.from({ length: REVIEW_INFO_BATCH_MAX_ITEMS + 1 }, () => ({ code: 'x' })),
  })
  assert.equal(oversized.ok, false)
})

test('reports the index of the first invalid item', () => {
  const parsed = normalizeReviewInfoBatch({ items: [{ code: 'a' }, { teacherCode: '1' }, { code: 'b' }] })
  assert.deepEqual(parsed, { ok: false, error: 'Invalid item at index 1: missing code' })
})

// ---------- loadCourseReviewStats ----------

test('aggregates review stats across chunked course ids with is_icu filter', async () => {
  // D1_SAFE_BATCH_SIZE 为 40：41 个 id 会拆成两个分块，分别返回不同统计，
  // 验证跨分块的加权聚合（count 相加、avg 按 count 加权）。
  const ids = Array.from({ length: 41 }, (_, i) => i + 1)
  const { db, getReviewCalls } = createFakeDb({
    reviewStats: [
      { total_count: 3, avg_rating: 4 },
      { total_count: 2, avg_rating: 2.5 },
    ],
  })

  const stats = await loadCourseReviewStats(db, ids, false)

  assert.deepEqual(stats, { review_count: 5, review_avg: (3 * 4 + 2 * 2.5) / 5 })
  assert.equal(getReviewCalls(), 2)
})

test('skips non-positive ids and returns zeros for an empty set', async () => {
  const { db, getTotalCalls } = createFakeDb()
  const stats = await loadCourseReviewStats(db, [0, -1, Number.NaN], true)
  assert.deepEqual(stats, { review_count: 0, review_avg: 0 })
  assert.equal(getTotalCalls(), 0)
})

// ---------- 缓存行为 ----------

const FOUND_QUERY = { code: '320001', teacherCode: '', teacherName: '' }

function foundCourseFixture() {
  return {
    courseFirst: { id: 1, code: '320001', name: '高等数学', teacher_id: null, is_icu: 0 },
    courseAll: [{ id: 1 }],
  }
}

test('caches stats per (code, teacher, showIcu) and serves subsequent calls without new queries', async () => {
  invalidateCourseReviewInfoCache()
  const { db, getTotalCalls, getReviewCalls } = createFakeDb({
    ...foundCourseFixture(),
    reviewStats: [{ total_count: 7, avg_rating: 3.5 }],
  })

  const first = await getCourseReviewStatsCached(db, FOUND_QUERY, false)
  const callsAfterFirst = getTotalCalls()

  assert.deepEqual(first, { found: true, review_count: 7, review_avg: 3.5 })
  assert.equal(getReviewCalls(), 1)

  const second = await getCourseReviewStatsCached(db, FOUND_QUERY, false)
  assert.deepEqual(second, first)
  // 缓存命中：总查询数不再增长
  assert.equal(getTotalCalls(), callsAfterFirst)

  // showIcu 不同的 key 独立缓存，会产生新的聚合查询
  const showIcuResult = await getCourseReviewStatsCached(db, FOUND_QUERY, true)
  assert.equal(showIcuResult.found, true)
  assert.equal(getReviewCalls(), 2)
})

test('invalidation clears cached entries so the next call re-queries', async () => {
  invalidateCourseReviewInfoCache()
  const { db, getTotalCalls, getReviewCalls } = createFakeDb({
    ...foundCourseFixture(),
    reviewStats: [
      { total_count: 1, avg_rating: 5 },
      { total_count: 2, avg_rating: 4 },
    ],
  })

  await getCourseReviewStatsCached(db, FOUND_QUERY, false)
  const callsAfterFirst = getTotalCalls()
  invalidateCourseReviewInfoCache()
  const refreshed = await getCourseReviewStatsCached(db, FOUND_QUERY, false)

  assert.deepEqual(refreshed, { found: true, review_count: 2, review_avg: 4 })
  assert.ok(getTotalCalls() > callsAfterFirst)
  assert.equal(getReviewCalls(), 2)
})

test('caches not-found results and reports found=false with zeroed stats', async () => {
  invalidateCourseReviewInfoCache()
  const { db, getTotalCalls } = createFakeDb({ courseFirst: null })

  const query = { code: 'missing', teacherCode: '', teacherName: '' }
  const first = await getCourseReviewStatsCached(db, query, false)
  const callsAfterFirst = getTotalCalls()
  const second = await getCourseReviewStatsCached(db, query, false)

  assert.deepEqual(first, { found: false, review_count: 0, review_avg: 0 })
  assert.deepEqual(second, first)
  // 负缓存命中：解析查询也不会重复发出
  assert.equal(getTotalCalls(), callsAfterFirst)
})

test('concurrent misses for the same key share a single in-flight fill (no stampede)', async () => {
  invalidateCourseReviewInfoCache()
  const { db, getReviewCalls } = createFakeDb({
    ...foundCourseFixture(),
    reviewStats: [{ total_count: 3, avg_rating: 4 }],
  })

  // 同 key 并发 5 次：只允许一次解析 + 一次聚合
  const [a, b, c, d, e] = await Promise.all([
    getCourseReviewStatsCached(db, FOUND_QUERY, false),
    getCourseReviewStatsCached(db, FOUND_QUERY, false),
    getCourseReviewStatsCached(db, FOUND_QUERY, false),
    getCourseReviewStatsCached(db, FOUND_QUERY, false),
    getCourseReviewStatsCached(db, FOUND_QUERY, false),
  ])

  assert.deepEqual(a, { found: true, review_count: 3, review_avg: 4 })
  assert.deepEqual(b, a)
  assert.deepEqual(c, a)
  assert.deepEqual(d, a)
  assert.deepEqual(e, a)
  assert.equal(getReviewCalls(), 1)
})

test('invalidation during an in-flight fill does not repopulate the cache afterwards', async () => {
  invalidateCourseReviewInfoCache()
  const gate = { calls: 0, resolve: (v: { total_count: number; avg_rating: number }) => {} }
  const { db } = createFakeDbWithGate({
    courseFirst: { id: 1, code: '320001', name: '高等数学', teacher_id: null, is_icu: 0 },
    courseAll: [{ id: 1 }],
    onReviewQuery: (resolve) => {
      gate.resolve = resolve
      gate.calls++
    },
  })

  // 发起请求，等它真正走到被闸住的聚合查询（macrotask 让路，
  // 确保闸门 mock 的 resolve 已挂上，而不是还在同步解析链里）
  const pending = getCourseReviewStatsCached(db, FOUND_QUERY, false)
  for (let i = 0; i < 10 && !gate.calls; i++) {
    await new Promise((r) => setTimeout(r, 1))
  }
  assert.ok(gate.calls > 0, 'gate was never reached')

  // fill 挂起期间失效，再放行
  invalidateCourseReviewInfoCache()
  gate.resolve({ total_count: 9, avg_rating: 1 })
  const value = await pending

  assert.deepEqual(value, { found: true, review_count: 9, review_avg: 1 })

  // 失效后新查询应重新查库（in-flight 结束时不把旧结果写回缓存）：
  // 若旧结果被写回，这里会直接命中缓存返回 {9, 1} 而不发出聚合查询。
  const { db: db2, getReviewCalls: rc2 } = createFakeDb({
    ...foundCourseFixture(),
    reviewStats: [{ total_count: 2, avg_rating: 3 }],
  })
  const next = await getCourseReviewStatsCached(db2, FOUND_QUERY, false)
  assert.deepEqual(next, { found: true, review_count: 2, review_avg: 3 })
  assert.equal(rc2(), 1)
})

test('in-flight fill that rejects is removed from the map so retries get a fresh fill', async () => {
  invalidateCourseReviewInfoCache()
  let callCount = 0
  const db = {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          if (/FROM reviews/.test(sql)) {
            callCount++
            // 第一次聚合抛瞬时错误，第二次成功
            return {
              first: async () => {
                if (callCount === 1) throw new Error('transient D1 error')
                return { total_count: 5, avg_rating: 4 }
              },
              all: async () => ({ results: [] }),
            }
          }
          return {
            first: async () => ({ id: 1, code: 'X', name: 'N', teacher_id: null, is_icu: 0 }),
            all: async () => ({ results: [{ id: 1 }] }),
          }
        },
      }
    },
  }

  await assert.rejects(
    () => getCourseReviewStatsCached(db as unknown as D1Database, FOUND_QUERY, false),
    /transient D1 error/
  )

  // 失败的 fill 不缓存错误，也不留在 inFlight——重试走全新填充并成功
  const retried = await getCourseReviewStatsCached(db as unknown as D1Database, FOUND_QUERY, false)
  assert.deepEqual(retried, { found: true, review_count: 5, review_avg: 4 })
})
function createFakeDbWithGate(options: FakeDbOptions & {
  onReviewQuery?: (resolve: (v: { total_count: number; avg_rating: number }) => void) => void
}) {
  const { reviewStats = [], courseFirst = null, courseAll = [], onReviewQuery } = options
  let totalCalls = 0
  let reviewCalls = 0
  const db = {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          totalCalls++
          const isReviewStats = /FROM reviews/.test(sql)
          const isCourseLookup = /FROM courses/.test(sql)
          if (isReviewStats) {
            if (onReviewQuery && reviewCalls === 0) {
              reviewCalls++
              let gateResolve: (v: { total_count: number; avg_rating: number }) => void = () => {}
              const gated = new Promise<{ total_count: number; avg_rating: number }>((resolve) => {
                gateResolve = resolve
              })
              onReviewQuery(gateResolve)
              return {
                first: () => gated,
                all: async () => ({ results: [] }),
              }
            }
            const result = reviewStats[reviewCalls] ?? { total_count: 0, avg_rating: 0 }
            reviewCalls++
            return {
              first: async () => result,
              all: async () => ({ results: [] }),
            }
          }
          if (isCourseLookup) {
            return {
              first: async () => courseFirst,
              all: async () => ({ results: courseAll }),
            }
          }
          return {
            first: async () => null,
            all: async () => ({ results: [] }),
          }
        },
      }
    },
  }
  return {
    db: db as unknown as D1Database,
    getTotalCalls: () => totalCalls,
    getReviewCalls: () => reviewCalls,
  }
}
