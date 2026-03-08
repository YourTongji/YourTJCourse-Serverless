import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function BottomNavigation() {
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const location = useLocation()

  // 在撰写评价页面不显示底部导航栏
  const isWriteReviewPage = location.pathname.includes('/write-review')

  // 监听滚动事件，实现自动隐藏
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      // 向下滚动且滚动距离超过50px时隐藏
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsVisible(false)
      }
      // 向上滚动时显示
      else if (currentScrollY < lastScrollY) {
        setIsVisible(true)
      }

      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  // 如果在撰写评价页面，不渲染底部导航栏
  if (isWriteReviewPage) return null

  const navItems = [
    {
      path: '/',
      label: '课程',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )    },
    {
      path: '/schedule',
      label: '排课',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      path: '/feedback',
      label: '反馈',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    },
    {
      path: 'https://umami.yourtj.de/share/Sv78TrEoxVnsshxy',
      label: '流量',
      external: true,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      path: '/write-review',
      label: '撰写',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
      requiresCourseId: true
    }
  ]

  return (
    <nav
      data-tour="tour-mobile-bottom-nav"
      className={`md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-lg z-50 transition-transform duration-300 ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-around px-2 pt-2">
        {navItems.map((item) => {
          // 撰写评价按钮需要特殊处理
          if (item.requiresCourseId) {
            // 如果当前在课程详情页，提取课程ID
            const courseMatch = location.pathname.match(/\/course\/(\d+)/)
            const courseId = courseMatch ? courseMatch[1] : null

            if (courseId) {
              return (
                <Link
                  key={item.path}
                  to={`/write-review/${courseId}`}
                  className="flex flex-col items-center justify-center min-w-[64px] py-2 px-3 rounded-xl transition-all active:scale-95 text-slate-600 hover:text-cyan-600"
                >
                  <div className="mb-1">{item.icon}</div>
                  <span className="text-xs font-semibold">{item.label}</span>
                </Link>
              )
            } else {
              // 不在课程详情页时，显示为禁用状态
              return (
                <button
                  key={item.path}
                  disabled
                  className="flex flex-col items-center justify-center min-w-[64px] py-2 px-3 rounded-xl text-slate-300 cursor-not-allowed"
                >
                  <div className="mb-1">{item.icon}</div>
                  <span className="text-xs font-semibold">{item.label}</span>
                </button>
              )
            }
          }

          // 外部链接
          if (item.external) {
            return (
              <a
                key={item.path}
                href={item.path}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center min-w-[64px] py-2 px-3 rounded-xl transition-all active:scale-95 text-slate-600 hover:text-cyan-600"
              >
                <div className="mb-1">{item.icon}</div>
                <span className="text-xs font-semibold">{item.label}</span>
              </a>
            )
          }

          // 普通内部链接
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center min-w-[64px] py-2 px-3 rounded-xl transition-all active:scale-95 ${
                isActive
                  ? 'text-cyan-600 bg-cyan-50'
                  : 'text-slate-600 hover:text-cyan-600'
              }`}
            >
              <div className="mb-1">{item.icon}</div>
              <span className="text-xs font-semibold">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
