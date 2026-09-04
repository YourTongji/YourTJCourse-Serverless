import MiniSearch from 'minisearch'
import {
  buildKeywordSearchVariants,
  normalizeLooseSearchText,
  uniqueText
} from './db'

export const COURSE_SEARCH_INDEX_VERSION = 'course-mini-search-v3'
const SEARCH_CANDIDATE_LIMIT = 80
const INDEX_CACHE_TTL_MS = 5 * 60 * 1000

export type MiniCourseDocument = {
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

export type LoadedCourseSearchIndex = {
  search: MiniSearch<MiniCourseDocument>
  builtAt: number
  showIcu: boolean
  docCount: number
  source: 'local' | 'kv'
  generation?: string
}

export type LocalCourseSearchProvider = (
  showIcu: boolean
) => LoadedCourseSearchIndex | null | Promise<LoadedCourseSearchIndex | null>

export type CourseSearchCandidates = {
  courseIds: number[]
  docCount: number
  elapsedMs: number
  source: 'local' | 'kv'
}

// Exported so the offline builder and the Node local-index loader use exactly the
// same MiniSearch schema. The online request path only loads serialized indexes.
export const miniSearchOptions = {
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
      aliases: 2
    }
  }
}

type MiniSearchKvMetadata = {
  version?: string
  showIcu?: string
  docCount?: string
  builtAt?: string
  generation?: string
}

let localProvider: LocalCourseSearchProvider | null = null
const kvCache = new Map<string, LoadedCourseSearchIndex>()
const kvLoadPromises = new Map<string, Promise<LoadedCourseSearchIndex | null>>()

export function installLocalCourseSearchProvider(provider: LocalCourseSearchProvider | null) {
  localProvider = provider
  kvCache.clear()
  kvLoadPromises.clear()
}

export function clearCourseSearchCache() {
  kvCache.clear()
  kvLoadPromises.clear()
}

export async function executeCourseSearchWithFallback<T>(
  hasFts: boolean,
  query: (includeFts: boolean) => Promise<T>
) {
  try {
    return {
      value: await query(hasFts),
      fellBack: false
    }
  } catch (error) {
    if (!hasFts) throw error
    return {
      value: await query(false),
      fellBack: true
    }
  }
}

function buildKvKey(showIcu: boolean) {
  return `${COURSE_SEARCH_INDEX_VERSION}:show_icu:${showIcu ? '1' : '0'}`
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

/** Load one serialized MiniSearch artifact. Invalid data is an explicit error. */
export function loadCourseSearchIndexJson(indexJson: string) {
  return MiniSearch.loadJSON<MiniCourseDocument>(indexJson, miniSearchOptions)
}

export async function loadCourseSearchIndexJsonAsync(indexJson: string) {
  return MiniSearch.loadJSONAsync<MiniCourseDocument>(indexJson, miniSearchOptions)
}

function isFresh(index: LoadedCourseSearchIndex, showIcu: boolean) {
  return index.showIcu === showIcu && Date.now() - index.builtAt < INDEX_CACHE_TTL_MS
}

async function loadMiniSearchFromKv(showIcu: boolean, kv: KVNamespace) {
  const cacheKey = showIcu ? 'show_icu=1' : 'show_icu=0'
  const cached = kvCache.get(cacheKey)
  if (cached && isFresh(cached, showIcu)) return cached

  const pending = kvLoadPromises.get(cacheKey)
  if (pending) return pending

  const loadPromise = (async () => {
    const entry = await kv
      .getWithMetadata<MiniSearchKvMetadata>(buildKvKey(showIcu), { type: 'text', cacheTtl: 60 })
      .catch(() => null)
    const metadata = entry?.metadata
    if (!entry?.value || metadata?.version !== COURSE_SEARCH_INDEX_VERSION || metadata.showIcu !== (showIcu ? '1' : '0')) {
      return null
    }

    try {
      const index: LoadedCourseSearchIndex = {
        search: await loadCourseSearchIndexJsonAsync(entry.value),
        builtAt: Number(metadata.builtAt || Date.now()),
        showIcu,
        docCount: Number(metadata.docCount || 0),
        source: 'kv',
        ...(metadata.generation ? { generation: metadata.generation } : {})
      }
      kvCache.set(cacheKey, index)
      return index
    } catch {
      return null
    }
  })()

  kvLoadPromises.set(cacheKey, loadPromise)
  try {
    return await loadPromise
  } finally {
    if (kvLoadPromises.get(cacheKey) === loadPromise) kvLoadPromises.delete(cacheKey)
  }
}

async function getMiniSearch(showIcu: boolean, kv?: KVNamespace) {
  if (localProvider) {
    const local = await localProvider(showIcu)
    if (local && local.showIcu === showIcu) return local
  }

  if (kv) return loadMiniSearchFromKv(showIcu, kv)
  return null
}

export async function getMiniSearchCourseCandidates(showIcu: boolean, keyword: string, options: {
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
  const index = await getMiniSearch(showIcu, kv)
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
