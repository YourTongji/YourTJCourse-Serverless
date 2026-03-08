import { useEffect, useMemo, useState } from 'react'
import { clearCreditWallet, loadCreditWallet, saveCreditWallet } from '../utils/creditWallet'
import { fetchCreditBalance, fetchCreditSummary } from '../services/credit'
import { useDraggableDesktop } from '../utils/useDraggableDesktop'

type SummaryData = {
  balance: number
  date: string
  today: {
    reviewReward: number
    likePendingDelta: number
    likePendingPositive: number
    likePendingNegative: number
  }
}

export default function CreditWalletPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [wallet, setWallet] = useState(() => loadCreditWallet())
  const [balance, setBalance] = useState<number | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [embedOpen, setEmbedOpen] = useState(false)
  const drag = useDraggableDesktop('yourtj_floating_wallet_pos', { x: 0, y: 0 })

  const formatError = (e: any) => {
    const msg = String(e?.message || e || '加载失败')
    if (/Unexpected token\s*['"]?</i.test(msg) || /<!doctype/i.test(msg) || /text\/html/i.test(msg)) {
      return '积分站接口返回了 HTML（疑似 API Base 配置不正确）。请把 VITE_CREDIT_API_BASE 配置为 https://core.credit.yourtj.de'
    }
    return msg
  }

  const openPanel = () => {
    window.dispatchEvent(new CustomEvent('yourtj-floating-open', { detail: { panel: 'wallet' } }))
    setIsOpen(true)
  }

  useEffect(() => {
    const onOpen = () => openPanel()
    window.addEventListener('open-credit-wallet', onOpen as any)
    return () => window.removeEventListener('open-credit-wallet', onOpen as any)
  }, [])

  useEffect(() => {
    const onOtherOpen = (e: any) => {
      const panel = String(e?.detail?.panel || '')
      if (panel === 'filter') {
        setIsOpen(false)
        setEmbedOpen(false)
      }
    }
    window.addEventListener('yourtj-floating-open', onOtherOpen as any)
    return () => window.removeEventListener('yourtj-floating-open', onOtherOpen as any)
  }, [])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const origin = String((e as any).origin || '')
      if (!origin.includes('credit.yourtj.de') && !origin.includes('vercel.app')) return

      const data: any = (e as any).data
      if (!data || data.type !== 'yourtj-credit-wallet' || !data.wallet?.userHash) return

      saveCreditWallet(data.wallet)
      setWallet(data.wallet)
      setBalance(null)
      setSummary(null)
      setEmbedOpen(false)
      openPanel()
      void refresh(data.wallet.userHash)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = async (userHash?: string) => {
    const hash = String(userHash || wallet?.userHash || '').trim()
    if (!hash) return
    try {
      setError('')
      const [bal, sum] = await Promise.all([fetchCreditBalance(hash), fetchCreditSummary(hash)])
      const b = Number(bal?.data?.balance ?? bal?.data?.balance ?? bal?.balance ?? 0)
      const s = sum?.data as SummaryData
      setBalance(Number.isFinite(b) ? b : 0)
      setSummary(s || null)
    } catch (e: any) {
      setError(formatError(e))
    }
  }

  // Refresh only when user opens the wallet panel (avoid polling).
  useEffect(() => {
    if (!isOpen) return
    if (!wallet?.userHash) return
    refresh(wallet.userHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, wallet?.userHash])

const handleBind = async () => {
    setLoading(true)
    setError('')
    try {
      setEmbedOpen(true)
    } catch (e: any) {
      setError(e?.message || '绑定失败')
    } finally {
      setLoading(false)
    }
  }

  const todayEstimated = useMemo(() => {
    const review = Number(summary?.today?.reviewReward || 0)
    const likeCount = Number(summary?.today?.likePendingDelta || 0)
    return review + likeCount * 3
  }, [summary])

  const likePendingPoints = useMemo(() => {
    const likeCount = Number(summary?.today?.likePendingDelta || 0)
    return likeCount * 3
  }, [summary])

  const logout = () => {
    clearCreditWallet()
    setWallet(null)
    setBalance(null)
    setSummary(null)
    setError('')
    setEmbedOpen(false)
    setIsOpen(true)
  }

  const icon = (
    <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c2.21 0 4-1.12 4-2.5S14.21 3 12 3 8 4.12 8 5.5 9.79 8 12 8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 10c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 14c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" />
    </svg>
  )

  const content = (
    <div className="p-4 space-y-4 max-h-[calc(100vh-190px)] overflow-y-auto">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-slate-500 uppercase tracking-wider">积分钱包</div>
            <div className="text-sm font-extrabold text-slate-800">YOURTJ Credit</div>
          </div>
          <button
            type="button"
            className="w-9 h-9 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
            onClick={() => setIsOpen(false)}
            aria-label="关闭"
          >
            x
          </button>
        </div>

        {!wallet ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-slate-600 leading-relaxed">
              请绑定YOURTJ积分站以获取评课激励积分
            </div>
            <button
              type="button"
              onClick={handleBind}
              disabled={loading}
              className="w-full py-2.5 rounded-2xl bg-slate-800 text-white font-extrabold hover:bg-slate-700 disabled:opacity-60"
            >
              {loading ? '处理中...' : '打开积分站注册 / 绑定钱包'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <a
                className="py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-extrabold text-center hover:bg-slate-50"
                href="https://credit.yourtj.de"
                target="_blank"
                rel="noreferrer"
              >
                访问积分站
              </a>
              <a
                className="py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-extrabold text-center hover:bg-slate-50"
                href="https://credit.yourtj.de/#/dashboard/history"
                target="_blank"
                rel="noreferrer"
              >
                查看流水
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">当前余额</div>
              <div className="mt-1 text-lg font-extrabold text-slate-900">{balance ?? '-'}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
              <div className="text-[10px] font-black text-amber-700 uppercase tracking-wider">今日预计</div>
              <div className="mt-1 text-lg font-extrabold text-amber-900">
                {todayEstimated >= 0 ? `+${todayEstimated}` : todayEstimated}
              </div>
            </div>
          </div>
        )}

        {wallet && summary && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white border border-slate-200 p-2">
              <div className="text-[10px] font-black text-slate-500">点评</div>
              <div className="text-sm font-extrabold text-slate-800">+{summary.today.reviewReward}</div>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-2">
              <div className="text-[10px] font-black text-slate-500">点赞</div>
              <div className="text-sm font-extrabold text-slate-800">
                {likePendingPoints >= 0 ? `+${likePendingPoints}` : likePendingPoints}
                <span className="ml-1 text-[10px] font-black text-slate-400">({summary.today.likePendingDelta} 赞)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refresh(wallet.userHash)}
              className="rounded-xl bg-white border border-slate-200 p-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
            >
              刷新
            </button>
          </div>
        )}

        {wallet && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <a
                className="py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-extrabold text-center hover:bg-slate-50"
                href="https://credit.yourtj.de/#/dashboard/marketplace"
                target="_blank"
                rel="noreferrer"
              >
                广场交易积分
              </a>
              <a
                className="py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-extrabold text-center hover:bg-slate-50"
                href="https://credit.yourtj.de/#/dashboard/history"
                target="_blank"
                rel="noreferrer"
              >
                查看流水
              </a>
            </div>
            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 rounded-2xl bg-white border border-rose-200 text-rose-700 font-extrabold text-center hover:bg-rose-50"
            >
              退出登录
            </button>
          </div>
        )}

        {error && <div className="mt-3 text-sm text-rose-600 font-semibold">{error}</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-extrabold text-slate-800">积分规则</div>
        <div className="p-4">
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-sm font-bold text-slate-700">1 条 50 字以上点评</div>
              <div className="text-sm font-extrabold text-slate-900">+10（立即获得）</div>
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div className="text-sm font-bold text-amber-800">收到 1 个点赞</div>
              <div className="text-sm font-extrabold text-amber-900">+3（每日结算）</div>
            </div>
          </div>
          {wallet && (
            <div className="mt-3 text-[11px] text-slate-500 break-all">
              钱包 ID：<span className="font-mono">{wallet.userHash}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {embedOpen && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-sm" onClick={() => setEmbedOpen(false)} />
          <div className="fixed inset-x-4 top-10 bottom-10 z-[100] rounded-3xl bg-white shadow-2xl border border-white/60 overflow-hidden">
            <div className="h-12 px-4 flex items-center justify-between border-b border-slate-200 bg-white">
              <div className="text-sm font-extrabold text-slate-800">YOURTJ 社区积分站 - 注册/绑定</div>
              <button
                type="button"
                className="w-9 h-9 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                onClick={() => setEmbedOpen(false)}
                aria-label="关闭"
              >
                x
              </button>
            </div>
            <iframe title="YOURTJ Credit" src="https://credit.yourtj.de/#/" className="w-full h-[calc(100%-3rem)] bg-white" />
          </div>
        </>
      )}

      {/* Desktop: right floating panel (stack under filter) */}
      <div className="hidden md:block fixed right-6 top-44 z-40">
        <div
          className={`bg-white/90 backdrop-blur-xl border border-slate-200 shadow-xl rounded-2xl transition-all duration-300 ${
            isOpen ? 'w-[380px]' : 'w-14'
          }`}
          style={drag.style as any}
        >
          <button
            type="button"
            data-tour="tour-wallet-floating"
            {...(drag.dragHandleProps as any)}
            onClick={() => {
              if (drag.consumeDragFlag()) return
              if (isOpen) setIsOpen(false)
              else openPanel()
            }}
            className="relative h-14 w-full flex items-center justify-center hover:bg-slate-50 rounded-2xl transition-colors"
            title={isOpen ? '收起钱包' : '打开钱包'}
          >
            {icon}
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-700 yourtj-font-brand">
              积分
            </span>
            {summary && todayEstimated !== 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                {todayEstimated > 0 ? `+${todayEstimated}` : todayEstimated}
              </span>
            )}
          </button>
          {isOpen && content}
        </div>
      </div>

      {/* Mobile: floating button + bottom sheet */}
      <div className="md:hidden fixed right-4 bottom-40 z-50">
        <button
          type="button"
          data-tour="tour-wallet-floating"
          onClick={openPanel}
          className="relative h-14 w-14 rounded-2xl bg-white/90 backdrop-blur-xl border border-white/50 shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          aria-label="打开积分钱包"
        >
          {icon}
          <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-700 yourtj-font-brand">
            积分
          </span>
          {summary && todayEstimated !== 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
              {todayEstimated > 0 ? `+${todayEstimated}` : todayEstimated}
            </span>
          )}
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
            <div className="fixed inset-x-3 bottom-3 max-h-[78vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-white/60">
              {content}
            </div>
          </>
        )}
      </div>
    </>
  )
}
