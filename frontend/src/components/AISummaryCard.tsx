import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../services/api'

interface AiSummaryData {
  rating_consensus: string
  keywords: string[]
  pros: string[]
  cons: string[]
  representative: { text: string; sentiment: string }[]
}

type State = 'init' | 'loading' | 'done' | 'error'

export default function AISummaryCard({ courseId }: { courseId: number }) {
  const [state, setState] = useState<State>('init')
  const [data, setData] = useState<AiSummaryData | null>(null)
  const [isHit, setIsHit] = useState(false)

  const fetchSummary = useCallback(async (refresh = false) => {
    setState('loading')
    try {
      const res = await fetch(
        `${API_BASE}/api/course/${courseId}/summary${refresh ? '?refresh=true' : ''}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json.data)
      setIsHit(json.cache === 'hit')
      setState('done')
    } catch (e: any) {
      console.error('AI summary error:', e)
      setState('error')
    }
  }, [courseId])

  useEffect(() => {
    fetchSummary(false)
  }, [fetchSummary])

  // Loading skeleton
  if (state === 'loading') {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-full bg-slate-200" />
          <div className="h-4 w-28 bg-slate-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-3/4 bg-slate-100 rounded" />
          <div className="h-3 w-1/2 bg-slate-100 rounded" />
          <div className="h-3 w-5/6 bg-slate-100 rounded" />
        </div>
      </div>
    )
  }

  // Error state
  if (state === 'error') {
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

  // Init / no data
  if (!data || !data.keywords?.length) return null

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

  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/30 to-white p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="text-sm font-black text-slate-700">AI 评课总结</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              consensusColors[data.rating_consensus] || 'text-slate-400 bg-slate-50 border-slate-200'
            }`}
          >
            {data.rating_consensus}
          </span>
          {isHit && (
            <span className="text-[10px] text-slate-400 font-bold ml-1">已缓存</span>
          )}
        </div>
        <button
          onClick={() => fetchSummary(true)}
          disabled={false}
          className="text-[11px] font-bold text-cyan-600 hover:text-cyan-700 disabled:opacity-40 flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
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
