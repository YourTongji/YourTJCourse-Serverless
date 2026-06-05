import { encodeReviewId } from '../sqids'
import type { Bindings } from './types'

export function addSqidToReviews(reviews: any[]): any[] {
  return reviews.map(review => ({
    ...review,
    sqid: encodeReviewId(review.id)
  }))
}

async function sha256Hex(value: string) {
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
  const forwardedFor = isLocalDev
    ? String(c.req.header('x-forwarded-for') || '').split(',')[0].trim()
    : ''
  const address = String(c.req.header('cf-connecting-ip') || (isLocalDev ? c.req.header('x-real-ip') || forwardedFor : ''))
    .trim()
    .slice(0, 128)
  const localFallback = isLocalDev ? String(c.req.header('user-agent') || '').trim().slice(0, 512) : ''
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
