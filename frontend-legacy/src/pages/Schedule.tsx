import { useEffect, useState } from 'react'
import GlassCard from '../components/GlassCard'

export default function Schedule() {
  const [simExists, setSimExists] = useState<boolean | null>(null)
  const [mountIframe, setMountIframe] = useState(false)
  const simUrl = '/sim/index.html'

  useEffect(() => {
    setMountIframe(false)
    fetch(simUrl, { method: 'HEAD' })
      .then((r) => setSimExists(r.ok))
      .catch(() => setSimExists(false))
  }, [simUrl])

  useEffect(() => {
    if (simExists !== true) return

    let cancelled = false
    const start = () => {
      if (!cancelled) setMountIframe(true)
    }

    const w = window as any
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(start, { timeout: 1200 })
    } else {
      setTimeout(start, 400)
    }

    return () => {
      cancelled = true
    }
  }, [simExists])

  return (
    <div className="w-full">
      {simExists === false && (
        <GlassCard hover={false}>
          <div className="text-sm text-slate-700 font-semibold mb-1">排课模拟器资源未生成</div>
          <div className="text-xs text-slate-500">
            本地开发请先运行 `npm run dev:with-sim`（会自动构建 scheduler 的 /sim 静态文件）
          </div>
        </GlassCard>
      )}
      <div className="flex items-center justify-between gap-3 px-1 mb-3">
        <div>
          <h2 className="text-lg md:text-xl font-extrabold text-slate-800 tracking-tight">排课模拟器</h2>
          <p className="text-xs md:text-sm text-slate-500">模拟排课工具，支持同时查看评价</p>
        </div>
        <a
          className="text-xs md:text-sm font-semibold text-cyan-700 hover:text-cyan-800 underline underline-offset-4 whitespace-nowrap"
          href={simUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          新窗口打开
        </a>
      </div>

      <div className="relative w-full rounded-2xl overflow-hidden border border-white/50 bg-white/70 shadow-lg shadow-cyan-900/5">
        {mountIframe && (
          <iframe
            title="Schedule Simulator"
            src={simUrl}
            loading="lazy"
            className="w-full h-[calc(100vh-220px)] [height:calc(100svh-220px)] md:h-[calc(100vh-220px)] bg-white"
          />
        )}
      </div>
    </div>
  )
}
