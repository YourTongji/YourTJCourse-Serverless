export async function verifyTongjiCaptcha(token: string, siteverifyUrl: string) {
  try {
    const raw = String(siteverifyUrl || '').trim()
    if (!raw) return false

    // 兼容：用户可能只配置了 base（例如 https://captcha.xxx.com），而非完整的 /api/siteverify
    const normalized = raw.replace(/\/+$/, '')
    const url = /\/api\/siteverify$/i.test(normalized) ? normalized : `${normalized}/api/siteverify`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
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
    console.error('Captcha service error:', e)
    return false
  }
}
