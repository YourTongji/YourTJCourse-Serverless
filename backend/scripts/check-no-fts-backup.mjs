#!/usr/bin/env node

import {
  NO_FTS_OBJECT_COUNT_SQL,
  quoteIdent,
  quoteSqlString,
  wranglerD1Statements
} from './d1-backup-utils.mjs'

const DEFAULT_DATABASE = 'jcourse-db-backup'
const STATE_TABLE = 'backup_refresh_state'
const CHECK_TABLES = [
  'courses',
  'course_aliases',
  'course_semesters',
  'reviews',
  'coursedetail',
  'teacher',
  'teacher_timeslots',
  'majorandcourse'
]

function parseArgs(argv) {
  const args = {
    database: process.env.D1_BACKUP_DATABASE_NAME || DEFAULT_DATABASE,
    json: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--database') args.database = requireValue(argv, ++i, arg)
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function printHelp() {
  console.log(`Usage: node scripts/check-no-fts-backup.mjs [options]

Options:
  --database <name>  Backup D1 database name (default: ${DEFAULT_DATABASE})
  --json             Print machine-readable JSON
`)
}

function statementFirstRow(statements, index) {
  return statements[index]?.results?.[0] || {}
}

function buildProbeSql() {
  const statements = [
    `SELECT COUNT(*) AS exists_count FROM sqlite_master WHERE type = 'table' AND name = ${quoteSqlString(STATE_TABLE)}`,
    NO_FTS_OBJECT_COUNT_SQL,
    ...CHECK_TABLES.map((table) => `SELECT ${quoteSqlString(table)} AS table_name, COUNT(*) AS exists_count FROM sqlite_master WHERE type IN ('table', 'view') AND name = ${quoteSqlString(table)}`)
  ]
  return statements.join('; ')
}

function buildStateSql() {
  return `SELECT status, started_at, finished_at, source_database, target_database, error FROM ${quoteIdent(STATE_TABLE)} WHERE id = 1`
}

function buildTableCountsSql(tables) {
  return tables
    .map((table) => `SELECT ${quoteSqlString(table)} AS table_name, COUNT(*) AS count FROM ${quoteIdent(table)}`)
    .join('; ')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const probes = wranglerD1Statements(args.database, buildProbeSql())
  const stateTableExists = Number(statementFirstRow(probes, 0).exists_count || 0) > 0
  const ftsObjects = Number(statementFirstRow(probes, 1).count || 0)
  const tableExists = {}
  const tableCounts = {}

  CHECK_TABLES.forEach((table, index) => {
    tableExists[table] = Number(statementFirstRow(probes, index + 2).exists_count || 0) > 0
    tableCounts[table] = 0
  })

  const state = stateTableExists
    ? statementFirstRow(wranglerD1Statements(args.database, buildStateSql()), 0)
    : {}

  const existingTables = CHECK_TABLES.filter((table) => tableExists[table])
  if (existingTables.length > 0) {
    const countStatements = wranglerD1Statements(args.database, buildTableCountsSql(existingTables))
    existingTables.forEach((table, index) => {
      tableCounts[table] = Number(statementFirstRow(countStatements, index).count || 0)
    })
  }

  const missingTables = CHECK_TABLES.filter((table) => !tableExists[table])
  const errors = []
  if (!stateTableExists) errors.push('backup_refresh_state is missing')
  else if (!state.status) errors.push('backup_refresh_state row is missing')
  else if (state.status !== 'ready') errors.push(`backup status is ${state.status}`)
  for (const table of missingTables) {
    errors.push(`backup table ${table} is missing`)
  }
  if (state.error) errors.push(`backup state error is not empty: ${state.error}`)
  if (ftsObjects !== 0) errors.push(`backup contains ${ftsObjects} course_search/FTS/virtual-table object(s)`)

  const result = {
    database: args.database,
    state,
    stateTableExists,
    ftsObjects,
    tableExists,
    tableCounts,
    missingTables,
    ok: errors.length === 0,
    errors
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`[backup-check] database=${result.database}`)
    console.log(`[backup-check] status=${state.status || '(missing)'} started_at=${state.started_at || '(missing)'} finished_at=${state.finished_at || '(missing)'}`)
    console.log(`[backup-check] no_fts_objects=${ftsObjects}`)
    for (const [table, count] of Object.entries(tableCounts)) {
      const suffix = tableExists[table] ? count : '(missing)'
      console.log(`[backup-check] ${table}=${suffix}`)
    }
    console.log(result.ok ? '[backup-check] OK' : `[backup-check] FAILED: ${errors.join('; ')}`)
  }

  if (!result.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
}
