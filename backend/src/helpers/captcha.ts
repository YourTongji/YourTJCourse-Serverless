export async function verifyTongjiCaptcha(token: string, siteverifyUrl: string) {
  const raw = String(siteverifyUrl || '').trim()
  if (!raw) return false

  // The siteverify URL can be provided with or without the /api/siteverify suffix.
  // We normalize by stripping trailing slashes and appending /api/siteverify if missing.
  const normalized = raw.replace(/\/+$/, '')
  const url = /\/api\/siteverify$/i.test(normalized) ? normalized : `${normalized}/api/siteverify`

  // Captcha tokens are single-use, so we do NOT retry on abort/timeout.
  // Keep total worst-case time within the 15s frontend fetch timeout:
  // 2 attempts x 5s + 0.5s backoff = 10.5s max.
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), 5000)

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
      const err = e instanceof Error ? e : new Error(String(e))
      // Only retry on transient network errors, not abort/timeout:
      // the token may already have been consumed by the first attempt.
      const isAbortOrTimeout = err.name === 'AbortError' || /abort|timeout/i.test(err.message)
      if (attempt < maxAttempts && !isAbortOrTimeout) {
        console.error(`Captcha fetch error (attempt ${attempt}/${maxAttempts}):`, err.message, 'retrying...')
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
