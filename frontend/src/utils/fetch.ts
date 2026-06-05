export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

export async function readJson<T = any>(
  url: string,
  options: RequestInit = {},
  timeout = 15000
): Promise<T> {
  const res = await fetchWithTimeout(url, options, timeout)
  const text = await res.text()
  // Detect HTML response (misconfigured base URL)
  if (/^\s*<!doctype\s+html/i.test(text) || /^\s*<html/i.test(text)) {
    throw new Error(`Expected JSON from ${url} but got HTML — check your API base URL`)
  }
  return JSON.parse(text)
}
