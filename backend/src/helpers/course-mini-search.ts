import MiniSearch from 'minisearch'
import {
  buildKeywordSearchVariants,
  normalizeLooseSearchText,
  parseSemesterNames,
  uniqueText
} from './db'

const INDEX_TTL_MS = 5 * 60 * 1000
const MAX_INDEX_ROWS = 80_000
const SEARCH_CANDIDATE_LIMIT = 80
const INDEX_VERSION = 'course-mini-search-v2'

type MiniCourseDocument = {
  id: string
  courseId: number
  code: string
  name: string
  teacherName: string
  teacherCode: string
  department: string
  aliases: string
  semesters: string
}

type MiniSearchCache = {
  search: MiniSearch<MiniCourseDocument>
  builtAt: number
  showIcu: boolean
  docCount: number
  source: 'memory' | 'kv' | 'd1'
}

type CourseSearchCandidates = {
  courseIds: number[]
  docCount: number
  elapsedMs: number
  source: 'memory' | 'kv' | 'd1'
}

// The KV value is the raw MiniSearch index JSON; envelope fields live in KV metadata
// so the index string can go straight into MiniSearch.loadJSON without re-parsing.
type MiniSearchKvMetadata = {
  version?: string
  showIcu?: string
  docCount?: string
  builtAt?: string
}

let cache: MiniSearchCache | null = null

function buildKvKey(showIcu: boolean) {
  return `${INDEX_VERSION}:show_icu:${showIcu ? '1' : '0'}`
}

function tokenizeCourseText(text: string) {
  const raw = String(text || '').toLowerCase()
  const tokens = new Set<string>()
  const parts = raw.split(/[\s,，.。:：;；!！?？()[\]（）【】{}<>《》"'`“”‘’、/\\|·\-_—]+/).filter(Boolean)
  for (const part of parts) {
    tokens.add(part)
    const loose = normalizeLooseSearchText(part)
    if (loose && loose !== part) tokens.add(loose)
  }
  return Array.from(tokens)
}

const miniSearchOptions = {
  fields: ['code', 'name', 'teacherName', 'teacherCode', 'department', 'aliases', 'semesters'],
  storeFields: ['courseId', 'code', 'name', 'teacherName', 'teacherCode'],
  tokenize: tokenizeCourseText,
  searchOptions: {
    combineWith: 'AND' as const,
    prefix: true,
    boost: {
      name: 3,
      code: 2,
      teacherName: 3,
      teacherCode: 2,
      aliases: 2,
    }
  }
}

function buildMiniSearchQueries(keyword: string) {
  return uniqueText(
    buildKeywordSearchVariants(keyword).flatMap((variant) => {
      const structured = variant.replace(/[+＋]/g, ' ').replace(/\s*的\s*/g, ' ').replace(/\s+/g, ' ').trim()
      return [variant, structured]
    })
  )
}

function buildSearchText(row: Partial<MiniCourseDocument>) {
  return [
    row.code,
    row.name,
    row.teacherName,
    row.teacherCode,
    row.department,
    row.aliases,
    row.semesters
  ].join(' ')
}

function splitKeywordTerms(keyword: string) {
  return uniqueText(
    buildKeywordSearchVariants(keyword)
      .flatMap((variant) => variant.replace(/[+＋]/g, ' ').replace(/\s*的\s*/g, ' ').split(/\s+/))
      .filter((term) => term.length >= 2)
  )
}

function resultMatchesKeyword(result: any, keyword: string) {
  const terms = splitKeywordTerms(keyword)
  if (terms.length === 0) return true
  const searchable = buildSearchText(result)
  const loose = normalizeLooseSearchText(searchable)
  return terms.every((term) => {
    const normalizedTerm = normalizeLooseSearchText(term)
    return searchable.includes(term) || Boolean(normalizedTerm && loose.includes(normalizedTerm))
  })
}

function canUseMiniSearch(keyword: string, options: {
  departments?: string | null
  courseName?: string
  courseCode?: string
  teacherName?: string
  teacherCode?: string
  campus?: string
  faculty?: string
}) {
  return Boolean(
    keyword.trim() &&
    !options.departments &&
    !options.courseName &&
    !options.courseCode &&
    !options.teacherName &&
    !options.teacherCode &&
    !options.campus &&
    !options.faculty
  )
}

async function loadMiniSearchDocuments(db: D1Database, showIcu: boolean) {
  const documents: MiniCourseDocument[] = []
  const semesterMap = new Map<number, string>()
  const aliasMap = new Map<number, string[]>()

  const semesterRows = await db
    .prepare('SELECT course_id, semester_names FROM course_semesters')
    .all<{ course_id: number; semester_names: string }>()
  for (const row of semesterRows.results || []) {
    semesterMap.set(Number((row as any).course_id), parseSemesterNames((row as any).semester_names).join(' '))
  }

  const aliasRows = await db
    .prepare("SELECT course_id, alias FROM course_aliases WHERE system = 'onesystem'")
    .all<{ course_id: number; alias: string }>()
  for (const row of aliasRows.results || []) {
    const courseId = Number((row as any).course_id)
    if (!aliasMap.has(courseId)) aliasMap.set(courseId, [])
    aliasMap.get(courseId)!.push(String((row as any).alias || '').trim())
  }

  let baseWhere = "WHERE NOT (c.is_legacy = 1 AND c.code LIKE '%AUTO%')"
  if (!showIcu) baseWhere += ' AND (c.is_icu = 0 OR c.is_icu IS NULL)'

  const baseRows = await db
    .prepare(
      `SELECT c.id, c.code, c.name, c.department, c.search_keywords, t.name AS teacher_name, t.tid AS teacher_tid
       FROM courses c
       LEFT JOIN teachers t ON t.id = c.teacher_id
       ${baseWhere}
       LIMIT ?`
    )
    .bind(MAX_INDEX_ROWS)
    .all<any>()

  for (const row of baseRows.results || []) {
    const courseId = Number((row as any).id)
    const aliases = uniqueText(aliasMap.get(courseId) || [])

    const baseDoc = {
      id: `course:${courseId}`,
      courseId,
      code: String((row as any).code || ''),
      name: String((row as any).name || ''),
      teacherName: String((row as any).teacher_name || ''),
      teacherCode: String((row as any).teacher_tid || ''),
      department: String((row as any).department || ''),
      aliases: aliases.join(' '),
      semesters: semesterMap.get(courseId) || ''
    }
    documents.push(baseDoc)
  }

  return documents
}

function loadMiniSearchFromIndexJson(indexJson: string): MiniSearch<MiniCourseDocument> | null {
  try {
    return MiniSearch.loadJSON<MiniCourseDocument>(indexJson, miniSearchOptions)
  } catch {
    return null
  }
}

async function getMiniSearch(db: D1Database, showIcu: boolean, kv?: KVNamespace) {
  const now = Date.now()
  if (cache && cache.showIcu === showIcu && now - cache.builtAt < INDEX_TTL_MS) return cache

  if (kv) {
    const entry = await kv
      .getWithMetadata<MiniSearchKvMetadata>(buildKvKey(showIcu), { type: 'text', cacheTtl: 60 })
      .catch(() => null)
    const metadata = entry?.metadata
    if (entry?.value && metadata?.version === INDEX_VERSION && metadata.showIcu === (showIcu ? '1' : '0')) {
      const search = loadMiniSearchFromIndexJson(entry.value)
      if (search) {
        cache = {
          search,
          builtAt: now,
          showIcu,
          docCount: Number(metadata.docCount || 0),
          source: 'kv'
        }
        return cache
      }
    }
  }

  const documents = await loadMiniSearchDocuments(db, showIcu)
  const search = new MiniSearch<MiniCourseDocument>(miniSearchOptions)
  search.addAll(documents)
  cache = {
    search,
    builtAt: now,
    showIcu,
    docCount: documents.length,
    source: 'd1'
  }
  return cache
}

export async function getMiniSearchCourseCandidates(db: D1Database, showIcu: boolean, keyword: string, options: {
  departments?: string | null
  courseName?: string
  courseCode?: string
  teacherName?: string
  teacherCode?: string
  campus?: string
  faculty?: string
}, kv?: KVNamespace): Promise<CourseSearchCandidates | null> {
  if (!canUseMiniSearch(keyword, options)) return null

  const startedAt = Date.now()
  const index = await getMiniSearch(db, showIcu, kv)
  if (!index) return null
  const queries = buildMiniSearchQueries(keyword)
  const results = queries.flatMap((query) => index.search.search(query, { combineWith: 'AND', prefix: true }))
  const sorted = results
    .filter((result) => resultMatchesKeyword(result, keyword))
    .sort((left, right) => right.score - left.score)

  const courseIds: number[] = []
  const seen = new Set<number>()
  for (const result of sorted) {
    const courseId = Number((result as any).courseId)
    if (!Number.isFinite(courseId) || seen.has(courseId)) continue
    seen.add(courseId)
    courseIds.push(courseId)
    if (courseIds.length > SEARCH_CANDIDATE_LIMIT) return null
  }

  if (courseIds.length === 0) return null

  return {
    courseIds,
    docCount: index.docCount,
    elapsedMs: Date.now() - startedAt,
    source: index.source
  }
}
