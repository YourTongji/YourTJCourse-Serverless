const STORAGE_KEY = 'yourtj_client_id_v1'

export function getOrCreateClientId() {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing && existing.trim()) return existing.trim()

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)

  localStorage.setItem(STORAGE_KEY, id)
  return id
}

