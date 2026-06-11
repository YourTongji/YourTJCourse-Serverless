import { useState, useCallback, useRef } from 'react'
import { API_BASE } from '../services/api'

interface AiSummaryData {
  rating_consensus: string
  keywords: string[]
  pros: string[]
  cons: string[]
  representative: { text: string; sentiment: string }[]
}

export default function AISummaryCard({ courseId }: { courseId: number }) {
  const [collapsed, setCollapsed] = useState(true)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [data, setData] = useState<AiSummaryData | null>(null)
  const [isHit, setIsHit] = useState(false)
  const [loadingRefresh, setLoadingRefresh] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const fetchIdRef = useRef(0)

  const fetchSummary = useCallback(async (refresh = false) => {
    if (refresh && loadingRefresh) return
    const fetchId = ++fetchIdRef.current

    if (refresh) {
      setLoadingRefresh(true)
      setRefreshError(false)
    } else {
      setCollapsed(false)
      setState('loading')
    }

    try {
      const res = await fetch(
        `${API_BASE}/api/course/${courseId}/summary${refresh ? '?refresh=true' : ''}`
      )
      if (fetchId !== fetchIdRef.current) return

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 429) {
          if (refresh) {
            setRefreshError(true)
            setLoadingRefresh(false)
          } else {
            setState('error')
          }
          return
        }
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json.data)
      setIsHit(json.cache === 'hit' || json.cache === 'db')
      setState('done')
    } catch (e: any) {
      console.error('AI summary error:', e)
      if (fetchId !== fetchIdRef.current) return
      if (refresh) {
        setRefreshError(true)
      } else {
        setState('error')
      }
    } finally {
      setLoadingRefresh(false)
    }
  }, [courseId])

  const consensusColors: Record<string, string> = {
    '一致好评': 'text-emerald-600 bg-emerald-50 border-emerald-200',
    '好评居多': 'text-green-600 bg-green-50 border-green-200',
    '褒贬不一': 'text-amber-600 bg-amber-50 border-amber-200',
    '差评居多': 'text-orange-600 bg-orange-50 border-orange-200',
    '数据不足': 'text-slate-400 bg-slate-50 border-slate-200',
  }

  const sentimentIcons: Record<string, string> = {
    '👍': 'bg-emerald-50 text-emerald-600',
    '😐': 'bg-amber-50 text-amber-600',
    '👎': 'bg-red-50 text-red-500',
  }

  // Collapsed trigger button (both initial idle and collapsed-with-data)
  if (collapsed) {
    const hasData = data && data.keywords?.length
    return (
      <button
        type="button"
        onClick={() => {
          setCollapsed(false)
          // Only fetch if we haven't loaded data yet
          if (!hasData && state === 'idle') {
            fetchSummary(false)
          }
        }}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 text-left transition hover:border-cyan-200 hover:bg-cyan-50/60"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-5 w-5 shrink-0 flex items-center justify-center">
            <img src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/qwen.svg" alt="Qwen" className="h-5 w-5" />
          </div>
          <p className="truncate text-sm font-black text-slate-700">
            AI 评课总结
          </p>
          {hasData && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-1 ${
                consensusColors[data.rating_consensus] || 'text-slate-400 bg-slate-50 border-slate-200'
              }`}
            >
              {data.rating_consensus}
            </span>
          )}
        </div>
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    )
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/30 to-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/qwen.svg" alt="Qwen" className="h-5 w-5" />
            <span className="text-sm font-black text-slate-700">AI 评课总结</span>
            <div className="flex items-center gap-0.5 ml-1">
              <span className="text-xs text-cyan-500 font-bold">正在思考</span>
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot" style={{ animationDelay: '200ms' }} />
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot" style={{ animationDelay: '400ms' }} />
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1.5">
            <div className="h-6 w-14 rounded-full bg-gradient-to-r from-cyan-100/40 via-cyan-200/40 to-cyan-100/40 animate-summary-shimmer" />
            <div className="h-6 w-20 rounded-full bg-gradient-to-r from-cyan-100/40 via-cyan-200/40 to-cyan-100/40 animate-summary-shimmer" style={{ animationDelay: '0.15s' }} />
            <div className="h-6 w-16 rounded-full bg-gradient-to-r from-cyan-100/40 via-cyan-200/40 to-cyan-100/40 animate-summary-shimmer" style={{ animationDelay: '0.3s' }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white/50 rounded-xl p-3 border border-emerald-100/50 space-y-2">
              <div className="h-3 w-10 rounded bg-gradient-to-r from-emerald-100/40 via-emerald-200/40 to-emerald-100/40 animate-summary-shimmer" />
              <div className="h-3 w-full rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" />
              <div className="h-3 w-5/6 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" style={{ animationDelay: '0.1s' }} />
              <div className="h-3 w-4/6 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" style={{ animationDelay: '0.2s' }} />
            </div>
            <div className="bg-white/50 rounded-xl p-3 border border-red-100/50 space-y-2">
              <div className="h-3 w-10 rounded bg-gradient-to-r from-red-100/40 via-red-200/40 to-red-100/40 animate-summary-shimmer" />
              <div className="h-3 w-full rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" style={{ animationDelay: '0.05s' }} />
              <div className="h-3 w-4/5 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" style={{ animationDelay: '0.15s' }} />
              <div className="h-3 w-3/5 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" style={{ animationDelay: '0.25s' }} />
            </div>
          </div>
          <div className="bg-white/40 rounded-xl p-3 border border-slate-100/50 space-y-2">
            <div className="h-3 w-20 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" />
            <div className="h-3 w-full rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" style={{ animationDelay: '0.1s' }} />
            <div className="h-3 w-11/12 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
        <p className="mt-3 text-[10px] text-slate-300 text-center animate-pulse">
          AI 正在分析学生评价，请稍候...
        </p>
      </div>
    )
  }

  // Error state (no data yet)
  if (state === 'error' && !data) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/50 p-5 text-center">
        <p className="text-xs text-red-400 mb-2">AI 总结生成失败</p>
        <button
          onClick={() => fetchSummary(true)}
          className="text-xs font-bold text-red-500 hover:text-red-600 underline"
        >
          重新尝试
        </button>
      </div>
    )
  }

  // No reviews / no data
  if (!data || !data.keywords?.length) {
    // If we somehow got here with no data (shouldn't happen), show collapsed again
    return (
      <button
        type="button"
        onClick={() => fetchSummary(false)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 text-left transition hover:border-cyan-200 hover:bg-cyan-50/60"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-5 w-5 shrink-0 flex items-center justify-center">
            <img src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/qwen.svg" alt="Qwen" className="h-5 w-5" />
          </div>
          <p className="truncate text-sm font-black text-slate-700">AI 评课总结</p>
        </div>
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    )
  }

  // Done: show full content
  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/30 to-white p-5">
      {/* Refresh error banner */}
      {refreshError && (
        <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-[11px] text-amber-600 font-bold">刷新失败，已显示上一次结果</p>
          <button
            onClick={() => fetchSummary(true)}
            disabled={loadingRefresh}
            className="text-[11px] font-bold text-amber-700 hover:text-amber-800 underline"
          >
            重试
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/qwen.svg" alt="Qwen" className="h-5 w-5" />
          <span className="text-sm font-black text-slate-700">AI 评课总结</span>
          {loadingRefresh ? (
            <div className="flex items-center gap-0.5 ml-1">
              <span className="text-xs text-cyan-500 font-bold">正在思考</span>
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot" style={{ animationDelay: '200ms' }} />
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot" style={{ animationDelay: '400ms' }} />
              </span>
            </div>
          ) : (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                consensusColors[data.rating_consensus] || 'text-slate-400 bg-slate-50 border-slate-200'
              }`}
            >
              {data.rating_consensus}
            </span>
          )}
          {!loadingRefresh && isHit && (
            <span className="text-[10px] text-slate-400 font-bold ml-1">已缓存</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="折叠"
            aria-label="折叠AI评课总结"
            className="text-[11px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => fetchSummary(true)}
            disabled={loadingRefresh}
            className="text-[11px] font-bold text-cyan-600 hover:text-cyan-700 disabled:opacity-40 flex items-center gap-1"
          >
            <svg className={`w-3.5 h-3.5 ${loadingRefresh ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loadingRefresh ? '生成中' : '刷新'}
          </button>
        </div>
      </div>

      {/* Keywords */}
      {data.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {data.keywords.map((kw, i) => (
            <span key={i} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white border border-cyan-200 text-cyan-700">
              #{kw}
            </span>
          ))}
        </div>
      )}

      {/* Pros & Cons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {data.pros.length > 0 && (
          <div className="bg-white/70 rounded-xl p-3 border border-emerald-100">
            <p className="text-[11px] font-black text-emerald-600 mb-1.5 flex items-center gap-1">
              <span>👍</span> 优点
            </p>
            <ul className="space-y-1">
              {data.pros.map((p, i) => (
                <li key={i} className="text-xs text-slate-600 leading-relaxed">• {p}</li>
              ))}
            </ul>
          </div>
        )}
        {data.cons.length > 0 && (
          <div className="bg-white/70 rounded-xl p-3 border border-red-100">
            <p className="text-[11px] font-black text-red-500 mb-1.5 flex items-center gap-1">
              <span>👎</span> 缺点
            </p>
            <ul className="space-y-1">
              {data.cons.map((c, i) => (
                <li key={i} className="text-xs text-slate-600 leading-relaxed">• {c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Representative quotes */}
      {data.representative.length > 0 && (
        <div className="bg-white/50 rounded-xl p-3 border border-slate-100">
          <p className="text-[11px] font-black text-slate-500 mb-2 flex items-center gap-1">
            <span>💬</span> 代表性评价
          </p>
          <div className="space-y-2">
            {data.representative.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${sentimentIcons[r.sentiment] || 'bg-slate-50 text-slate-400'}`}>
                  {r.sentiment}
                </span>
                <span className="text-xs text-slate-600 leading-relaxed">"{r.text}"</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer disclaimer */}
      <p className="mt-3 text-[10px] text-slate-400 text-center">
        AI 生成，仅供参考 · 评价有变化后请刷新
      </p>
    </div>
  )
}
