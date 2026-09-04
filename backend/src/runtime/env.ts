import type { Bindings } from '../helpers/types'
import { D1CompatDatabase } from './db'

/**
 * 从 process.env 构造与 Worker Bindings 同形状的运行环境。
 * DB 为本地 SQLite 兼容层；COURSE_SEARCH_INDEX 仅代表 Cloudflare KV。
 * VPS 本地预构建索引由 node.ts 安装 local provider；索引不可用时在线请求直接
 * 回退 SQLite FTS/LIKE，不在请求路径读取全库并构建 MiniSearch。
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
    CAP_API_BASE: process.env.CAP_API_BASE,
    CAP_API_INTERNAL_BASE: process.env.CAP_API_INTERNAL_BASE,
    CAP_SITE_KEY: process.env.CAP_SITE_KEY,
    CAP_SECRET_KEY: process.env.CAP_SECRET_KEY,
    CAP_VERIFY_TIMEOUT_MS: process.env.CAP_VERIFY_TIMEOUT_MS,
    CAP_VERIFY_MAX_IN_FLIGHT: process.env.CAP_VERIFY_MAX_IN_FLIGHT,
    MIGRATION_READONLY: process.env.MIGRATION_READONLY
  }
}
