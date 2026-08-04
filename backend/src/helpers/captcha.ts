export async function verifyTongjiCaptcha(token: string, siteverifyUrl: string) {
  const raw = String(siteverifyUrl || '').trim()
  if (!raw) return false

  // The siteverify URL can be provided with or without the /api/siteverify suffix.
  // We normalize by stripping trailing slashes and appending /api/siteverify if missing.
  const normalized = raw.replace(/\/+$/, '')
  const url = /\/api\/siteverify$/i.test(normalized) ? normalized : `${normalized}/api/siteverify`

  // Captcha tokens are single-use, so we do NOT retry on abort/timeout.
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        if (res.status >= 500 && attempt < maxAttempts) {
          console.error(`Captcha siteverify HTTP ${res.status} (attempt ${attempt}/${maxAttempts}), retrying...`)
          await new Promise((r) => setTimeout(r, 500 * attempt))
          continue
        }
        console.error('Captcha siteverify HTTP error:', res.status, text.slice(0, 200))
        return false
      }
      const data = await res.json().catch(() => null) as { success?: boolean } | null
      if (!data || typeof data.success !== 'boolean') {
        console.error('Captcha siteverify invalid response')
        return false
      }
      return data.success === true
    } catch (e) {
      const message = String(e instanceof Error ? e.message : e)
      // Only retry on transient network errors, not abort/timeout
      // (the token may already be consumed).
      if (attempt < maxAttempts && message.includes('fetch') && !message.includes('abort') && !message.includes('timeout')) {
        console.error(`Captcha fetch error (attempt ${attempt}/${maxAttempts}):`, message, 'retrying...')
        await new Promise((r) => setTimeout(r, 500 * attempt))
        continue
      }
      console.error('Captcha service error:', e)
      return false
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }

  return false
}
