/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL: string
    readonly VITE_BYPASS_STARTUP_GATE?: string
    readonly VITE_TURNSTILE_SITE_KEY: string
    readonly VITE_CAPTCHA_URL: string
    readonly VITE_WALINE_SERVER_URL: string
    readonly VITE_CREDIT_API_BASE?: string
    // 自托管 Cap CAPTCHA：形如 https://<cap-instance>/<site-key>/（web 端启动门禁优先使用）
    readonly VITE_CAP_API_ENDPOINT?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  // cap-widget 是自定义元素（React 18 的 JSX 不会自动识别 <cap-widget>）
  namespace JSX {
    interface IntrinsicElements {
      'cap-widget': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        'data-cap-api-endpoint'?: string
        'data-cap-i18n-initial-state'?: string
        'data-cap-i18n-verifying-label'?: string
        'data-cap-i18n-solved-label'?: string
        'data-cap-i18n-error-label'?: string
        'data-cap-i18n-required-label'?: string
        'data-cap-disable-haptics'?: boolean | ''
      }
    }
  }
}
