import type { Bindings } from '../helpers/types'
import { D1CompatDatabase } from './db'

/**
 * 从 process.env 构造与 Worker Bindings 同形状的运行环境。
 * DB 为本地 SQLite 兼容层；COURSE_SEARCH_INDEX 保留为 undefined，
 * MiniSearch 会自然回退到 D1/SQLite 实时构建内存索引。
 */
export function createBindings(): Omit<Bindings, 'DB'> & { DB: D1CompatDatabase; MIGRATION_READONLY?: string } {
  const databaseUrl = process.env.DATABASE_URL || 'file:./jcourse.db'

  return {
    DB: new D1CompatDatabase(databaseUrl),
    COURSE_SEARCH_INDEX: undefined,
    CAPTCHA_SITEVERIFY_URL: process.env.CAPTCHA_SITEVERIFY_URL || '',
    ADMIN_SECRET: process.env.ADMIN_SECRET || '',
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    TURNSTILE_SITEVERIFY_URL: process.env.TURNSTILE_SITEVERIFY_URL,
    ONESYSTEM_COOKIE: process.env.ONESYSTEM_COOKIE,
    CREDIT_API_BASE: process.env.CREDIT_API_BASE,
    CREDIT_JCOURSE_SECRET: process.env.CREDIT_JCOURSE_SECRET,
    VITE_CREDIT_API_BASE: process.env.VITE_CREDIT_API_BASE,
    JCOURSE_INTEGRATION_SECRET: process.env.JCOURSE_INTEGRATION_SECRET,
    APP_ENV: process.env.APP_ENV,
    FEISHU_REPORT_WEBHOOK_URL: process.env.FEISHU_REPORT_WEBHOOK_URL,
    FEISHU_REPORT_WEBHOOK_SECRET: process.env.FEISHU_REPORT_WEBHOOK_SECRET,
    PUBLIC_URL: process.env.PUBLIC_URL,
    FEISHU_PUBLIC_URL: process.env.FEISHU_PUBLIC_URL,
    AI_SUMMARY_KEY: process.env.AI_SUMMARY_KEY,
    AI_SUMMARY_MODEL: process.env.AI_SUMMARY_MODEL,
    AI_SUMMARY_BASE_URL: process.env.AI_SUMMARY_BASE_URL,
    MIGRATION_READONLY: process.env.MIGRATION_READONLY
  }
}
