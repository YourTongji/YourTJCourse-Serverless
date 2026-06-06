/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_BYPASS_STARTUP_GATE?: string
  readonly VITE_TURNSTILE_SITE_KEY: string
  readonly VITE_CAPTCHA_URL: string
  readonly VITE_WALINE_SERVER_URL: string
  readonly VITE_CREDIT_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
