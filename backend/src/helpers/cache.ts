export function buildCacheControl(maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
  return staleWhileRevalidateSeconds > 0
    ? `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
    : `public, max-age=${maxAgeSeconds}`
}

export function buildJsonResponse(payload: unknown, cacheControl: string) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    }
  })
}

export function setPublicCacheHeaders(c: any, maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
  c.header('Cache-Control', buildCacheControl(maxAgeSeconds, staleWhileRevalidateSeconds))
}
