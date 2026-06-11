export type CreditWalletLocal = {
  mnemonic: string
  userHash: string
  userSecret: string
  createdAt?: number
}

const STORAGE_KEY = 'yourtj_credit_wallet'

export function loadCreditWallet(): CreditWalletLocal | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!v?.userHash || !v?.userSecret) return null
    return {
      mnemonic: String(v.mnemonic || ''),
      userHash: String(v.userHash),
      userSecret: String(v.userSecret),
      createdAt: typeof v.createdAt === 'number' ? v.createdAt : undefined
    }
  } catch {
    return null
  }
}

export function saveCreditWallet(wallet: CreditWalletLocal) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...wallet, createdAt: wallet.createdAt ?? Date.now() }))
}

export function clearCreditWallet() {
  localStorage.removeItem(STORAGE_KEY)
}

export async function computeReviewEditToken(userSecret: string, reviewId: number): Promise<string> {
  const msg = `jcourse:edit-review:${reviewId}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(msg))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function computeReviewEditProof(editToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`yourtj:can-edit:${editToken}`)
  )
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
