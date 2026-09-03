export type Bindings = {
  DB: D1Database
  COURSE_SEARCH_INDEX?: KVNamespace
  CAPTCHA_SITEVERIFY_URL: string
  ADMIN_SECRET: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_SITEVERIFY_URL?: string
  TURNSTILE_SEND_REMOTEIP?: string
  ONESYSTEM_COOKIE?: string
  CREDIT_API_BASE?: string
  CREDIT_JCOURSE_SECRET?: string
  // compat: some deployments may reuse frontend env name or Credit backend secret name
  VITE_CREDIT_API_BASE?: string
  JCOURSE_INTEGRATION_SECRET?: string
  APP_ENV?: string
  FEISHU_REPORT_WEBHOOK_URL?: string
  FEISHU_REPORT_WEBHOOK_SECRET?: string
  PUBLIC_URL?: string
  FEISHU_PUBLIC_URL?: string
  AI_SUMMARY_KEY?: string
  AI_SUMMARY_MODEL?: string
  AI_SUMMARY_BASE_URL?: string
  // 自托管 Cap CAPTCHA（web 端启动门禁使用）
  CAP_API_BASE?: string
  // 可选：backend 与 Cap 同机/同网时使用内部地址，绕过公网 TLS/反代
  CAP_API_INTERNAL_BASE?: string
  CAP_SITE_KEY?: string
  CAP_SECRET_KEY?: string
  // Cap siteverify 调优项；未配置时使用后端安全默认值
  CAP_VERIFY_TIMEOUT_MS?: string
  CAP_VERIFY_MAX_IN_FLIGHT?: string
  // Node/VPS 运行环境：=1 时中间件拒绝用户写请求，用于正式切流期间的数据一致性
  MIGRATION_READONLY?: string
}
