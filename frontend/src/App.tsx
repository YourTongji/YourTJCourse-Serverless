import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import BottomNavigation from './components/BottomNavigation'
import Footer from './components/Footer'
import { useRef } from 'react'
import Logo from './components/Logo'
import Turnstile from 'react-turnstile'
import Courses from './pages/Courses'
import Course from './pages/Course'
import WriteReview from './pages/WriteReview'
import About from './pages/About'
import FAQ from './pages/FAQ'
import Schedule from './pages/Schedule'
import Feedback from './pages/Feedback'
import { fetchSiteAnnouncements, SiteAnnouncement, AnnouncementType } from './services/api'
import { renderMarkdownHtml } from './components/CollapsibleMarkdown'

const Admin = lazy(() => import('./pages/Admin'))
const CreditWalletPanel = lazy(() => import('./components/CreditWalletPanel'))

const announcementStyles: Record<AnnouncementType, { shell: string; iconShell: string }> = {
  info: {
    shell: 'border-sky-100 bg-sky-50/90 text-sky-900',
    iconShell: 'bg-sky-500/10 text-sky-600'
  },
  warning: {
    shell: 'border-amber-100 bg-amber-50/90 text-amber-950',
    iconShell: 'bg-amber-500/10 text-amber-600'
  },
  error: {
    shell: 'border-rose-100 bg-rose-50/90 text-rose-950',
    iconShell: 'bg-rose-500/10 text-rose-600'
  },
  success: {
    shell: 'border-emerald-100 bg-emerald-50/90 text-emerald-950',
    iconShell: 'bg-emerald-500/10 text-emerald-600'
  }
}

function AnnouncementIcon({ type }: { type: AnnouncementType }) {
  if (type === 'warning') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A2 2 0 004.5 20h15a2 2 0 001.71-3.14l-7.5-13a2 2 0 00-3.42 0z" />
      </svg>
    )
  }

  if (type === 'error') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M15 9l-6 6M9 9l6 6" />
      </svg>
    )
  }

  if (type === 'success') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5" />
      </svg>
    )
  }

  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11.5v4M12 8.5h.01" />
    </svg>
  )
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(media.matches)

    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  return prefersReducedMotion
}

function useTypewriterText(text: string, speedMs: number, enabled: boolean) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [value, setValue] = useState('')
  const [done, setDone] = useState(false)
  const rafRef = useRef<number | null>(null)
  const idxRef = useRef(0)
  const lastRef = useRef(0)

  useEffect(() => {
    setValue('')
    setDone(false)
    idxRef.current = 0
    lastRef.current = 0
  }, [text, enabled])

  useEffect(() => {
    if (!enabled) return
    if (prefersReducedMotion) {
      setValue(text)
      setDone(true)
      return
    }

    const step = (time: number) => {
      if (!lastRef.current) lastRef.current = time
      const delta = time - lastRef.current

      if (delta >= speedMs) {
        lastRef.current = time
        idxRef.current += 1
        setValue(text.slice(0, idxRef.current))
        if (idxRef.current >= text.length) {
          setDone(true)
          return
        }
      }

      rafRef.current = window.requestAnimationFrame(step)
    }

    rafRef.current = window.requestAnimationFrame(step)
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, prefersReducedMotion, speedMs, text])

  return { value, done }
}

function AnnouncementBar({
  collapsed,
  onCollapsedChange
}: {
  collapsed: boolean
  onCollapsedChange: (nextValue: boolean) => void
}) {
  const [announcements, setAnnouncements] = useState<SiteAnnouncement[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [nextIndex, setNextIndex] = useState<number | null>(null)
  const [isSliding, setIsSliding] = useState(false)
  const [openAnnouncementId, setOpenAnnouncementId] = useState<string | null>(null)
  const slideDurationMs = 520

  useEffect(() => {
    let active = true

    fetchSiteAnnouncements()
      .then((data) => {
        if (!active) return
        const items = Array.isArray(data.announcements) ? data.announcements.filter((item) => item.content?.trim()) : []
        setAnnouncements(items)
      })
      .catch(() => {
        if (!active) return
        setAnnouncements([])
      })

    return () => {
      active = false
    }
  }, [])

  const startSlideTo = (targetIndex: number) => {
    if (announcements.length <= 1) return
    if (openAnnouncementId) return
    if (collapsed) return
    if (isSliding) return
    if (targetIndex === activeIndex) return

    setNextIndex(targetIndex)
    setIsSliding(true)

    window.setTimeout(() => {
      setActiveIndex(targetIndex)
      setIsSliding(false)
      setNextIndex(null)
    }, slideDurationMs)
  }

  useEffect(() => {
    if (announcements.length <= 1 || openAnnouncementId || collapsed) return
    const timer = window.setInterval(() => {
      startSlideTo((activeIndex + 1) % announcements.length)
    }, 4000)

    return () => window.clearInterval(timer)
  }, [announcements.length, openAnnouncementId, collapsed, activeIndex])

  const activeAnnouncement = useMemo(
    () => announcements[activeIndex] ?? announcements[0],
    [activeIndex, announcements]
  )

  const nextAnnouncement = useMemo(() => {
    if (nextIndex == null) return null
    return announcements[nextIndex] ?? null
  }, [announcements, nextIndex])

  useEffect(() => {
    if (!openAnnouncementId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenAnnouncementId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openAnnouncementId])

  const announcementTypeLabel = useMemo(() => {
    if (!activeAnnouncement) return '信息'
    if (activeAnnouncement.type === 'warning') return '提醒'
    if (activeAnnouncement.type === 'error') return '异常'
    if (activeAnnouncement.type === 'success') return '活动'
    return '信息'
  }, [activeAnnouncement])

  const toPreviewHtml = (input: string) => {
    const content = String(input || '')
    if (!content.trim()) return ''

    const html = renderMarkdownHtml(content)
    // Preview area: keep inline-rich text, avoid nested interactive elements.
    return html
      .replace(/<img[^>]*>/gi, '<span class="text-slate-400">[图片]</span>')
      .replace(/<a\b[^>]*>/gi, '<span class="underline underline-offset-2">')
      .replace(/<\/a>/gi, '</span>')
      .replace(/<\/?p[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?(h1|h2|h3|h4|h5|h6|ul|ol|li|blockquote|pre|code)[^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const previewHtmlList = useMemo(
    () => announcements.map((item) => toPreviewHtml(item.content)),
    [announcements]
  )

  const previewHtml = useMemo(() => {
    if (!activeAnnouncement) return ''
    return previewHtmlList[activeIndex] || ''
  }, [activeAnnouncement, previewHtmlList, activeIndex])

  const nextPreviewHtml = useMemo(() => {
    if (nextIndex == null) return ''
    return previewHtmlList[nextIndex] || ''
  }, [nextIndex, previewHtmlList])

  if (!activeAnnouncement) {
    return null
  }

  const styles = announcementStyles[activeAnnouncement.type] ?? announcementStyles.info
  const isModalOpen = openAnnouncementId === activeAnnouncement.id

  if (collapsed) {
    return null
  }

  return (
    <div className="mx-auto mt-7 w-full max-w-7xl px-4 md:mt-7">
      <div className="rounded-3xl border border-white/70 bg-white/70 p-1 shadow-[0_10px_30px_-18px_rgba(14,165,233,0.45)] backdrop-blur-2xl">
        <div className={`rounded-[22px] border px-4 py-2 transition-all duration-300 ${styles.shell}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${styles.iconShell}`}>
              <AnnouncementIcon type={activeAnnouncement.type} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] font-bold tracking-[0.08em] opacity-70 [font-family:'PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei',sans-serif]">
                  {announcementTypeLabel}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {announcements.length > 1 && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {announcements.map((item, dotIndex) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={`切换到第 ${dotIndex + 1} 条公告`}
                          onClick={() => startSlideTo(dotIndex)}
                          className={`h-1.5 rounded-full transition-all ${dotIndex === activeIndex ? 'w-5 bg-current/60' : 'w-1.5 bg-current/25 hover:bg-current/40'}`}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 text-xs font-black text-amber-800 shadow-sm hover:bg-amber-50"
                    onClick={() => onCollapsedChange(true)}
                    aria-label="收起公告"
                  >
                    收起
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="mt-0.5 flex w-full items-center justify-between gap-3 text-left"
                aria-label="查看公告详情"
                onClick={() => setOpenAnnouncementId(activeAnnouncement.id)}
              >
                <div className="relative min-w-0 flex-1 overflow-hidden">
                  <div className="h-5 md:h-6" />
                  <div
                    className={`absolute inset-0 line-clamp-1 break-words text-sm font-semibold leading-5 md:text-[15px] md:leading-6 [font-family:'PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei',sans-serif] transform-gpu will-change-transform will-change-opacity transition-all duration-500 ease-out ${isSliding ? '-translate-y-[130%] opacity-0' : 'translate-y-0 opacity-100'}`}
                    dangerouslySetInnerHTML={{ __html: previewHtml || '暂无内容' }}
                  />
                  {nextAnnouncement && (
                    <div
                      className={`absolute inset-0 line-clamp-1 break-words text-sm font-semibold leading-5 md:text-[15px] md:leading-6 [font-family:'PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei',sans-serif] transform-gpu will-change-transform will-change-opacity transition-all duration-500 ease-out ${isSliding ? 'translate-y-0 opacity-100' : 'translate-y-[130%] opacity-0'}`}
                      dangerouslySetInnerHTML={{
                        __html: nextPreviewHtml || '暂无内容'
                      }}
                    />
                  )}
                </div>
                <div className="shrink-0 rounded-xl border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 text-xs font-black text-amber-800 shadow-sm">
                  详情
                  <span className="ml-1">›</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="公告详情"
          onMouseDown={() => setOpenAnnouncementId(null)}
        >
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-md" />
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/60 bg-white/85 shadow-2xl backdrop-blur-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-3 border-b border-white/40 px-5 py-4 ${styles.shell}`}>
              <div className="flex min-w-0 items-start gap-3">
                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${styles.iconShell}`}>
                  <AnnouncementIcon type={activeAnnouncement.type} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black tracking-[0.18em] opacity-70">YOURTJ</div>
                  <div className="mt-1 text-lg font-black">{announcementTypeLabel}</div>
                </div>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                onClick={() => setOpenAnnouncementId(null)}
              >
                关闭
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto px-5 py-4">
              <div
                className="text-[15px] leading-7 text-slate-700 [font-family:'PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei',sans-serif] [&_a]:text-cyan-700 [&_a]:underline [&_a]:underline-offset-4 [&_h1]:my-3 [&_h1]:text-lg [&_h1]:font-black [&_h2]:my-3 [&_h2]:text-base [&_h2]:font-black [&_h3]:my-3 [&_h3]:text-base [&_h3]:font-black [&_p]:my-2 [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-2xl [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1"
                dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(activeAnnouncement.content) }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const isSchedule = location.pathname.startsWith('/schedule')
  const hideFloatingTools = isSchedule || location.pathname.startsWith('/feedback')
  const isHome = location.pathname === '/'
  const [startupPassed, setStartupPassed] = useState(() => {
    try {
      return sessionStorage.getItem('yourtj_startup_passed') === '1'
    } catch {
      return false
    }
  })
  const [startupLeaving, setStartupLeaving] = useState(false)
  const [startupError, setStartupError] = useState('')
  const [startupVerifying, setStartupVerifying] = useState(false)
  const [announcementCollapsed, setAnnouncementCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('yourtj_announcement_collapsed')
      if (stored == null) return true
      return stored === '1'
    } catch {
      return true
    }
  })

  const setAnnouncementCollapsedPersist = (nextValue: boolean) => {
    setAnnouncementCollapsed(nextValue)
    try {
      localStorage.setItem('yourtj_announcement_collapsed', nextValue ? '1' : '0')
    } catch {
      // ignore
    }
  }

  const showStartupGate = !startupPassed
  const slogan = useTypewriterText('你的，同济的', 55, showStartupGate)
  const turnstileSiteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim()
  const startupVerifyRequestRef = useRef(0)

  const passStartupGate = () => {
    setStartupLeaving(true)
    window.setTimeout(() => {
      setStartupPassed(true)
      setStartupLeaving(false)
      try {
        sessionStorage.setItem('yourtj_startup_passed', '1')
      } catch {
        // ignore
      }
    }, 360)
  }

  const verifyStartupToken = async (token: string) => {
    const apiBase = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
    const url = apiBase ? `${apiBase}/api/startup/verify` : '/api/startup/verify'

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })

    if (!res.ok) return false
    const data = await res.json().catch(() => null) as { success?: boolean } | null
    return data?.success === true
  }

  return (
    <div className="min-h-screen text-slate-800 flex flex-col">
      {showStartupGate && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center px-5 py-10 transition-opacity duration-300 ${
            startupLeaving ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          aria-label="启动前检查"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900" />
          <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,rgba(14,165,233,0.55)_1px,transparent_0)] [background-size:26px_26px] dark:opacity-[0.08]" />

          <div className="relative w-full max-w-md md:max-w-lg">
            <div className="relative overflow-hidden rounded-[34px] bg-white/55 px-6 py-8 text-center shadow-[0_28px_80px_-44px_rgba(14,165,233,0.7)] backdrop-blur-2xl dark:bg-slate-950/35 dark:shadow-[0_28px_90px_-50px_rgba(56,189,248,0.35)]">
              <div className="pointer-events-none absolute -top-16 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-300/30 blur-3xl motion-safe:animate-pulse dark:bg-cyan-500/15" />
              <div className="pointer-events-none absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl motion-safe:animate-pulse dark:bg-sky-500/10" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-cyan-100/35 dark:from-white/5 dark:to-cyan-500/5" />

              <div className="relative">
                <div className="mx-auto flex h-[92px] w-[92px] items-center justify-center rounded-[26px] bg-gradient-to-br from-cyan-100 to-sky-50 text-cyan-700 shadow-sm dark:from-slate-800 dark:to-slate-900 dark:text-cyan-200">
                  <Logo size={66} className="drop-shadow" />
                </div>

                <div className="mt-5 text-[22px] font-black tracking-tight text-slate-900 dark:text-slate-50">
                  YourTJ选课社区
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-center gap-1 text-[20px] font-black text-slate-800 dark:text-slate-100 [font-family:'LXGW WenKai','HanziPen SC','STXingkai','Kaiti SC','KaiTi','STKaiti','Noto Serif SC',serif]">
                    <span>{slogan.value}</span>
                    {!slogan.done && (
                      <span
                        className="inline-block h-5 w-2 -translate-y-0.5 rounded-sm bg-cyan-600/80 animate-pulse dark:bg-cyan-300/80"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="text-[12px] font-semibold tracking-[0.22em] text-slate-500 dark:text-slate-300 [font-family:'Cascadia Mono','Cascadia Code','JetBrains Mono','SFMono-Regular','Menlo','Consolas',ui-monospace,monospace]">
                    xk.yourtj.de
                  </div>
                </div>

                <div className="mt-6 rounded-2xl bg-white/55 px-4 py-4 text-center text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_26px_-18px_rgba(15,23,42,0.25)] dark:bg-slate-950/20 dark:text-slate-200 dark:shadow-[inset_0_1px_0_rgba(148,163,184,0.15),0_10px_28px_-20px_rgba(2,6,23,0.6)]">
                  <div className="text-[13px] font-black text-slate-700 dark:text-slate-100">
                    正在进行启动前检查......
                  </div>
                  <div className="mt-3 flex justify-center">
                      {turnstileSiteKey ? (
                        <Turnstile
                          sitekey={turnstileSiteKey}
                          theme="auto"
                          size="flexible"
                          retry="auto"
                          refreshExpired="auto"
                          action="startup_gate"
                          onVerify={(token, boundTurnstile) => {
                            const requestId = (startupVerifyRequestRef.current += 1)
                            setStartupError('')
                            setStartupVerifying(true)

                            void (async () => {
                              const ok = await verifyStartupToken(token).catch(() => false)
                              if (startupVerifyRequestRef.current !== requestId) return

                              setStartupVerifying(false)
                              if (ok) {
                                passStartupGate()
                                return
                              }

                              setStartupError('验证未通过，请重试')
                              try {
                                boundTurnstile?.reset?.()
                              } catch {
                                // ignore
                              }
                            })()
                          }}
                          onError={() => {
                            setStartupVerifying(false)
                            setStartupError('验证失败，请稍后重试')
                          }}
                          onExpire={() => {
                            setStartupVerifying(false)
                            setStartupError('验证已过期，请重新验证')
                          }}
                        />
                      ) : (
                        <div className="flex h-12 w-full max-w-[320px] items-center justify-center rounded-2xl bg-slate-50/70 text-xs font-semibold text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.35)] dark:bg-slate-900/35 dark:text-slate-300 dark:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]">
                          缺少验证配置（VITE_TURNSTILE_SITE_KEY）
                        </div>
                      )}
                    </div>
                  {startupVerifying && (
                    <div className="mt-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-300">
                      校验中...
                    </div>
                  )}
                  {startupError && (
                    <div className="mt-2 text-center text-xs font-semibold text-rose-600 dark:text-rose-300">
                      {startupError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <Navbar
        announcementCollapsed={announcementCollapsed}
        onToggleAnnouncementCollapsed={() => setAnnouncementCollapsedPersist(false)}
      />
      {isHome && (
        <AnnouncementBar collapsed={announcementCollapsed} onCollapsedChange={setAnnouncementCollapsedPersist} />
      )}
      <main
        className={`${isSchedule ? 'max-w-none px-4 mt-4' : `max-w-7xl px-4 ${isHome ? 'mt-2 md:mt-2' : 'mt-6 md:mt-8'}`} mx-auto flex-1 w-full ${isHome ? 'pb-12' : 'pb-20'} md:pb-0`}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">
              页面加载中...
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Courses />} />
            <Route path="/course/:id" element={<Course />} />
            <Route path="/write-review/:id" element={<WriteReview />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/feedback" element={<Feedback />} />
          </Routes>
        </Suspense>
      </main>
      {!hideFloatingTools && (
        <Suspense fallback={null}>
          <CreditWalletPanel />
        </Suspense>
      )}
      <BottomNavigation />
      <Footer />
    </div>
  )
}


