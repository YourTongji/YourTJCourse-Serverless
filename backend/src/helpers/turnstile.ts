import type { Bindings } from './types'

type TurnstileSiteverifyResponse = {
  success?: boolean
  hostname?: string
  action?: string
  cdata?: string
  'error-codes'?: string[]
}

export function isAllowedTurnstileHostname(hostname: string) {
  const value = String(hostname || '').trim().toLowerCase()
  if (!value) return false
  if (value === 'xk.yourtj.de') return true
  if (value === 'xk.xialing.icu') return true
  if (value === 'localhost') return true
  if (value.endsWith('.yourtj.de')) return true
  if (value.endsWith('.xialing.icu')) return true
  if (value.endsWith('.pages.dev')) return true
  return false
}

export async function verifyTurnstile(token: string, env: Bindings, opts?: { expectedAction?: string; remoteip?: string }) {
  try {
    const secret = String(env.TURNSTILE_SECRET_KEY || '').trim()
    if (!secret) return { ok: false, error: 'missing_secret' as const }

    const response = String(token || '').trim()
    if (!response) return { ok: false, error: 'missing_token' as const }

    const url = String(env.TURNSTILE_SITEVERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify').trim()
    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', response)
    if (opts?.remoteip) body.set('remoteip', String(opts.remoteip))

    // Retry loop for transient network / 5xx errors
    const maxAttempts = 3
    let lastError: { ok: false; error: string; codes?: string[] } | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          // Retry on 5xx, fail fast on 4xx
          if (res.status >= 500 && attempt < maxAttempts) {
            console.error(`Turnstile siteverify HTTP ${res.status} (attempt ${attempt}/${maxAttempts}), retrying...`)
            await new Promise((r) => setTimeout(r, 500 * attempt))
            continue
          }
          console.error('Turnstile siteverify HTTP error:', res.status, text.slice(0, 200))
          return { ok: false, error: 'siteverify_http_error' as const }
        }

        const data = await res.json().catch(() => null) as TurnstileSiteverifyResponse | null
        if (!data || typeof data.success !== 'boolean') {
          console.error('Turnstile siteverify invalid response')
          return { ok: false, error: 'invalid_response' as const }
        }

        if (!data.success) {
          const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : []
          // Don't retry on token validation failures (they won't pass on retry)
          return { ok: false, error: 'verify_failed' as const, codes }
        }

        if (opts?.expectedAction) {
          if (String(data.action || '').trim() !== opts.expectedAction) {
            console.error('Turnstile action mismatch:', data.action, 'expected:', opts.expectedAction)
            return { ok: false, error: 'action_mismatch' as const }
          }
        }

        if (data.hostname && !isAllowedTurnstileHostname(data.hostname)) {
          console.error('Turnstile hostname not allowed:', data.hostname)
          return { ok: false, error: 'hostname_not_allowed' as const }
        }

        return { ok: true }
      } catch (e) {
        const message = String(e instanceof Error ? e.message : e)
        if (attempt < maxAttempts && (message.includes('abort') || message.includes('timeout') || message.includes('fetch'))) {
          console.error(`Turnstile fetch error (attempt ${attempt}/${maxAttempts}):`, message, 'retrying...')
          await new Promise((r) => setTimeout(r, 500 * attempt))
          continue
        }
        lastError = { ok: false, error: 'unknown_error' as const }
        console.error('Turnstile service error:', e)
      }
    }

    return lastError || { ok: false, error: 'unknown_error' as const }
  } catch (e) {
    console.error('Turnstile service error:', e)
    return { ok: false, error: 'unknown_error' as const }
  }
}
