/**
 * Feishu card notification for review report admin workflow.
 *
 * When a report is filed, sends an interactive card with "通过" / "驳回" buttons.
 * Buttons use HMAC-signed URLs and open a confirmation page before mutating state.
 * Approving a report hides the reported review. No Feishu app registration required.
 *
 * Aligned with YourTJ-Credit-Serverless implementation:
 * - Config hot update: read from DB settings first, fallback to env vars
 * - Error handling: parse response body for Feishu error codes
 * - Return value: FeishuSendResult with detailed status for debugging
 * - Text normalization: HTML entity decoding, long text truncation
 */
import type { Bindings } from './types'

export interface ReportNotificationPayload {
  reportId: number
  reviewId: number
  reviewSqid: string
  courseName: string
  courseId: number
  reason: string
  reporterClientId: string
  reviewSnippet: string
  rating: number
  semester: string
  /** True when a previously processed report was reopened by a repeat report. */
  reopened?: boolean
}

// ─── Feishu config & result types (aligned with Credit) ─────────

type FeishuConfig = { webhookUrl: string; secret?: string }

export type FeishuSendResult = {
  enabled: boolean
  ok?: boolean
  status?: number
  responseSnippet?: string
  error?: string
}

const FEISHU_SETTINGS_WEBHOOK_URL_KEY = 'feishu_report_webhook_url'
const FEISHU_SETTINGS_WEBHOOK_SECRET_KEY = 'feishu_report_webhook_secret'

// ─── Text normalization helpers (aligned with Credit) ───────────

function decodeHtmlEntities(input: string): string {
  const text = String(input ?? '')
  return text.replace(/&(?:lt|gt|amp|quot|nbsp);|&#39;|&#x?[0-9a-fA-F]+;/g, (m) => {
    switch (m) {
      case '&lt;': return '<'
      case '&gt;': return '>'
      case '&amp;': return '&'
      case '&quot;': return '"'
      case '&#39;': return "'"
      case '&nbsp;': return ' '
      default: {
        const hex = m.startsWith('&#x') || m.startsWith('&#X')
        const num = hex ? m.slice(3, -1) : m.slice(2, -1)
        const codePoint = parseInt(num, hex ? 16 : 10)
        if (!Number.isFinite(codePoint)) return m
        try { return String.fromCodePoint(codePoint) } catch { return m }
      }
    }
  })
}

function normalizeFeishuText(input: string): string {
  let decoded = String(input ?? '')
  for (let i = 0; i < 3; i++) {
    const next = decodeHtmlEntities(decoded)
    if (next === decoded) break
    decoded = next
  }
  return decoded.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
}

// ─── HMAC helpers ───────────────────────────────────────────────

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function signHmac(keyStr: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return hexEncode(sig)
}

const FEISHU_WEBHOOK_TIMEOUT_MS = 4000

/** Build a signed action confirmation URL. Valid for 7 days. */
async function buildActionUrl(
  origin: string,
  reportId: number,
  action: 'resolved' | 'rejected',
  adminSecret: string,
): Promise<string> {
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  const payload = `${reportId}:${action}:${deadline}`
  const sig = await signHmac(adminSecret, payload)
  return `${origin}/api/admin/report/${reportId}/confirm?action=${action}&deadline=${deadline}&sig=${sig}`
}

/** Feishu webhook signing (HMAC-SHA256 → base64). */
async function signFeishuWebhook(timestampSec: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestampSec}\n${secret}`))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

// ─── Config hot update (aligned with Credit) ───────────────────

/**
 * Get Feishu webhook config with hot-update support.
 * Priority: DB settings table > env vars (fallback).
 */
async function getFeishuConfig(db: D1Database): Promise<FeishuConfig | null> {
  // Try DB settings first (supports runtime hot update without redeploy)
  try {
    const rowUrl = await db
      .prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
      .bind(FEISHU_SETTINGS_WEBHOOK_URL_KEY)
      .first<{ value: string }>()
    const dbUrl = rowUrl?.value ? String(rowUrl.value).trim() : ''
    if (dbUrl) {
      const rowSecret = await db
        .prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
        .bind(FEISHU_SETTINGS_WEBHOOK_SECRET_KEY)
        .first<{ value: string }>()
      const dbSecret = rowSecret?.value ? String(rowSecret.value).trim() : ''
      return dbSecret ? { webhookUrl: dbUrl, secret: dbSecret } : { webhookUrl: dbUrl }
    }
  } catch {
    // ignore: DB may be unavailable, or settings table missing
  }

  // Fallback: env vars (requires redeploy to change)
  return null
}

// ─── Public API ─────────────────────────────────────────────────

export async function notifyReportToFeishu(
  payload: ReportNotificationPayload,
  env: Bindings,
  origin: string,
): Promise<FeishuSendResult> {
  const adminSecret = env.ADMIN_SECRET
  if (!adminSecret) return { enabled: false, error: 'ADMIN_SECRET not set' }

  // Config: try DB first, then env vars
  const dbConfig = await getFeishuConfig(env.DB)
  const webhookUrl = dbConfig?.webhookUrl || env.FEISHU_REPORT_WEBHOOK_URL
  const feishuSecret = dbConfig?.secret || env.FEISHU_REPORT_WEBHOOK_SECRET

  if (!webhookUrl) return { enabled: false }

  const reasonLabel: Record<string, string> = {
    spam: '垃圾广告',
    harassment: '骚扰/人身攻击',
    misinformation: '虚假信息',
    other: '其他',
  }

  try {
    const [resolveUrl, rejectUrl] = await Promise.all([
      buildActionUrl(origin, payload.reportId, 'resolved', adminSecret),
      buildActionUrl(origin, payload.reportId, 'rejected', adminSecret),
    ])

    const reasonText = reasonLabel[payload.reason] || payload.reason
    const snippet =
      payload.reviewSnippet.length > 200
        ? `${payload.reviewSnippet.slice(0, 198)}…`
        : payload.reviewSnippet
    const stars = '★'.repeat(Math.round(payload.rating)) + '☆'.repeat(5 - Math.round(payload.rating))

    const body: any = {
      msg_type: 'interactive',
      card: {
        schema: '2.0',
        config: {
          update_multi: true,
          enable_forward: true,
          width_mode: 'fill' as const,
        },
        header: {
          template: 'wathet' as const,
          title: { tag: 'plain_text', content: payload.reopened ? '🔁 YOURTJ 课程评价举报（重新打开）' : '🚨 YOURTJ 课程评价举报' },
          subtitle: { tag: 'plain_text', content: `${reasonText} · ${payload.courseName}` },
          padding: '12px 12px 12px 12px',
        },
        body: {
          direction: 'vertical' as const,
          padding: '12px 12px 12px 12px',
          horizontal_spacing: '8px',
          vertical_spacing: '8px',
          horizontal_align: 'left' as const,
          vertical_align: 'top' as const,
          elements: [
            {
              tag: 'markdown',
              content: `**${stars}  ${payload.rating.toFixed(1)}分** · ${payload.semester}`,
              text_align: 'left' as const,
            },
            {
              tag: 'markdown',
              content: snippet,
              text_align: 'left' as const,
            },
            { tag: 'hr' },
            {
              tag: 'column_set',
              horizontal_spacing: '8px',
              columns: [
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 1,
                  elements: [
                    {
                      tag: 'markdown',
                      content: `**举报编号**\n\`${payload.reportId}\``,
                      text_align: 'left' as const,
                    },
                  ],
                },
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 1,
                  elements: [
                    {
                      tag: 'markdown',
                      content: `**评价编号**\n\`${payload.reviewSqid}\``,
                      text_align: 'left' as const,
                    },
                  ],
                },
              ],
            },
            {
              tag: 'column_set',
              horizontal_spacing: '8px',
              columns: [
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 1,
                  elements: [
                    {
                      tag: 'markdown',
                      content: `**课程**\n${payload.courseName} (ID: ${payload.courseId})`,
                      text_align: 'left' as const,
                    },
                  ],
                },
                {
                  tag: 'column',
                  width: 'weighted',
                  weight: 1,
                  elements: [
                    {
                      tag: 'markdown',
                      content: `**举报原因**\n${reasonText}`,
                      text_align: 'left' as const,
                    },
                  ],
                },
              ],
            },
            { tag: 'hr' },
            {
              tag: 'markdown',
              content: '**点击按钮后需在确认页提交处理**',
              text_align: 'left' as const,
            },
            {
              tag: 'action',
              actions: [
                {
                  tag: 'button',
                  type: 'primary',
                  text: { tag: 'plain_text', content: '✅ 通过 (隐藏评价)' },
                  url: resolveUrl,
                },
                {
                  tag: 'button',
                  type: 'danger',
                  text: { tag: 'plain_text', content: '❌ 驳回 (保留评价)' },
                  url: rejectUrl,
                },
              ],
            },
          ],
        },
      },
    }

    if (feishuSecret) {
      const timestamp = String(Math.floor(Date.now() / 1000))
      body.timestamp = timestamp
      body.sign = await signFeishuWebhook(timestamp, feishuSecret)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FEISHU_WEBHOOK_TIMEOUT_MS)
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    const text = await res.text().catch(() => '')
    const snippet2 = text.slice(0, 200)

    if (!res.ok) {
      console.warn(`[feishu] webhook HTTP ${res.status}: ${snippet2}`)
      return { enabled: true, ok: false, status: res.status, responseSnippet: snippet2 }
    }

    // Feishu often responds HTTP 200 even when "code" indicates an error (e.g. rate limit).
    try {
      const parsed = JSON.parse(text || '{}') as any
      if (typeof parsed?.code === 'number' && parsed.code !== 0) {
        console.warn(`[feishu] webhook error code ${parsed.code}: ${String(parsed?.msg || parsed?.message || '').slice(0, 200)}`)
        return { enabled: true, ok: false, status: res.status, responseSnippet: snippet2 }
      }
    } catch {
      // ignore non-JSON success body
    }

    return { enabled: true, ok: true, status: res.status, responseSnippet: snippet2 }
  } catch (e) {
    console.warn('[feishu] failed to send report notification:', e)
    return { enabled: true, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function verifyActionToken(
  reportId: number,
  action: string,
  deadline: string,
  sig: string,
  adminSecret: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  if (Number(deadline || '0') < now) return false

  const payload = `${reportId}:${action}:${deadline}`
  const expected = await signHmac(adminSecret, payload)

  // Constant-time comparison
  if (sig.length !== expected.length) return false
  let result = 0
  for (let i = 0; i < sig.length; i++) {
    result |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return result === 0
}
