import { fetchWithTimeout } from '../utils/fetch'

const DEFAULT_CORE_BASE = 'https://core.credit.yourtj.de'

function normalizeBase(input: string, fallback: string) {
  const raw = String(input || fallback).trim()
  if (!raw) return String(fallback).trim().replace(/\/+$/, '')
  // tolerate users setting `https://credit.yourtj.de/api`
  return raw.replace(/\/+$/, '').replace(/\/api$/i, '')
}

// Note: `credit.yourtj.de` is the frontend domain and may not proxy all `/api/*` routes.
// JCourse integration endpoints live on backend-core (`core.credit.yourtj.de`), so we keep a
// dedicated base for integration APIs to avoid receiving HTML (index.html).
const CREDIT_API_BASE = normalizeBase(import.meta.env.VITE_CREDIT_API_BASE || '', DEFAULT_CORE_BASE)
const CREDIT_INTEGRATION_BASE = (() => {
  const explicit = normalizeBase((import.meta.env as any).VITE_CREDIT_CORE_API_BASE || '', '')
  if (explicit) return explicit
  const looksLikeFrontend =
    /^https?:\/\/credit\.yourtj\.de$/i.test(CREDIT_API_BASE) || CREDIT_API_BASE.includes('credit.yourtj.de/')
  return looksLikeFrontend ? DEFAULT_CORE_BASE : CREDIT_API_BASE
})()

async function readJson(res: Response, hint: string) {
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(text || `${hint} failed`)
  const trimmed = String(text || '').trim()
  if (trimmed.startsWith('<')) {
    throw new Error(`${hint}：积分站返回了 HTML（疑似把前端页面当成接口返回了）。请检查积分站 API Base 配置是否正确。`)
  }
  if (!/application\/json/i.test(contentType)) {
    throw new Error(
      `${hint}：积分站返回的不是 JSON（content-type=${contentType || 'unknown'}）。` +
        `请检查 VITE_CREDIT_API_BASE 是否指向 ${DEFAULT_CORE_BASE}`
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${hint}：解析 JSON 失败，请检查积分站接口是否可用`)
  }
}

export async function registerCreditWallet(params: { userHash: string; userSecret: string }) {
  const res = await fetchWithTimeout(`${CREDIT_API_BASE}/api/wallet/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userHash: params.userHash, userSecret: params.userSecret })
  })
  return readJson(res, 'register wallet')
}

export async function fetchCreditBalance(userHash: string) {
  const res = await fetchWithTimeout(`${CREDIT_API_BASE}/api/wallet/${encodeURIComponent(userHash)}/balance`)
  return readJson(res, 'fetch balance')
}

export async function fetchCreditSummary(userHash: string, date?: string) {
  const q = new URLSearchParams({ userHash })
  if (date) q.set('date', date)
  const primaryUrl = `${CREDIT_INTEGRATION_BASE}/api/integration/jcourse/summary?${q.toString()}`
  try {
    const res = await fetchWithTimeout(primaryUrl)
    return readJson(res, 'fetch summary')
  } catch (e: any) {
    // safety retry: if someone misconfigured base, try the canonical core base once
    if (CREDIT_INTEGRATION_BASE !== DEFAULT_CORE_BASE) {
      const fallbackUrl = `${DEFAULT_CORE_BASE}/api/integration/jcourse/summary?${q.toString()}`
      const res = await fetchWithTimeout(fallbackUrl)
      return readJson(res, 'fetch summary')
    }
    throw e
  }
}
