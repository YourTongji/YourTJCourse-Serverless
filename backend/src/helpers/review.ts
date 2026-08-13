import { encodeReviewId } from '../sqids'
import type { Bindings } from './types'

// Reviews columns that are safe to expose via public API.
// wallet_user_hash and edit_token are internal auth fields.
const PUBLIC_REVIEW_COLUMNS = new Set([
  'id', 'course_id', 'semester', 'rating', 'comment', 'score',
  'created_at', 'approve_count', 'disapprove_count',
  'is_hidden', 'is_legacy', 'is_icu',
  'reviewer_name', 'reviewer_avatar', 'sqid',
  'course_name', 'course_code', 'teacher_name'
])

export function addSqidToReviews(reviews: any[]): any[] {
  return reviews.map(review => {
    // Strip internal-only fields as defense in depth
    const sanitized: Record<string, any> = { sqid: encodeReviewId(review.id) }
    for (const key of PUBLIC_REVIEW_COLUMNS) {
      if (key !== 'sqid' && key in review) sanitized[key] = review[key]
    }
    return sanitized
  })
}

export function normalizeReviewerAvatar(value: unknown) {
  const avatar = String(value || '').trim()
  if (!avatar || avatar.startsWith('data:')) return ''
  return avatar.slice(0, 500)
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function getReviewLikeClientKey(c: any) {
  const hostname = (() => {
    try {
      return new URL(c.req.url).hostname
    } catch {
      return ''
    }
  })()
  const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1'

  // IP 来源优先级：
  // 1) Cloudflare 专用头 cf-connecting-ip（Worker 环境）
  // 2) x-forwarded-for 最后一段（VPS 上由 1Panel OpenResty 的
  //    $proxy_add_x_forwarded_for 追加真实客户端 IP，可信；客户端伪造的前段
  //    会被 OpenResty 追加的真实 IP 覆盖在末尾）
  // 3) 本地开发环境回退 x-real-ip / user-agent
  const forwardedParts = String(c.req.header('x-forwarded-for') || '').split(',').map((item) => item.trim()).filter(Boolean)
  const forwardedLast = forwardedParts.length > 0 ? forwardedParts[forwardedParts.length - 1] : ''
  const remoteIp = String(c.req.header('cf-connecting-ip') || '').trim() || forwardedLast

  let address = ''
  let localFallback = ''
  if (isLocalDev) {
    address = remoteIp || String(c.req.header('x-real-ip') || '').trim()
    localFallback = String(c.req.header('user-agent') || '').trim().slice(0, 512)
  } else {
    address = remoteIp
  }
  address = address.trim().slice(0, 128)
  if (!address && !localFallback) return ''

  const salt = String(
    c.env.JCOURSE_INTEGRATION_SECRET ||
    c.env.CREDIT_JCOURSE_SECRET ||
    c.env.ADMIN_SECRET ||
    'yourtj-review-like-v2'
  )
  const key = await sha256Hex(['review-like-v2', salt, address || `local:${localFallback}`].join('\n'))
  return `srv:${key}`
}
