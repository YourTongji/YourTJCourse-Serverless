#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NO_FTS_OBJECT_COUNT_SQL,
  quoteIdent,
  quoteSqlString,
  wranglerD1List,
  wranglerD1Query
} from './d1-backup-utils.mjs'

const API_BASE = 'https://api.cloudflare.com/client/v4'
const DEFAULT_SOURCE = 'jcourse-db'
const DEFAULT_TARGET = 'jcourse-db-backup'
const STATE_TABLE = 'backup_refresh_state'
const MAX_BIND_PARAMS = 90
const DRY_RUN_COUNT_CHUNK_SIZE = 4
const ROWID_COPY_KEY = '_rowid_'
const TABLE_ORDER = [
  'settings',
  'categories',
  'teachers',
  'courses',
  'course_aliases',
  'course_semesters',
  'reviews',
  'review_likes',
  'review_reports',
  'ai_summaries',
  'calendar',
  'language',
  'coursenature',
  'coursenature_by_calendar',
  'assessment',
  'campus',
  'faculty',
  'major',
  'coursedetail',
  'teacher',
  'teacher_timeslots',
  'majorandcourse',
  'fetchlog',
  'meta_fields',
  'meta_mappings'
]
const TABLE_ORDER_INDEX = new Map(TABLE_ORDER.map((name, index) => [name, index]))

function parseArgs(argv) {
  const args = {
    source: process.env.D1_PRIMARY_DATABASE_NAME || DEFAULT_SOURCE,
    target: process.env.D1_BACKUP_DATABASE_NAME || DEFAULT_TARGET,
    batchSize: Number(process.env.D1_BACKUP_REFRESH_BATCH_SIZE || 500),
    dryRun: false,
    allowTarget: false,
    skipMaterialize: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--source') args.source = requireValue(argv, ++i, arg)
    else if (arg === '--target') args.target = requireValue(argv, ++i, arg)
    else if (arg === '--batch-size') args.batchSize = Number(requireValue(argv, ++i, arg))
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--allow-target') args.allowTarget = true
    else if (arg === '--skip-materialize') args.skipMaterialize = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!Number.isInteger(args.batchSize) || args.batchSize <= 0) {
    throw new Error('--batch-size must be a positive integer')
  }

  return args
}

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function printHelp() {
  console.log(`Usage: node scripts/refresh-no-fts-backup.mjs [options]

Options:
  --source <name>       Primary D1 database name (default: ${DEFAULT_SOURCE})
  --target <name>       Backup D1 database name (default: ${DEFAULT_TARGET})
  --batch-size <n>      Source read page size (default: 500)
  --dry-run             Print planned tables without mutating backup
  --allow-target        Allow target database names other than ${DEFAULT_TARGET}
  --skip-materialize    Skip no-FTS course auxiliary refresh
`)
}

function isInternalName(name) {
  const lower = String(name || '').toLowerCase()
  return lower.startsWith('sqlite_') || lower.startsWith('_cf_') || lower === 'd1_migrations' || lower === STATE_TABLE
}

function isFtsName(name) {
  return /^course_search(?:$|_)/i.test(String(name || ''))
}

function isVirtualSql(sql) {
  return /create\s+virtual\s+table|using\s+fts5/i.test(String(sql || ''))
}

function shouldExcludeObject(row) {
  return isInternalName(row.name) || isInternalName(row.tbl_name) || isFtsName(row.name) || isFtsName(row.tbl_name) || isVirtualSql(row.sql)
}

function tableSortValue(name) {
  const normalized = String(name || '').toLowerCase()
  return TABLE_ORDER_INDEX.has(normalized) ? TABLE_ORDER_INDEX.get(normalized) : 1000
}

function sortTablesForCopy(left, right) {
  const leftValue = tableSortValue(left.name)
  const rightValue = tableSortValue(right.name)
  if (leftValue !== rightValue) return leftValue - rightValue
  return String(left.name).localeCompare(String(right.name))
}

function sortTableNamesForDrop(left, right) {
  const leftValue = tableSortValue(left)
  const rightValue = tableSortValue(right)
  if (leftValue !== rightValue) return rightValue - leftValue
  return String(right).localeCompare(String(left))
}

function createIfNotExists(sql, type) {
  if (!sql) return ''
  if (type === 'table') {
    return sql.replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\s+)/i, 'CREATE TABLE IF NOT EXISTS ')
  }
  if (type === 'index') {
    return sql.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\s+)/i, (_, unique = '') => `CREATE ${unique}INDEX IF NOT EXISTS `)
  }
  return sql
}

function normalizeD1Result(payload) {
  const result = payload?.result
  const first = Array.isArray(result) ? result[0] : result
  if (!first) return []
  if (first.success === false) throw new Error(first.error || 'D1 query failed')
  return first.results || []
}

function toBashPath(path) {
  if (process.platform !== 'win32') return path
  return String(path).replace(/^([A-Za-z]):\\/, (_, drive) => `/${drive.toLowerCase()}/`).replace(/\\/g, '/')
}

async function runWranglerDryRun(args) {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('Wrangler dry-run requires CLOUDFLARE_ACCOUNT_ID when multiple accounts are available')
  }

  const databases = wranglerD1List()
  for (const name of [args.source, args.target]) {
    if (!databases.some((database) => database.name === name)) {
      throw new Error(`D1 database not found via Wrangler: ${name}`)
    }
  }

  const sourceSchema = wranglerD1Query(
    args.source,
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name"
  )
  const sourceTables = sourceSchema
    .filter((row) => row.type === 'table' && !shouldExcludeObject(row))
    .sort(sortTablesForCopy)
  const sourceIndexes = sourceSchema
    .filter((row) => row.type === 'index' && row.sql && !shouldExcludeObject(row) && sourceTables.some((table) => table.name === row.tbl_name))
  const excludedObjects = sourceSchema.filter(shouldExcludeObject).map((row) => `${row.type}:${row.name}`)

  console.log('[dry-run] using Wrangler OAuth login because CLOUDFLARE_API_TOKEN is not set')
  console.log(`[plan] copy tables (${sourceTables.length}): ${sourceTables.map((row) => row.name).join(', ')}`)
  console.log(`[plan] recreate indexes (${sourceIndexes.length}): ${sourceIndexes.map((row) => row.name).join(', ')}`)
  if (excludedObjects.length > 0) console.log(`[plan] exclude objects: ${excludedObjects.join(', ')}`)

  if (sourceTables.length > 0) {
    const counts = new Map()
    for (let i = 0; i < sourceTables.length; i += DRY_RUN_COUNT_CHUNK_SIZE) {
      const countSql = sourceTables
        .slice(i, i + DRY_RUN_COUNT_CHUNK_SIZE)
        .map((table) => `SELECT ${quoteSqlString(table.name)} AS name, COUNT(*) AS count FROM ${quoteIdent(table.name)}`)
        .join(' UNION ALL ')
      const countRows = wranglerD1Query(args.source, countSql)
      for (const row of countRows) counts.set(row.name, Number(row.count || 0))
    }
    for (const table of sourceTables) {
      console.log(`[dry-run] ${table.name}: ${counts.get(table.name) || 0} row(s)`)
    }
  }

  const targetFts = wranglerD1Query(args.target, NO_FTS_OBJECT_COUNT_SQL)
  console.log(`[dry-run] backup no-FTS object count: ${Number(targetFts[0]?.count || 0)}`)
}

async function cfFetch(path, init = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('Missing CLOUDFLARE_API_TOKEN')

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  })

  const text = await res.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Cloudflare API returned non-JSON response (${res.status}): ${text.slice(0, 300)}`)
  }

  if (!res.ok || payload.success === false) {
    const messages = [
      ...(payload.errors || []).map((error) => error.message || JSON.stringify(error)),
      ...(payload.messages || []).map((message) => message.message || JSON.stringify(message))
    ].filter(Boolean)
    throw new Error(`Cloudflare API request failed (${res.status}): ${messages.join('; ') || text.slice(0, 300)}`)
  }

  return payload
}

async function listDatabases(accountId) {
  const databases = []
  for (let page = 1; page < 100; page += 1) {
    const payload = await cfFetch(`/accounts/${accountId}/d1/database?page=${page}&per_page=100`)
    databases.push(...(payload.result || []))
    const info = payload.result_info || {}
    if (!info.total_pages || page >= info.total_pages) break
  }
  return databases
}

async function resolveDatabaseId(accountId, name) {
  const databases = await listDatabases(accountId)
  const matches = databases.filter((database) => database.name === name)
  if (matches.length === 0) throw new Error(`D1 database not found: ${name}`)
  if (matches.length > 1) throw new Error(`Multiple D1 databases found with name: ${name}`)
  return matches[0].uuid
}

async function d1Query(accountId, databaseId, sql, params = []) {
  const payload = await cfFetch(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params })
  })
  return normalizeD1Result(payload)
}

async function getSchema(accountId, databaseId) {
  return d1Query(
    accountId,
    databaseId,
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name"
  )
}

async function getTableInfo(accountId, databaseId, tableName) {
  return d1Query(accountId, databaseId, `PRAGMA table_info(${quoteIdent(tableName)})`)
}

async function getCount(accountId, databaseId, tableName) {
  const rows = await d1Query(accountId, databaseId, `SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`)
  return Number(rows[0]?.count || 0)
}

async function updateState(accountId, databaseId, data) {
  await d1Query(
    accountId,
    databaseId,
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(STATE_TABLE)} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      source_database TEXT,
      target_database TEXT,
      error TEXT,
      table_counts_json TEXT
    )`
  )

  await d1Query(
    accountId,
    databaseId,
    `INSERT OR REPLACE INTO ${quoteIdent(STATE_TABLE)}
      (id, status, started_at, finished_at, source_database, target_database, error, table_counts_json)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.status,
      data.startedAt || null,
      data.finishedAt || null,
      data.source || null,
      data.target || null,
      data.error || null,
      data.tableCountsJson || null
    ]
  )
}

async function assertNoFts(accountId, databaseId, label) {
  const rows = await d1Query(accountId, databaseId, NO_FTS_OBJECT_COUNT_SQL)
  const count = Number(rows[0]?.count || 0)
  if (count !== 0) throw new Error(`${label} must not contain course_search/FTS5/virtual-table objects; found ${count}`)
}

function copyKeyColumnsFromTableInfo(tableInfo) {
  const primaryKeyColumns = tableInfo
    .filter((row) => Number(row.pk || 0) > 0)
    .sort((left, right) => Number(left.pk || 0) - Number(right.pk || 0))
    .map((row) => row.name)
    .filter(Boolean)
  return primaryKeyColumns.length > 0 ? primaryKeyColumns : [ROWID_COPY_KEY]
}

function buildKeysetPredicate(keyColumns, lastKey) {
  if (!lastKey) return { whereSql: '', params: [] }

  const parts = []
  const params = []
  for (let index = 0; index < keyColumns.length; index += 1) {
    const equalColumns = keyColumns.slice(0, index)
    const equalSql = equalColumns.map((column) => `${quoteIdent(column)} = ?`)
    const greaterSql = `${quoteIdent(keyColumns[index])} > ?`
    parts.push(`(${[...equalSql, greaterSql].join(' AND ')})`)
    params.push(...equalColumns.map((column) => lastKey[column] ?? null), lastKey[keyColumns[index]] ?? null)
  }

  return {
    whereSql: `WHERE ${parts.join(' OR ')}`,
    params
  }
}

function lastKeyFromRow(row, keyColumns, usesRowid) {
  const lastKey = {}
  for (const column of keyColumns) {
    lastKey[column] = usesRowid ? row.__copy_rowid : row[column]
  }
  return lastKey
}

async function copyTable({ accountId, sourceId, targetId, tableName, tableInfo, readBatchSize }) {
  const total = await getCount(accountId, sourceId, tableName)
  console.log(`[copy] ${tableName}: ${total} row(s)`)

  const columns = tableInfo.map((row) => row.name).filter(Boolean)
  if (columns.length === 0 || total === 0) {
    return total
  }

  const selectColumns = columns.map(quoteIdent).join(', ')
  const insertColumns = selectColumns
  const keyColumns = copyKeyColumnsFromTableInfo(tableInfo)
  const usesRowid = keyColumns.length === 1 && keyColumns[0] === ROWID_COPY_KEY
  const readColumns = usesRowid ? `${selectColumns}, ${ROWID_COPY_KEY} AS __copy_rowid` : selectColumns
  const orderBy = keyColumns.map(quoteIdent).join(', ')
  const rowsPerInsert = Math.max(1, Math.floor(MAX_BIND_PARAMS / columns.length))
  let copied = 0
  let lastKey = null

  while (true) {
    const { whereSql, params } = buildKeysetPredicate(keyColumns, lastKey)
    const rows = await d1Query(
      accountId,
      sourceId,
      `SELECT ${readColumns} FROM ${quoteIdent(tableName)} ${whereSql} ORDER BY ${orderBy} LIMIT ${readBatchSize}`,
      params
    )
    if (rows.length === 0) break

    for (let i = 0; i < rows.length; i += rowsPerInsert) {
      const part = rows.slice(i, i + rowsPerInsert)
      const placeholders = part
        .map(() => `(${columns.map(() => '?').join(', ')})`)
        .join(', ')
      const params = part.flatMap((row) => columns.map((column) => row[column] ?? null))

      await d1Query(
        accountId,
        targetId,
        `INSERT INTO ${quoteIdent(tableName)} (${insertColumns}) VALUES ${placeholders}`,
        params
      )
      copied += part.length
    }

    lastKey = lastKeyFromRow(rows[rows.length - 1], keyColumns, usesRowid)
    console.log(`[copy] ${tableName}: copied ${copied}/${total}`)
  }

  return copied
}

function runNoFtsMaterialize(targetName) {
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'refresh-review-index-remote.sh')
  const nodeBinPath = toBashPath(dirname(process.execPath))
  console.log(`[materialize] refresh review index without FTS on ${targetName}`)
  const result = spawnSync('bash', [scriptPath, '--no-fts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: [nodeBinPath, process.env.PATH].filter(Boolean).join(':'),
      D1_DATABASE_NAME: targetName
    }
  })

  if (result.status !== 0) {
    throw new Error(`No-FTS materialize failed with status ${result.status}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) throw new Error('Missing CLOUDFLARE_ACCOUNT_ID')
  if (args.source === args.target) throw new Error('Source and target D1 database names must be different')
  if (!args.allowTarget && args.target !== DEFAULT_TARGET) {
    throw new Error(`Refusing to refresh unexpected target "${args.target}". Pass --allow-target to override.`)
  }

  console.log(`[plan] source=${args.source} target=${args.target} dryRun=${args.dryRun}`)
  if (args.dryRun && !process.env.CLOUDFLARE_API_TOKEN) {
    await runWranglerDryRun(args)
    return
  }

  const [sourceId, targetId] = await Promise.all([
    resolveDatabaseId(accountId, args.source),
    resolveDatabaseId(accountId, args.target)
  ])

  const sourceSchema = await getSchema(accountId, sourceId)
  const sourceTables = sourceSchema
    .filter((row) => row.type === 'table' && !shouldExcludeObject(row))
    .map((row) => ({ ...row, sql: createIfNotExists(row.sql, 'table') }))
    .sort(sortTablesForCopy)
  const sourceIndexes = sourceSchema
    .filter((row) => row.type === 'index' && row.sql && !shouldExcludeObject(row) && sourceTables.some((table) => table.name === row.tbl_name))
    .map((row) => ({ ...row, sql: createIfNotExists(row.sql, 'index') }))

  const excludedObjects = sourceSchema.filter(shouldExcludeObject).map((row) => `${row.type}:${row.name}`)
  console.log(`[plan] copy tables (${sourceTables.length}): ${sourceTables.map((row) => row.name).join(', ')}`)
  console.log(`[plan] recreate indexes (${sourceIndexes.length}): ${sourceIndexes.map((row) => row.name).join(', ')}`)
  if (excludedObjects.length > 0) console.log(`[plan] exclude objects: ${excludedObjects.join(', ')}`)

  if (args.dryRun) {
    for (const table of sourceTables) {
      const count = await getCount(accountId, sourceId, table.name)
      console.log(`[dry-run] ${table.name}: ${count} row(s)`)
    }
    return
  }

  const startedAt = new Date().toISOString()
  const tableCounts = {}
  await assertNoFts(accountId, targetId, 'Backup D1')
  await updateState(accountId, targetId, {
    status: 'refreshing',
    startedAt,
    source: args.source,
    target: args.target
  })

  try {
    const targetSchema = await getSchema(accountId, targetId)
    const targetTables = targetSchema
      .filter((row) => row.type === 'table' && !shouldExcludeObject(row))
      .filter((row) => row.name !== STATE_TABLE)
      .map((row) => row.name)
      .sort(sortTableNamesForDrop)

    for (const tableName of targetTables) {
      console.log(`[reset] drop target table ${tableName}`)
      await d1Query(accountId, targetId, `DROP TABLE IF EXISTS ${quoteIdent(tableName)}`)
    }

    for (const table of sourceTables) {
      console.log(`[schema] create table ${table.name}`)
      await d1Query(accountId, targetId, table.sql)
    }

    for (const table of sourceTables) {
      const tableInfo = await getTableInfo(accountId, sourceId, table.name)
      tableCounts[table.name] = await copyTable({
        accountId,
        sourceId,
        targetId,
        tableName: table.name,
        tableInfo,
        readBatchSize: args.batchSize
      })
    }

    for (const index of sourceIndexes) {
      console.log(`[schema] create index ${index.name}`)
      await d1Query(accountId, targetId, index.sql)
    }

    if (!args.skipMaterialize) {
      runNoFtsMaterialize(args.target)
    }

    const mismatches = []
    for (const table of sourceTables) {
      const sourceCount = await getCount(accountId, sourceId, table.name)
      const targetCount = await getCount(accountId, targetId, table.name)
      console.log(`[verify] ${table.name}: source=${sourceCount} target=${targetCount}`)
      if (sourceCount !== targetCount) {
        mismatches.push(`${table.name}: source=${sourceCount} target=${targetCount}`)
      }
      tableCounts[table.name] = { source: sourceCount, target: targetCount }
    }

    await assertNoFts(accountId, targetId, 'Backup D1')
    if (mismatches.length > 0) {
      throw new Error(`Backup count mismatch: ${mismatches.join('; ')}`)
    }

    await updateState(accountId, targetId, {
      status: 'ready',
      startedAt,
      finishedAt: new Date().toISOString(),
      source: args.source,
      target: args.target,
      tableCountsJson: JSON.stringify(tableCounts)
    })
    console.log('[done] Backup refresh completed')
  } catch (error) {
    await updateState(accountId, targetId, {
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      source: args.source,
      target: args.target,
      error: error?.message || String(error),
      tableCountsJson: JSON.stringify(tableCounts)
    }).catch((stateError) => {
      console.error(`[state] failed to record failure state: ${stateError?.message || stateError}`)
    })
    throw error
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
