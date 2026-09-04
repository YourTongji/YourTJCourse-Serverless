import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  AUX_SCHEMA_VERSION,
  buildCourseAuxiliaryRecords,
  ensureDbInitialized,
  materializePkCoursesToReviewSite
} from './helpers/db'
import { buildCourseMiniSearchJson, loadCourseSearchSource } from './helpers/course-search-build'
import { COURSE_SEARCH_INDEX_VERSION, loadCourseSearchIndexJsonAsync } from './helpers/course-mini-search'
import { D1CompatDatabase } from './runtime/db'

type IndexManifest = {
  schemaVersion: 1
  indexVersion: string
  generation: string
  generatedAt: string
  indexes: Record<'showIcu0' | 'showIcu1', {
    file: string
    docCount: number
    bytes: number
    sha256: string
  }>
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (!item?.startsWith('--')) continue
    const key = item.slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      out[key] = 'true'
      continue
    }
    out[key] = value
    i += 1
  }
  return out
}

function assertGeneration(value: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error('generation must match /^[A-Za-z0-9._-]+$/')
  }
}

function sha256Text(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

async function assertMissing(filePath: string) {
  try {
    await fs.access(filePath)
    return false
  } catch (error: any) {
    if (error?.code === 'ENOENT') return true
    throw error
  }
}

async function withMaintenanceLock<T>(lockPath: string, action: () => Promise<T>) {
  // The sync workflow owns the shared flock for the complete DB + artifact
  // transaction and explicitly delegates lock ownership to this process.
  // Do not try to create or remove the same path in that mode.
  if (process.env.MAINTENANCE_LOCK_ALREADY_HELD === '1') return action()

  await fs.mkdir(path.dirname(lockPath), { recursive: true })
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null
  try {
    handle = await fs.open(lockPath, 'wx')
    await handle.writeFile(`${process.pid}\n`)
    return await action()
  } catch (error: any) {
    if (error?.code === 'EEXIST') {
      throw new Error('maintenance lock is already held')
    }
    throw error
  } finally {
    await handle?.close().catch(() => {})
    if (handle) await fs.rm(lockPath, { force: true }).catch(() => {})
  }
}

async function publishSearchGeneration(db: D1CompatDatabase, generation: string, indexRoot: string) {
  assertGeneration(generation)
  const generationsDir = path.join(indexRoot, 'generations')
  const tmpDir = path.join(generationsDir, `.${generation}.tmp-${process.pid}`)
  const finalDir = path.join(generationsDir, generation)
  const currentLink = path.join(indexRoot, 'current')
  const nextLink = path.join(indexRoot, 'current.new')

  if (!(await assertMissing(finalDir))) throw new Error(`generation already exists: ${generation}`)
  await fs.mkdir(generationsDir, { recursive: true })
  await fs.rm(tmpDir, { recursive: true, force: true })
  await fs.mkdir(tmpDir, { recursive: true })

  try {
    const source = await loadCourseSearchSource(db as unknown as D1Database)
    const manifest: IndexManifest = {
      schemaVersion: 1,
      indexVersion: COURSE_SEARCH_INDEX_VERSION,
      generation,
      generatedAt: new Date().toISOString(),
      indexes: {} as IndexManifest['indexes']
    }

    for (const showIcu of [false, true]) {
      const { json, docCount } = await buildCourseMiniSearchJson(source, showIcu)
      // Validate the exact artifact before it can become visible to the Node loader.
      await loadCourseSearchIndexJsonAsync(json)
      const file = `show-icu-${showIcu ? '1' : '0'}.json`
      await fs.writeFile(path.join(tmpDir, file), json, 'utf8')
      manifest.indexes[showIcu ? 'showIcu1' : 'showIcu0'] = {
        file,
        docCount,
        bytes: Buffer.byteLength(json),
        sha256: sha256Text(json)
      }
      if (!showIcu && process.env.COURSE_SEARCH_TEST_FAIL_AFTER_FIRST_INDEX === '1') {
        throw new Error('test failure after first search index')
      }
    }

    await fs.writeFile(path.join(tmpDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await fs.rename(tmpDir, finalDir)

    // Both links live under the same index root, so replacing current is atomic.
    await fs.rm(nextLink, { force: true })
    await fs.symlink(path.relative(indexRoot, finalDir), nextLink, 'dir')
    await fs.rename(nextLink, currentLink)
    return manifest
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function setSetting(db: D1CompatDatabase, key: string, value: string) {
  await db
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind(key, value)
    .run()
}

async function rebuildAux(db: D1CompatDatabase) {
  await ensureDbInitialized(db as unknown as D1Database)
  await materializePkCoursesToReviewSite(db as unknown as D1Database)

  // Build all derived rows before the write transaction. The local libSQL
  // batch is atomic, so a failed FTS/semester insert cannot leave a half-new
  // auxiliary dataset visible to the online process.
  const records = await buildCourseAuxiliaryRecords(db as unknown as D1Database)
  const statements = [
    db.prepare('DELETE FROM course_semesters'),
    db.prepare('DELETE FROM course_search')
  ]
  for (let start = 0; start < records.length; start += 40) {
    const part = records.slice(start, start + 40)
    const semesterValues: any[] = []
    const semesterPlaceholders = part.map(() => '(?, ?)').join(', ')
    for (const record of part) semesterValues.push(record.courseId, record.semesterNames)
    statements.push(
      db.prepare(
        `INSERT OR REPLACE INTO course_semesters (course_id, semester_names) VALUES ${semesterPlaceholders}`
      ).bind(...semesterValues)
    )

    const searchValues: any[] = []
    const searchPlaceholders = part.map(() => '(?, ?)').join(', ')
    for (const record of part) searchValues.push(record.courseId, record.searchDoc)
    statements.push(
      db.prepare(
        `INSERT INTO course_search (course_id, search_doc) VALUES ${searchPlaceholders}`
      ).bind(...searchValues)
    )
  }
  await db.batch(statements)
  await setSetting(db, 'aux_schema_version', AUX_SCHEMA_VERSION)
}

async function runCommand(command: string, args: Record<string, string>) {
  const db = new D1CompatDatabase(process.env.DATABASE_URL || 'file:/data/jcourse.db')
  await db.init()
  const generation = String(args.generation || '').trim()
  const indexRoot = String(args['index-root'] || process.env.COURSE_SEARCH_INDEX_ROOT || '/data/search-index').trim()

  if (command === 'rebuild-aux') {
    await rebuildAux(db)
    return { command }
  }

  if (command !== 'build-search-index' && command !== 'post-sync') {
    throw new Error(`unknown maintenance command: ${command}`)
  }
  if (!generation) throw new Error('--generation is required')

  if (command === 'post-sync') {
    // Moving required generation first makes any currently loaded old index stale.
    await setSetting(db, 'course_search_required_generation', generation)
    await rebuildAux(db)
  }

  const manifest = await publishSearchGeneration(db, generation, indexRoot)
  await setSetting(db, 'course_search_active_generation', generation)
  return { command, generation, manifest }
}

async function main() {
  const [command] = process.argv.slice(2)
  const args = parseArgs(process.argv.slice(3))
  const lockPath = String(args['lock-file'] || process.env.COURSE_MAINTENANCE_LOCK || '/data/yourtjcourse-maintenance.lock').trim()
  const result = await withMaintenanceLock(lockPath, () => runCommand(String(command || ''), args))
  console.log(JSON.stringify({ event: 'maintenance_completed', ...result }))
}

main().catch((error: any) => {
  console.error(JSON.stringify({
    event: 'maintenance_failed',
    error: error?.message || String(error)
  }))
  process.exit(1)
})
