#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const DEFAULT_DATABASE = 'jcourse-db-backup'
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

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

function runCommand(command, args) {
  const result = process.platform === 'win32'
    ? spawnSync([command, ...args].map(windowsShellQuote).join(' '), {
        encoding: 'utf8',
        shell: true,
        env: process.env
      })
    : spawnSync(command, args, {
        encoding: 'utf8',
        env: process.env
      })

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    const errorDetail = result.error ? ` (${result.error.message})` : ''
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}${errorDetail}${details ? `:\n${details}` : ''}`)
  }

  return result.stdout
}

function windowsShellQuote(value) {
  const text = String(value)
  if (/^[A-Za-z0-9_./:=@-]+$/.test(text)) return text
  return `"${text.replace(/"/g, '\\"')}"`
}

function parseWranglerJson(output) {
  const text = String(output || '').trim()
  const start = text.search(/[\[{]/)
  if (start < 0) throw new Error(`Wrangler returned no JSON payload: ${text.slice(0, 300)}`)
  return JSON.parse(text.slice(start))
}

function normalizeStatements(payload) {
  const statements = Array.isArray(payload) ? payload : [payload]
  for (const statement of statements) {
    if (statement?.success === false) throw new Error(statement.error || 'Wrangler D1 query failed')
  }
  return statements
}

function wranglerD1Statements(databaseName, sql) {
  const output = runCommand('npx', ['wrangler', 'd1', 'execute', databaseName, '--remote', '--json', '--command', sql])
  return normalizeStatements(parseWranglerJson(output))
}

function statementFirstRow(statements, index) {
  return statements[index]?.results?.[0] || {}
}

function buildCheckSql() {
  const statements = [
    'SELECT status, started_at, finished_at, source_database, target_database, error FROM backup_refresh_state WHERE id = 1',
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'course_search%'",
    ...CHECK_TABLES.map((table) => `SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`)
  ]
  return statements.join('; ')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const statements = wranglerD1Statements(args.database, buildCheckSql())
  const state = statementFirstRow(statements, 0)
  const ftsObjects = Number(statementFirstRow(statements, 1).count || 0)
  const tableCounts = {}

  CHECK_TABLES.forEach((table, index) => {
    tableCounts[table] = Number(statementFirstRow(statements, index + 2).count || 0)
  })

  const errors = []
  if (!state.status) errors.push('backup_refresh_state is missing')
  else if (state.status !== 'ready') errors.push(`backup status is ${state.status}`)
  if (state.error) errors.push(`backup state error is not empty: ${state.error}`)
  if (ftsObjects !== 0) errors.push(`backup contains ${ftsObjects} course_search/FTS object(s)`)

  const result = {
    database: args.database,
    state,
    ftsObjects,
    tableCounts,
    ok: errors.length === 0,
    errors
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`[backup-check] database=${result.database}`)
    console.log(`[backup-check] status=${state.status || '(missing)'} started_at=${state.started_at || '(missing)'} finished_at=${state.finished_at || '(missing)'}`)
    console.log(`[backup-check] course_search_objects=${ftsObjects}`)
    for (const [table, count] of Object.entries(tableCounts)) {
      console.log(`[backup-check] ${table}=${count}`)
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
