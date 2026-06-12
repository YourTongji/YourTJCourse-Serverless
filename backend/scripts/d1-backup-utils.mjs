import { spawnSync } from 'node:child_process'

export const NO_FTS_OBJECT_COUNT_SQL =
  "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'course_search%' OR LOWER(COALESCE(sql, '')) LIKE '%create virtual table%' OR LOWER(COALESCE(sql, '')) LIKE '%fts5%'"

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

export function quoteSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

export function runCommand(command, args, options = {}) {
  const commandEnv = {
    ...process.env,
    ...(options.env || {})
  }
  const result = process.platform === 'win32'
    ? spawnSync([command, ...args].map(windowsShellQuote).join(' '), {
        encoding: 'utf8',
        shell: true,
        ...options,
        env: commandEnv
      })
    : spawnSync(command, args, {
        encoding: 'utf8',
        ...options,
        env: commandEnv
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

export function parseWranglerJson(output) {
  const text = String(output || '').trim()
  const start = text.search(/[\[{]/)
  if (start < 0) throw new Error(`Wrangler returned no JSON payload: ${text.slice(0, 300)}`)
  return JSON.parse(text.slice(start))
}

export function normalizeWranglerD1Statements(payload) {
  const statements = Array.isArray(payload) ? payload : [payload]
  for (const statement of statements) {
    if (statement?.success === false) throw new Error(statement.error || 'Wrangler D1 query failed')
  }
  return statements
}

export function normalizeWranglerD1Result(payload) {
  return normalizeWranglerD1Statements(payload)[0]?.results || []
}

export function wranglerD1Query(databaseName, sql) {
  const output = runCommand('npx', ['wrangler', 'd1', 'execute', databaseName, '--remote', '--json', '--command', sql])
  return normalizeWranglerD1Result(parseWranglerJson(output))
}

export function wranglerD1Statements(databaseName, sql) {
  const output = runCommand('npx', ['wrangler', 'd1', 'execute', databaseName, '--remote', '--json', '--command', sql])
  return normalizeWranglerD1Statements(parseWranglerJson(output))
}

export function wranglerD1List() {
  const output = runCommand('npx', ['wrangler', 'd1', 'list', '--json'])
  return parseWranglerJson(output)
}
