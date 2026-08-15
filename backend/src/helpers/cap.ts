import type { Bindings } from './types'

type CapSiteverifyResponse = {
  success?: boolean
  'error-codes'?: string[]
  error?: string
}

/**
 * 自托管 Cap CAPTCHA 的服务端校验。
 *
 * Cap 的 siteverify 接口与 reCAPTCHA 形状一致：
 *   POST https://<instance>/<site-key>/siteverify
 *   body: { secret, response }
 * 返回 { success: boolean }。
 *
 * 与 verifyTurnstile 并存：web 端启动门禁用 Cap，App 端继续用 Turnstile，
 * 由 /api/startup/verify 的 provider 字段区分。
 */
export async function verifyCapToken(token: string, env: Bindings) {
  try {
    const apiBase = String(env.CAP_API_BASE || '').trim().replace(/\/+$/, '')
    const siteKey = String(env.CAP_SITE_KEY || '').trim()
    const secret = String(env.CAP_SECRET_KEY || '').trim()
    if (!apiBase || !siteKey || !secret) {
      return { ok: false, error: 'missing_secret' as const }
    }

    const response = String(token || '').trim()
    if (!response) return { ok: false, error: 'missing_token' as const }

    const url = `${apiBase}/${encodeURIComponent(siteKey)}/siteverify`

    // 与 Turnstile 校验一致的重试策略：仅对 5xx/瞬时网络错误重试，
    // 不重试 token 校验失败（token 是一次性的）。
    const maxAttempts = 3
    let lastError: { ok: false; error: string; codes?: string[] } | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      try {
        const controller = new AbortController()
        timeoutId = setTimeout(() => controller.abort(), 8000)

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, response }),
          signal: controller.signal
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          if (res.status >= 500 && attempt < maxAttempts) {
            console.error(`Cap siteverify HTTP ${res.status} (attempt ${attempt}/${maxAttempts}), retrying...`)
            await new Promise((r) => setTimeout(r, 500 * attempt))
            continue
          }
          lastError = { ok: false, error: 'siteverify_http_error' as const }
          console.error('Cap siteverify HTTP error:', res.status, text.slice(0, 200))
          break
        }

        const data = await res.json().catch(() => null) as CapSiteverifyResponse | null
        if (!data || typeof data.success !== 'boolean') {
          console.error('Cap siteverify invalid response')
          return { ok: false, error: 'invalid_response' as const }
        }

        if (!data.success) {
          const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : []
          console.error('Cap verify failed:', { error: 'verify_failed', codes })
          return { ok: false, error: 'verify_failed' as const, codes }
        }

        return { ok: true }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        const isAbortOrTimeout = err.name === 'AbortError' || /abort|timeout/i.test(err.message)
        if (attempt < maxAttempts && !isAbortOrTimeout) {
          console.error(`Cap fetch error (attempt ${attempt}/${maxAttempts}):`, err.message, 'retrying...')
          await new Promise((r) => setTimeout(r, 500 * attempt))
          continue
        }
        lastError = { ok: false, error: 'unknown_error' as const }
        console.error('Cap service error:', e)
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }
    }

    return lastError || { ok: false, error: 'unknown_error' as const }
  } catch (e) {
    console.error('Cap service error:', e)
    return { ok: false, error: 'unknown_error' as const }
  }
}
