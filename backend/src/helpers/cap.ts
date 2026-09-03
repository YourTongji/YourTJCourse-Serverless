import type { Bindings } from './types'

type CapSiteverifyResponse = {
  success?: boolean
  'error-codes'?: string[]
  error?: string
}

const DEFAULT_TIMEOUT_MS = 15_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_MAX_IN_FLIGHT = 16
const MIN_MAX_IN_FLIGHT = 1
const MAX_MAX_IN_FLIGHT = 64

let capVerificationsInFlight = 0

function readBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(String(value || '').trim())
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function acquireCapSlot(maxInFlight: number): boolean {
  if (capVerificationsInFlight >= maxInFlight) return false
  capVerificationsInFlight += 1
  return true
}

function releaseCapSlot(): void {
  capVerificationsInFlight = Math.max(0, capVerificationsInFlight - 1)
}

/**
 * 自托管 Cap CAPTCHA 的服务端校验。
 *
 * Cap 的 siteverify 接口与 reCAPTCHA 形状一致：
 *   POST https://<instance>/<site-key>/siteverify
 *   body: { secret, response }
 * 返回 { success: boolean }。
 *
 * 与 verifyTurnstile 并存：由 /api/startup/verify 的 provider 字段区分，
 * 网页入口不再调用此接口，App 等客户端仍可使用。
 */
export async function verifyCapToken(token: string, env: Bindings) {
  try {
    const apiBase = String(env.CAP_API_INTERNAL_BASE || env.CAP_API_BASE || '').trim().replace(/\/+$/, '')
    const siteKey = String(env.CAP_SITE_KEY || '').trim()
    const secret = String(env.CAP_SECRET_KEY || '').trim()
    if (!apiBase || !siteKey || !secret) {
      return { ok: false, error: 'missing_secret' as const }
    }

    const response = String(token || '').trim()
    if (!response) return { ok: false, error: 'missing_token' as const }

    const timeoutMs = readBoundedNumber(env.CAP_VERIFY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
    const maxInFlight = readBoundedNumber(env.CAP_VERIFY_MAX_IN_FLIGHT, DEFAULT_MAX_IN_FLIGHT, MIN_MAX_IN_FLIGHT, MAX_MAX_IN_FLIGHT)
    if (!acquireCapSlot(maxInFlight)) {
      console.warn(`[cap] siteverify busy: in_flight=${capVerificationsInFlight} limit=${maxInFlight}`)
      return { ok: false, error: 'busy' as const }
    }

    const url = `${apiBase}/${encodeURIComponent(siteKey)}/siteverify`

    // 以整个校验请求为总时间预算，避免 5xx 重试把用户请求拖到几十秒。
    // 不重试 abort/timeout：Cap token 是一次性的，首次请求可能已经消费 token。
    const maxAttempts = 2
    const startedAt = Date.now()

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const remainingMs = timeoutMs - (Date.now() - startedAt)
        if (remainingMs <= 0) {
          console.error(`[cap] siteverify timeout: elapsed_ms=${Date.now() - startedAt} attempts=${attempt - 1}`)
          return { ok: false, error: 'timeout' as const }
        }

        let timeoutId: ReturnType<typeof setTimeout> | undefined
        try {
          const controller = new AbortController()
          timeoutId = setTimeout(() => controller.abort(), remainingMs)

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ secret, response }),
            signal: controller.signal
          })

          if (!res.ok) {
            const text = await res.text().catch(() => '')
            if (res.status >= 500 && attempt < maxAttempts) {
              const backoffMs = Math.min(250, Math.max(0, timeoutMs - (Date.now() - startedAt)))
              if (Date.now() - startedAt + backoffMs < timeoutMs) {
                console.error(`[cap] siteverify HTTP ${res.status}, retrying attempt=${attempt + 1}/${maxAttempts}`)
                await new Promise((resolve) => setTimeout(resolve, backoffMs))
                continue
              }
            }
            console.error(`[cap] siteverify HTTP ${res.status}: elapsed_ms=${Date.now() - startedAt} body=${text.slice(0, 200)}`)
            return { ok: false, error: 'siteverify_http_error' as const }
          }

          const data = await res.json().catch(() => null) as CapSiteverifyResponse | null
          if (!data || typeof data.success !== 'boolean') {
            console.error(`[cap] siteverify invalid response: elapsed_ms=${Date.now() - startedAt}`)
            return { ok: false, error: 'invalid_response' as const }
          }

          if (!data.success) {
            const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : []
            console.error('[cap] verify failed:', { error: 'verify_failed', codes, elapsed_ms: Date.now() - startedAt })
            return { ok: false, error: 'verify_failed' as const, codes }
          }

          return { ok: true }
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e))
          const elapsedMs = Date.now() - startedAt
          const isAbortOrTimeout = err.name === 'AbortError' || /abort|timeout/i.test(err.message)
          if (isAbortOrTimeout) {
            console.error(`[cap] siteverify timeout: elapsed_ms=${elapsedMs} attempt=${attempt}`)
            return { ok: false, error: 'timeout' as const }
          }
          if (attempt < maxAttempts && elapsedMs < timeoutMs) {
            console.error(`[cap] fetch error, retrying attempt=${attempt + 1}/${maxAttempts}:`, err.message)
            const backoffMs = Math.min(250, Math.max(0, timeoutMs - elapsedMs))
            if (elapsedMs + backoffMs < timeoutMs) {
              await new Promise((resolve) => setTimeout(resolve, backoffMs))
              continue
            }
          }
          console.error(`[cap] service error: elapsed_ms=${elapsedMs}`, e)
          return { ok: false, error: 'unknown_error' as const }
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId)
        }
      }
      // Defensive fallback for future changes to the attempt loop.
      return { ok: false, error: 'timeout' as const }
    } finally {
      releaseCapSlot()
    }
  } catch (e) {
    console.error('[cap] service error:', e)
    return { ok: false, error: 'unknown_error' as const }
  }
}
