import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import MiniSearch from 'minisearch'

const INDEX_VERSION = 'course-mini-search-v2'
const KV_VALUE_LIMIT_BYTES = 25 * 1024 * 1024
const DEFAULT_PAGE_SIZE = 5000

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (!item.startsWith('--')) continue
    const eq = item.indexOf('=')
    if (eq !== -1) {
      out[item.slice(2, eq)] = item.slice(eq + 1)
    } else {
      const key = item.slice(2)
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const database = String(args.database || 'jcourse-db')
const pageSize = Math.max(100, Number(args.pageSize || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
const upload = String(args.upload || 'true') !== 'false'
const env = args.env ? String(args.env) : ''
const showIcuTargets = (() => {
  const raw = String(args.showIcu || 'both').toLowerCase()
  if (raw === 'both') return [false, true]
  return ['1', 'true', 'yes'].includes(raw) ? [true] : [false]
})()

function runWrangler(extraArgs, options = {}) {
  const result = spawnSync('npx', ['wrangler', ...extraArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    ...options
  })
  if (result.status !== 0) {
    throw new Error([result.stderr, result.stdout].filter(Boolean).join('\n').slice(0, 4000))
  }
  return result.stdout
}

function d1(sql) {
  const command = ['d1', 'execute', database, '--remote', '--json', '--command', sql]
  if (env) command.splice(3, 0, '--env', env)
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const stdout = runWrangler(command)
      const parsed = JSON.parse(stdout)
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      if (!first?.success) throw new Error(`D1 query failed: ${stdout.slice(0, 1000)}`)
      return first.results || []
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        const waitMs = 1000 * attempt
        process.stderr.write(`[d1] retry ${attempt}/3 after ${waitMs}ms\n`)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs)
      }
    }
  }
  throw lastError
}

function paged(sql, label) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const page = d1(`${sql} LIMIT ${pageSize} OFFSET ${offset}`)
    rows.push(...page)
    process.stderr.write(`[${label}] ${rows.length} rows\r`)
    if (page.length < pageSize) break
  }
  process.stderr.write(`[${label}] ${rows.length} rows\n`)
  return rows
}

function uniqueText(values) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function normalizeSearchText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeLooseSearchText(value) {
  return normalizeSearchText(value)
    .replace(/[\s()（）[\]【】{}<>《》"'`“”‘’、,，.。:：;；!！?？\-—_\\/·]/g, '')
    .toLowerCase()
}

function parseSemesterNames(value) {
  return String(value || '')
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean)
}

function tokenizeCourseText(text) {
  const raw = String(text || '').toLowerCase()
  const tokens = new Set()
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
    combineWith: 'AND',
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

function buildSearchText(row) {
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

function loadSourceData() {
  const courseRows = paged(
    `SELECT c.id, c.code, c.name, c.department, c.is_icu, c.is_legacy, t.name AS teacher_name, t.tid AS teacher_tid
     FROM courses c
     LEFT JOIN teachers t ON t.id = c.teacher_id
     WHERE NOT (c.is_legacy = 1 AND c.code LIKE '%AUTO%')
     ORDER BY c.id`,
    'courses'
  )
  const aliasRows = paged(
    "SELECT course_id, alias FROM course_aliases WHERE system = 'onesystem' ORDER BY course_id",
    'aliases'
  )
  const semesterRows = paged(
    'SELECT course_id, semester_names FROM course_semesters ORDER BY course_id',
    'semesters'
  )
  const pkRows = paged(
    `SELECT
       cd.courseCode,
       cd.code,
       cd.newCourseCode,
       cd.newCode,
       cd.courseName,
       cd.name AS teachingClassName,
       t.teacherCode,
       t.teacherName
     FROM coursedetail cd
     LEFT JOIN teacher t ON t.teachingClassId = cd.id
     ORDER BY cd.courseCode, cd.courseName, t.teacherName`,
    'pk'
  )
  return { courseRows, aliasRows, semesterRows, pkRows }
}

function buildDocuments(source, showIcu) {
  const documents = []
  const semesterMap = new Map()
  const aliasMap = new Map()
  const codeToCourseIds = new Map()

  for (const row of source.semesterRows) {
    semesterMap.set(Number(row.course_id), parseSemesterNames(row.semester_names).join(' '))
  }

  for (const row of source.aliasRows) {
    const courseId = Number(row.course_id)
    if (!aliasMap.has(courseId)) aliasMap.set(courseId, [])
    aliasMap.get(courseId).push(String(row.alias || '').trim())
  }

  const filteredCourses = source.courseRows.filter((row) => showIcu || Number(row.is_icu || 0) === 0)
  for (const row of filteredCourses) {
    const courseId = Number(row.id)
    const aliases = uniqueText(aliasMap.get(courseId) || [])
    const codes = uniqueText([row.code, ...aliases])
    for (const code of codes) {
      if (!codeToCourseIds.has(code)) codeToCourseIds.set(code, new Set())
      codeToCourseIds.get(code).add(courseId)
    }

    const baseDoc = {
      id: `course:${courseId}`,
      courseId,
      code: String(row.code || ''),
      name: String(row.name || ''),
      teacherName: String(row.teacher_name || ''),
      teacherCode: String(row.teacher_tid || ''),
      department: String(row.department || ''),
      aliases: aliases.join(' '),
      semesters: semesterMap.get(courseId) || ''
    }
    documents.push(baseDoc)
  }

  const pkDocMap = new Map()
  for (const row of source.pkRows) {
    const teacherName = String(row.teacherName || '').trim()
    const teacherCode = String(row.teacherCode || '').trim()
    if (!teacherName && !teacherCode) continue
    const rowCodes = uniqueText([row.courseCode, row.code, row.newCourseCode, row.newCode])
    const courseIds = new Set()
    for (const code of rowCodes) {
      for (const courseId of codeToCourseIds.get(code) || []) courseIds.add(courseId)
    }
    for (const courseId of courseIds) {
      const name = uniqueText([row.courseName, row.teachingClassName]).join(' ')
      const key = `${courseId}|${rowCodes.join(' ')}|${name}|${teacherName}|${teacherCode}`
      if (!pkDocMap.has(key)) {
        pkDocMap.set(key, {
          id: `pk:${courseId}:${pkDocMap.size + 1}`,
          courseId,
          code: rowCodes.join(' '),
          name,
          teacherName,
          teacherCode,
          department: '',
          aliases: '',
          semesters: ''
        })
      }
    }
  }

  documents.push(...pkDocMap.values())

  return documents
}

// The KV value is the raw MiniSearch index JSON so the worker can feed it to
// MiniSearch.loadJSON without an intermediate parse; envelope fields go in KV metadata.
function buildIndexJson(documents) {
  const search = new MiniSearch(miniSearchOptions)
  search.addAll(documents)
  return JSON.stringify(search.toJSON())
}

function putKv(key, filePath, bytes, docCount, showIcu) {
  const command = ['kv', 'key', 'put', key, '--path', filePath, '--binding', 'COURSE_SEARCH_INDEX', '--remote']
  if (env) command.push('--env', env)
  command.push('--metadata', JSON.stringify({
    version: INDEX_VERSION,
    showIcu: showIcu ? '1' : '0',
    docCount: String(docCount),
    builtAt: String(Date.now()),
    bytes: String(bytes)
  }))
  runWrangler(command, { stdio: 'pipe' })
}

const startedAt = Date.now()
const source = loadSourceData()
const generatedDir = path.join(process.cwd(), 'generated')
fs.mkdirSync(generatedDir, { recursive: true })

const summaries = []
for (const showIcu of showIcuTargets) {
  const documents = buildDocuments(source, showIcu)
  const serialized = buildIndexJson(documents)
  const bytes = Buffer.byteLength(serialized)
  const key = `${INDEX_VERSION}:show_icu:${showIcu ? '1' : '0'}`
  const outputPath = path.join(generatedDir, `${key.replace(/[:]/g, '-')}.json`)
  fs.writeFileSync(outputPath, serialized)

  if (bytes > KV_VALUE_LIMIT_BYTES) {
    throw new Error(`Index ${key} is ${bytes} bytes, larger than KV single value limit ${KV_VALUE_LIMIT_BYTES}`)
  }

  if (upload) putKv(key, outputPath, bytes, documents.length, showIcu)
  summaries.push({ key, showIcu, docCount: documents.length, bytes, uploaded: upload, outputPath })
}

console.log(JSON.stringify({
  success: true,
  elapsedMs: Date.now() - startedAt,
  indexes: summaries,
  tempDir: os.tmpdir()
}, null, 2))
