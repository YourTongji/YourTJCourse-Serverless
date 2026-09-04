import type { Bindings } from './types'

type CapSiteverifyResponse = {
  success?: boolean
  'error-codes'?: string[]
}

type CapVerificationResult =
  | { ok: true }
  | { ok: false; error: 'missing_secret' | 'missing_token' | 'busy' | 'siteverify_http_error' | 'invalid_response' | 'verify_failed' | 'timeout' | 'unknown_error'; codes?: string[] }

const DEFAULT_TIMEOUT_MS = 5_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_MAX_IN_FLIGHT = 8
const MIN_MAX_IN_FLIGHT = 1
const MAX_MAX_IN_FLIGHT = 64

let capVerificationsInFlight = 0
const CAP_RESULT_CACHE_TTL_MS = 30_000
const CAP_RESULT_CACHE_MAX_ENTRIES = 1_024
const capVerificationInFlight = new Map<string, Promise<CapVerificationResult>>()
const capVerificationResults = new Map<string, { result: CapVerificationResult; expiresAt: number }>()

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

async function getTokenKey(token: string) {
  const webCrypto = (globalThis as any).crypto
  if (!webCrypto?.subtle) throw new Error('web crypto unavailable')
  const digest = await webCrypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function rememberVerificationResult(key: string, result: CapVerificationResult) {
  capVerificationResults.set(key, { result, expiresAt: Date.now() + CAP_RESULT_CACHE_TTL_MS })
  if (capVerificationResults.size <= CAP_RESULT_CACHE_MAX_ENTRIES) return
  const oldest = capVerificationResults.keys().next().value
  if (oldest) capVerificationResults.delete(oldest)
}

/**
 * 自托管 Cap CAPTCHA 的服务端校验。
 *
 * Cap token 是一次性凭证：一次调用最多发起一次 siteverify，任何 HTTP、网络
 * 或超时失败都不会用同一个 token 重放。与 verifyTurnstile 并存，由 startup
 * verify 路由的 provider 字段区分；网页入口不调用此接口。
 */
export async function verifyCapToken(token: string, env: Bindings) {
  const apiBase = String(env.CAP_API_INTERNAL_BASE || env.CAP_API_BASE || '').trim().replace(/\/+$/, '')
  const siteKey = String(env.CAP_SITE_KEY || '').trim()
  const secret = String(env.CAP_SECRET_KEY || '').trim()
  if (!apiBase || !siteKey || !secret) return { ok: false, error: 'missing_secret' as const }

  const response = String(token || '').trim()
  if (!response) return { ok: false, error: 'missing_token' as const }

  let tokenKey: string
  try {
    tokenKey = await getTokenKey(response)
  } catch (error) {
    console.error(JSON.stringify({
      event: 'cap_verify',
      result: 'network_error',
      message: error instanceof Error ? error.message : String(error)
    }))
    return { ok: false, error: 'unknown_error' as const }
  }
  const cached = capVerificationResults.get(tokenKey)
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.result
    capVerificationResults.delete(tokenKey)
  }
  const pending = capVerificationInFlight.get(tokenKey)
  if (pending) return pending

  const timeoutMs = readBoundedNumber(env.CAP_VERIFY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const maxInFlight = readBoundedNumber(env.CAP_VERIFY_MAX_IN_FLIGHT, DEFAULT_MAX_IN_FLIGHT, MIN_MAX_IN_FLIGHT, MAX_MAX_IN_FLIGHT)
  if (!acquireCapSlot(maxInFlight)) {
    console.warn(JSON.stringify({
      event: 'cap_verify',
      result: 'busy',
      inFlight: capVerificationsInFlight,
      limit: maxInFlight
    }))
    return { ok: false, error: 'busy' as const }
  }

  const verification = (async (): Promise<CapVerificationResult> => {
    const url = `${apiBase}/${encodeURIComponent(siteKey)}/siteverify`
    const startedAt = Date.now()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ secret, response }),
        signal: controller.signal
      })
      const elapsedMs = Date.now() - startedAt

      if (!res.ok) {
        await res.text().catch(() => '')
        console.error(JSON.stringify({
          event: 'cap_verify',
          result: 'http_error',
          status: res.status,
          elapsedMs
        }))
        return { ok: false, error: 'siteverify_http_error' }
      }

      const data = await res.json().catch(() => null) as CapSiteverifyResponse | null
      if (!data || typeof data.success !== 'boolean') {
        console.error(JSON.stringify({ event: 'cap_verify', result: 'invalid_response', elapsedMs }))
        return { ok: false, error: 'invalid_response' }
      }

      if (!data.success) {
        const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : []
        console.error(JSON.stringify({ event: 'cap_verify', result: 'verify_failed', codes, elapsedMs }))
        return { ok: false, error: 'verify_failed', codes }
      }

      console.log(JSON.stringify({ event: 'cap_verify', result: 'success', elapsedMs }))
      return { ok: true }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const elapsedMs = Date.now() - startedAt
      if (err.name === 'AbortError' || /abort|timeout/i.test(err.message)) {
        console.error(JSON.stringify({ event: 'cap_verify', result: 'timeout', elapsedMs }))
        return { ok: false, error: 'timeout' }
      }

      console.error(JSON.stringify({
        event: 'cap_verify',
        result: 'network_error',
        elapsedMs,
        message: err.message
      }))
      return { ok: false, error: 'unknown_error' }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      releaseCapSlot()
    }
  })()

  capVerificationInFlight.set(tokenKey, verification)
  try {
    const result = await verification
    rememberVerificationResult(tokenKey, result)
    return result
  } finally {
    if (capVerificationInFlight.get(tokenKey) === verification) capVerificationInFlight.delete(tokenKey)
  }
}
