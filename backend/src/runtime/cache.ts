/**
 * Cloudflare Cache API 的 no-op 替代实现。
 * VPS 上没有 caches.default，缓存职责交给 Caddy/CDN 的 Cache-Control 头。
 * match 永远 miss，put/delete 为空操作，保持现有调用点代码不变。
 */
const noopCache = {
  match: async (): Promise<null> => null,
  put: async (): Promise<void> => undefined,
  delete: async (): Promise<boolean> => false
}

export function installNoopCaches(): void {
  ;(globalThis as any).caches = { default: noopCache }
}
