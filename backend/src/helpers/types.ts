export type Bindings = {
  DB: D1Database
  COURSE_SEARCH_INDEX?: KVNamespace
  CAPTCHA_SITEVERIFY_URL: string
  ADMIN_SECRET: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_SITEVERIFY_URL?: string
  ONESYSTEM_COOKIE?: string
  CREDIT_API_BASE?: string
  CREDIT_JCOURSE_SECRET?: string
  // compat: some deployments may reuse frontend env name or Credit backend secret name
  VITE_CREDIT_API_BASE?: string
  JCOURSE_INTEGRATION_SECRET?: string
  APP_ENV?: string
  FEISHU_REPORT_WEBHOOK_URL?: string
  FEISHU_REPORT_WEBHOOK_SECRET?: string
  AI_SUMMARY_KEY?: string
  AI_SUMMARY_MODEL?: string
  AI_SUMMARY_BASE_URL?: string
}
