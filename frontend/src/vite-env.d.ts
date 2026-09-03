/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL: string
    readonly VITE_BYPASS_STARTUP_GATE?: string
    readonly VITE_CAPTCHA_URL: string
    readonly VITE_WALINE_SERVER_URL: string
    readonly VITE_CREDIT_API_BASE?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
