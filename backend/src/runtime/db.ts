import { createClient, type Client, type InStatement, type ResultSet } from '@libsql/client'

/**
 * D1 兼容层：将现有代码里对 D1Database 的调用方式
 * (prepare().bind().first()/all()/run()、batch())
 * 映射到 @libsql/client 的本地 SQLite 实现，保持调用点代码不变。
 *
 * 行为对齐点：
 * - first() 返回首行对象或 null
 * - all() 返回 { results, success, meta }
 * - run() 返回 { success, meta: { last_row_id, changes, duration } }，last_row_id 用于现有 admin 接口
 * - batch() 使用 libSQL 原子事务（'write' 模式），失败整体回滚
 * - 初始化时设置 WAL / synchronous=NORMAL / foreign_keys=ON / busy_timeout
 */

export interface D1CompatMeta {
  last_row_id: number
  changes: number
  duration: number
}

export interface D1CompatResult<T = unknown> {
  results: T[]
  success: boolean
  meta: D1CompatMeta & Record<string, unknown>
}

export interface D1CompatRunResult {
  success: boolean
  meta: D1CompatMeta & Record<string, unknown>
}

/** SQLite 返回的 bigint 无法 JSON.stringify，统一转成 number，与 D1 行为一致 */
function deepConvertRow(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(deepConvertRow)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepConvertRow(item)
    }
    return out
  }
  return value
}

/** D1 不支持 boolean/undefined 绑定值，SQLite 需要显式转换 */
function normalizeBindValue(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

class D1CompatStatement {
  constructor(
    private readonly client: Client,
    private readonly sql: string,
    private readonly args: any[] = []
  ) {}

  bind(...values: any[]): D1CompatStatement {
    return new D1CompatStatement(this.client, this.sql, values.map(normalizeBindValue))
  }

  async first<T = unknown>(): Promise<T | null> {
    const result = await this.client.execute({ sql: this.sql, args: this.args })
    const row = result.rows[0]
    return row ? (deepConvertRow(row) as T) : null
  }

  async all<T = unknown>(): Promise<D1CompatResult<T>> {
    const result = await this.client.execute({ sql: this.sql, args: this.args })
    return {
      results: result.rows.map((row) => deepConvertRow(row) as T),
      success: true,
      meta: this.buildMeta(result)
    }
  }

  async run(): Promise<D1CompatRunResult> {
    const result = await this.client.execute({ sql: this.sql, args: this.args })
    return { success: true, meta: this.buildMeta(result) }
  }

  /** 供 batch() 提取底层语句 */
  toInStatement(): InStatement {
    return { sql: this.sql, args: this.args }
  }

  private buildMeta(result: ResultSet): D1CompatMeta & Record<string, unknown> {
    return {
      last_row_id: Number(result.lastInsertRowid ?? 0),
      changes: Number(result.rowsAffected ?? 0),
      duration: 0
    }
  }
}

export class D1CompatDatabase {
  private readonly client: Client
  private initPromise: Promise<void> | null = null

  constructor(url: string) {
    this.client = createClient({ url })
  }

  /** 打开数据库文件并应用生产推荐 PRAGMA（幂等，重复调用安全） */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.client.execute('PRAGMA journal_mode=WAL')
        await this.client.execute('PRAGMA synchronous=NORMAL')
        await this.client.execute('PRAGMA foreign_keys=ON')
        await this.client.execute('PRAGMA busy_timeout=5000')
      })().catch((error) => {
        this.initPromise = null
        throw error
      })
    }
    return this.initPromise
  }

  prepare(sql: string): D1CompatStatement {
    return new D1CompatStatement(this.client, sql)
  }

  /** 原子批量执行：任一语句失败则整体回滚 */
  async batch(statements: Array<D1CompatStatement | { sql: string; args?: unknown[] }>): Promise<D1CompatResult[]> {
    const inStatements: InStatement[] = statements.map((statement) => {
      if (statement instanceof D1CompatStatement) return statement.toInStatement()
      return { sql: String((statement as any).sql), args: (statement as any).args || [] }
    })
    const results = await this.client.batch(inStatements, 'write')
    return results.map((result) => ({
      results: result.rows.map((row) => deepConvertRow(row)),
      success: true,
      meta: {
        last_row_id: Number(result.lastInsertRowid ?? 0),
        changes: Number(result.rowsAffected ?? 0),
        duration: 0
      }
    }))
  }
}
