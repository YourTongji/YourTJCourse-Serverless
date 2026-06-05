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

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
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
    console.error('Turnstile service error:', e)
    return { ok: false, error: 'unknown_error' as const }
  }
}
