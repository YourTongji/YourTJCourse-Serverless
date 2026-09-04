/**
 * Cloudflare Cache API 的 no-op 替代实现。
 * VPS 上不提供 Cloudflare Cache API；Node 公开响应的进程内缓存由
 * helpers/cache.ts 单独管理，避免把限流伪分布式缓存和响应缓存混在一起。
 * 这里仍保持 match 永远 miss、put/delete 为空操作，维持 Worker 调用点兼容。
 */
const noopCache = {
  match: async (): Promise<null> => null,
  put: async (): Promise<void> => undefined,
  delete: async (): Promise<boolean> => false
}

export function installNoopCaches(): void {
  ;(globalThis as any).caches = { default: noopCache }
}
