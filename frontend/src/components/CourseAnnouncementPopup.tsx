import { useEffect, useState } from 'react'

const externalLinkProps = {
  target: '_blank',
  rel: 'noreferrer'
} as const

export default function CourseAnnouncementPopup() {
  const [entered, setEntered] = useState(false)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  if (!open) return null

  return (
    <aside
      aria-labelledby="course-announcement-title"
      className={`fixed bottom-20 right-4 z-[70] w-[min(420px,calc(100vw-2rem))] transform-gpu transition-[transform,opacity] duration-500 ease-out md:bottom-4 ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
    >
      <div className="overflow-hidden rounded-[18px] border-2 border-slate-800 bg-[#fffdf4] shadow-[8px_10px_0_rgba(15,23,42,0.18),0_18px_45px_-18px_rgba(14,165,233,0.65)]">
        <div className="flex items-center gap-2 border-b-2 border-slate-800 bg-gradient-to-r from-[#1d65c1] via-[#2786d8] to-[#52b5e8] px-3 py-1.5 text-white">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-red-300" />
            <span className="h-2 w-2 rounded-full bg-yellow-200" />
            <span className="h-2 w-2 rounded-full bg-emerald-200" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-black tracking-[0.08em]">YOURTJ 公告中心</span>
          <button
            type="button"
            aria-label="关闭公告"
            onClick={() => setOpen(false)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/50 bg-white/15 text-base font-black leading-none text-white transition-colors hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-[#2786d8]"
          >
            ×
          </button>
        </div>

        <div className="relative px-4 pb-4 pt-4 sm:px-5">
          <div className="pointer-events-none absolute -right-7 -top-8 h-24 w-24 rotate-12 rounded-3xl border-4 border-orange-200/80 bg-orange-100/60" aria-hidden="true" />
          <div className="relative">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-orange-800">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" aria-hidden="true" />
              重要公告 · 9 月 5 日起
            </div>
            <h2 id="course-announcement-title" className="mb-3 text-xl font-black tracking-tight text-slate-900">
              YourTJ 选课社区服务安排
            </h2>

            <div className="space-y-2.5 text-[13px] leading-6 text-slate-800">
              <p>
                自 <strong>9 月 5 日</strong> 起，YourTJ 选课社区进入只读模式，关闭新评价创建入口。
              </p>
              <p>
                开放测试新的 YourTJ 论坛（已在官网{' '}
                <a
                  {...externalLinkProps}
                  href="https://yourtj.de"
                  className="font-bold text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-900"
                >
                  yourtj.de
                </a>{' '}
                公布信息，社区访问入口：{' '}
                <a
                  {...externalLinkProps}
                  href="https://f.yourtj.de"
                  className="font-bold text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-900"
                >
                  f.yourtj.de
                </a>）。
              </p>
              <p>
                YourTJ 选课社区包括 YourTJ Course App 服务将于 <strong>9 月 12 日</strong> 下线，欢迎在 QQ 反馈群聊{' '}
                <span className="whitespace-nowrap rounded bg-orange-100 px-1.5 py-0.5 font-mono font-bold text-orange-800">726096994</span>{' '}
                中填写使用反馈问卷，望周知。
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-orange-200 pt-3">
              <a
                {...externalLinkProps}
                href="https://f.yourtj.de"
                className="inline-flex items-center justify-center rounded-xl border-2 border-slate-900 bg-slate-900 px-3.5 py-2 text-xs font-black text-white shadow-[3px_3px_0_rgba(14,165,233,0.65)] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
              >
                进入新论坛
                <span className="ml-1" aria-hidden="true">↗</span>
              </a>
              <a
                {...externalLinkProps}
                href="https://yourtj.de"
                className="inline-flex items-center justify-center rounded-xl border border-orange-300 bg-white px-3.5 py-2 text-xs font-bold text-orange-800 transition-colors hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
              >
                查看官网公告
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
