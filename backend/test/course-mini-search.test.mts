import assert from 'node:assert/strict'
import test from 'node:test'
import MiniSearch from 'minisearch'
import {
  COURSE_SEARCH_INDEX_VERSION,
  executeCourseSearchWithFallback,
  getMiniSearchCourseCandidates,
  installLocalCourseSearchProvider,
  loadCourseSearchIndexJson,
  miniSearchOptions,
  type LoadedCourseSearchIndex,
  type MiniCourseDocument
} from '../src/helpers/course-mini-search'

function document(courseId: number, name: string): MiniCourseDocument {
  return {
    id: `course:${courseId}`,
    courseId,
    code: `C${courseId}`,
    name,
    teacherName: '',
    teacherCode: '',
    department: '测试单位',
    aliases: '',
    semesters: ''
  }
}

function index(showIcu: boolean, documents: MiniCourseDocument[]): LoadedCourseSearchIndex {
  const search = new MiniSearch<MiniCourseDocument>(miniSearchOptions)
  search.addAll(documents)
  return {
    search,
    builtAt: Date.now(),
    showIcu,
    docCount: documents.length,
    source: 'local'
  }
}

const noOptions = {}

test.afterEach(() => {
  installLocalCourseSearchProvider(null)
})

test('no local/KV index returns null without a database argument or build', async () => {
  installLocalCourseSearchProvider(null)
  const result = await getMiniSearchCourseCandidates(false, '数学', noOptions)
  assert.equal(result, null)
})

test('local provider keeps ICU slots independent and is preferred over KV', async () => {
  const calls: boolean[] = []
  installLocalCourseSearchProvider((showIcu) => {
    calls.push(showIcu)
    return index(showIcu, [document(showIcu ? 2 : 1, showIcu ? 'ICU 数学' : '普通数学')])
  })

  const normal = await getMiniSearchCourseCandidates(false, '普通数学', noOptions)
  const icu = await getMiniSearchCourseCandidates(true, 'ICU 数学', noOptions)

  assert.deepEqual(normal?.courseIds, [1])
  assert.equal(normal?.source, 'local')
  assert.deepEqual(icu?.courseIds, [2])
  assert.deepEqual(calls, [false, true])
})

test('KV loader validates version and keeps show_icu entries separate', async () => {
  const entries = new Map<string, string>()
  for (const showIcu of [false, true]) {
    const serialized = new MiniSearch<MiniCourseDocument>(miniSearchOptions)
    serialized.addAll([document(showIcu ? 4 : 3, showIcu ? 'ICU 物理' : '普通物理')])
    entries.set(`${COURSE_SEARCH_INDEX_VERSION}:show_icu:${showIcu ? '1' : '0'}`, JSON.stringify(serialized.toJSON()))
  }
  const kv = {
    getWithMetadata: async (key: string) => ({
      value: entries.get(key) || null,
      metadata: {
        version: COURSE_SEARCH_INDEX_VERSION,
        showIcu: key.endsWith(':1') ? '1' : '0',
        docCount: '1',
        builtAt: String(Date.now())
      }
    })
  } as unknown as KVNamespace

  installLocalCourseSearchProvider(null)
  const normal = await getMiniSearchCourseCandidates(false, '普通物理', noOptions, kv)
  const icu = await getMiniSearchCourseCandidates(true, 'ICU 物理', noOptions, kv)

  assert.deepEqual(normal?.courseIds, [3])
  assert.deepEqual(icu?.courseIds, [4])
  assert.equal(normal?.source, 'kv')
  assert.equal(icu?.source, 'kv')
})

test('candidate overflow returns null so SQL remains the broad-result fallback', async () => {
  installLocalCourseSearchProvider(() => index(false, Array.from({ length: 81 }, (_, i) => document(i + 1, '通识课程'))))
  const result = await getMiniSearchCourseCandidates(false, '通识课程', noOptions)
  assert.equal(result, null)
})

test('provider failures stay visible to the route fallback instead of building from DB', async () => {
  installLocalCourseSearchProvider(() => Promise.reject(new Error('index unavailable')))
  await assert.rejects(
    () => getMiniSearchCourseCandidates(false, '数学', noOptions),
    /index unavailable/
  )
})

test('invalid serialized index is rejected by the explicit loader', () => {
  assert.throws(() => loadCourseSearchIndexJson('{"broken":true}'))
})

test('FTS query failure retries exactly once with the SQL fallback', async () => {
  const calls: boolean[] = []
  const result = await executeCourseSearchWithFallback(true, async (includeFts) => {
    calls.push(includeFts)
    if (includeFts) throw new Error('no such table: course_search')
    return 'like-result'
  })

  assert.deepEqual(calls, [true, false])
  assert.equal(result.value, 'like-result')
  assert.equal(result.fellBack, true)
})
