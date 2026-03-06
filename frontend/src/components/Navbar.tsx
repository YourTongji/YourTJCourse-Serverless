import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Logo from './Logo'

type NavItem = { path: string; label: string; external?: boolean }

type NavbarProps = {
  announcementCollapsed?: boolean
  onToggleAnnouncementCollapsed?: () => void
}

export default function Navbar({ announcementCollapsed, onToggleAnnouncementCollapsed }: NavbarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const navItems: NavItem[] = [
    { path: '/', label: '课程目录' },
    { path: '/schedule', label: '排课模拟' },
    { path: '/feedback', label: '反馈留言' },
    { path: 'https://umami.yourtj.de/share/Sv78TrEoxVnsshxy', label: '流量监测', external: true },
  ]

  const key = useMemo(() => `${location.pathname}${location.search}${location.hash}`, [location.pathname, location.search, location.hash])

  const stackRef = useRef<string[]>([])
  const idxRef = useRef(0)
  const navModeRef = useRef<'push' | 'back' | 'forward' | 'home'>('push')
  const [, forceRender] = useState(0)

  const persistState = () => {
    try {
      const st: any = window.history.state || {}
      window.history.replaceState(
        { ...st, __yourtj_stack: stackRef.current, __yourtj_idx: idxRef.current },
        ''
      )
    } catch {
      // ignore
    }
  }

  // init stack from history.state once
  useEffect(() => {
    try {
      const st: any = window.history.state || {}
      const stack: string[] = Array.isArray(st.__yourtj_stack) ? st.__yourtj_stack : []
      const idx = Number.isFinite(Number(st.__yourtj_idx)) ? Number(st.__yourtj_idx) : 0
      stackRef.current = stack.length ? stack : [key]
      idxRef.current = Math.min(Math.max(0, idx), stackRef.current.length - 1)
      if (stackRef.current[idxRef.current] !== key) {
        stackRef.current = [key]
        idxRef.current = 0
      }
      persistState()
      forceRender((x) => x + 1)
    } catch {
      stackRef.current = [key]
      idxRef.current = 0
      forceRender((x) => x + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // update stack on navigation
  useEffect(() => {
    const stack = stackRef.current
    const idx = idxRef.current

    if (stack[idx] === key) {
      navModeRef.current = 'push'
      forceRender((x) => x + 1)
      return
    }

    if (navModeRef.current === 'back' || navModeRef.current === 'forward') {
      // We already updated idx before calling navigate(); just sync and reset.
      navModeRef.current = 'push'
      persistState()
      forceRender((x) => x + 1)
      return
    }

    // normal navigation: push
    const nextStack = idx < stack.length - 1 ? stack.slice(0, idx + 1) : stack.slice()
    nextStack.push(key)
    stackRef.current = nextStack
    idxRef.current = nextStack.length - 1
    persistState()
    forceRender((x) => x + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const isHome = location.pathname === '/'
  const canBack = idxRef.current > 0
  const canForward = idxRef.current < stackRef.current.length - 1

  const navBack = () => {
    if (!canBack) return
    idxRef.current -= 1
    navModeRef.current = 'back'
    persistState()
    navigate(stackRef.current[idxRef.current], { replace: true })
    forceRender((x) => x + 1)
  }

  const navForward = () => {
    if (!canForward) return
    idxRef.current += 1
    navModeRef.current = 'forward'
    persistState()
    navigate(stackRef.current[idxRef.current], { replace: true })
    forceRender((x) => x + 1)
  }

  const goHome = () => {
    if (isHome) return
    navModeRef.current = 'home'
    navigate('/')
  }

  const navBtnBase = 'w-9 h-9 rounded-2xl flex items-center justify-center border bg-white/60 backdrop-blur hover:bg-white/80 active:scale-95 transition'
  const navBtnEnabled = 'border-slate-200 text-slate-600'
  const navBtnDisabled = 'border-slate-100 text-slate-300 cursor-not-allowed opacity-70'
  const showAnnouncementBell = Boolean(announcementCollapsed && onToggleAnnouncementCollapsed)

  return (
    <nav className="sticky top-4 z-50 px-4 mx-auto max-w-7xl">
      <div className="relative">
        <div className="flex items-center justify-start px-4 md:px-6 py-3 bg-white/80 backdrop-blur-2xl border border-white/50 shadow-lg shadow-cyan-900/5 rounded-2xl md:rounded-full">
          <Link to="/" className="flex items-center gap-3 min-w-0 flex-1">
            <Logo size={40} className="shrink-0" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">YOURTJ选课社区</h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">xk.yourtj.de</p>
            </div>
            <div className="block sm:hidden">
              <h1 className="text-[17px] font-bold text-slate-800 tracking-tight whitespace-nowrap">YOURTJ选课社区</h1>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            {/* In-app navigation arrows (never leave the site) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={navBack}
                disabled={!canBack}
                className={`${navBtnBase} ${canBack ? navBtnEnabled : navBtnDisabled}`}
                aria-label="后退"
                title="后退"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={navForward}
                disabled={!canForward}
                className={`${navBtnBase} ${canForward ? navBtnEnabled : navBtnDisabled}`}
                aria-label="前进"
                title="前进"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goHome}
                disabled={isHome}
                className={`${navBtnBase} ${!isHome ? navBtnEnabled : navBtnDisabled}`}
                aria-label="回到首页"
                title="回到首页"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5l9-7 9 7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10" />
                </svg>
              </button>
            </div>

            <div className="hidden md:flex items-center gap-1 bg-slate-100/50 p-1 rounded-full">
              {navItems.map((item) => {
                if (item.external) {
                  return (
                    <a
                      key={item.path}
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2 rounded-full text-sm font-semibold transition-all text-slate-600 hover:text-cyan-600 hover:bg-white/60"
                    >
                      {item.label}
                    </a>
                  )
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                      location.pathname === item.path
                        ? 'bg-white text-cyan-700 shadow-sm'
                        : 'text-slate-600 hover:text-cyan-600 hover:bg-white/60'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>

            {showAnnouncementBell && (
              <button
                type="button"
                onClick={onToggleAnnouncementCollapsed}
                className={`${navBtnBase} ${navBtnEnabled} shrink-0 relative`}
                aria-label="展开公告"
                title="展开公告"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 01-6 0"
                  />
                </svg>
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-sky-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
