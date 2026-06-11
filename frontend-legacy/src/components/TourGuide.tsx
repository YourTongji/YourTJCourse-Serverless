import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Logo from './Logo'

type TourAdvanceMode = 'manual' | 'event' | 'path'

type TourStep = {
  id: string
  title: string
  description: string
  target?: string
  advance: TourAdvanceMode
  eventName?: string
  pathMatch?: RegExp
}

type TutorialLauncherProps = {
  visible: boolean
  onOpen: () => void
}

type TourGuideProps = {
  open: boolean
  onClose: () => void
  onComplete: () => void
  onRequestNavigateHome?: () => void
}

const TOUR_KEYWORD = '评论区测试'

const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav-intro',
    title: '认识导航栏',
    description:
      '顶部是主导航。Home 可快速回首页，前进/后退会按当前搜索状态切换；移动端还有底部导航栏。',
    target: '[data-tour="tour-nav-controls"]',
    advance: 'manual'
  },
  {
    id: 'announcement-open',
    title: '展开公告',
    description: '请点击右上角铃铛展开公告横幅。',
    target: '[data-tour="tour-announcement-bell"]',
    advance: 'event',
    eventName: 'yourtj-tour-announcement-opened'
  },
  {
    id: 'announcement-collapse',
    title: '收起公告',
    description: '请点击公告里的“收起”按钮，回到紧凑视图。',
    target: '[data-tour="tour-announcement-collapse"]',
    advance: 'event',
    eventName: 'yourtj-tour-announcement-collapsed'
  },
  {
    id: 'wallet-intro',
    title: '积分钱包',
    description: '这里可以绑定积分身份，参与信息共享后可领取评课积分。',
    target: '[data-tour="tour-wallet-floating"]',
    advance: 'manual'
  },
  {
    id: 'filter-intro',
    title: '高级筛选',
    description: '这里可按课程名、教师、校区和评价状态做高级过滤。',
    target: '[data-tour="tour-filter-floating"]',
    advance: 'manual'
  },
  {
    id: 'search-autofill',
    title: '准备搜索',
    description: '已自动填写“评论区测试”。请确认后进入下一步。',
    target: '[data-tour="tour-search-input"]',
    advance: 'manual'
  },
  {
    id: 'search-click',
    title: '执行搜索',
    description: '请点击“搜索”按钮。',
    target: '[data-tour="tour-search-button"]',
    advance: 'event',
    eventName: 'yourtj-tour-search-clicked'
  },
  {
    id: 'open-course',
    title: '进入课程详情',
    description: '请点击“评论区测试”课程卡片进入详情页。',
    target: '[data-tour="tour-course-target"]',
    advance: 'path',
    pathMatch: /^\/course\/1286(?:\/)?$/
  },
  {
    id: 'go-write-review',
    title: '开始撰写评价',
    description: '请点击“撰写评价”进入发布页。',
    target: '[data-tour="tour-write-review-button"]',
    advance: 'path',
    pathMatch: /^\/write-review\/1286(?:\/)?$/
  },
  {
    id: 'review-editor',
    title: '填写点评内容',
    description: '请随意写一段支持 Markdown 的评价内容。',
    target: '[data-tour="tour-editor-section"]',
    advance: 'manual'
  },
  {
    id: 'review-rating',
    title: '评分可调整',
    description: '这里可修改课程评分；不改也可以直接下一步。',
    target: '[data-tour="tour-rating-section"]',
    advance: 'manual'
  },
  {
    id: 'review-semester',
    title: '选择学期',
    description: '这里可选择学期，不符合时可选“其他”。',
    target: '[data-tour="tour-semester-section"]',
    advance: 'manual'
  },
  {
    id: 'reviewer-info',
    title: '点评人信息',
    description: '这里可选择是否展示点评人昵称与头像，也可跳过。',
    target: '[data-tour="tour-reviewer-section"]',
    advance: 'manual'
  },
  {
    id: 'review-captcha',
    title: '完成人机验证',
    description: '请先完成此处验证，提交后将自动回到详情页。',
    target: '[data-tour="tour-captcha-section"]',
    advance: 'manual'
  },
  {
    id: 'submit-review',
    title: '发送评论',
    description: '点击提交按钮，发布你的测试评价。',
    target: '[data-tour="tour-submit-button"]',
    advance: 'path',
    pathMatch: /^\/course\/1286(?:\/)?$/
  },
  {
    id: 'latest-review',
    title: '最新评论已定位',
    description: '已聚焦最新评论。接下来体验点赞与分享。',
    target: '[data-tour="tour-latest-review"]',
    advance: 'manual'
  },
  {
    id: 'like-review',
    title: '点个赞试试',
    description: '请点击点赞按钮体验互动。',
    target: '[data-tour="tour-like-button"]',
    advance: 'event',
    eventName: 'yourtj-tour-like-done'
  },
  {
    id: 'open-share',
    title: '打开分享',
    description: '请点击“分享评论”按钮。',
    target: '[data-tour="tour-share-button"]',
    advance: 'event',
    eventName: 'yourtj-tour-share-opened'
  },
  {
    id: 'save-share',
    title: '保存分享图片',
    description: '请在弹层中点击“保存图片”，教程将自动完成。',
    target: '[data-tour="tour-share-save"]',
    advance: 'event',
    eventName: 'yourtj-tour-share-saved'
  },
  {
    id: 'done',
    title: '教程完成',
    description:
      '太棒了 (๑•̀ㅂ•́) ✧ 你已掌握核心流程。想复习时再次点击“教程”悬浮按钮即可。',
    advance: 'manual'
  }
]

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function findVisibleTargetElement(selector?: string): HTMLElement | null {
  if (!selector) return null

  const nodes = Array.from(document.querySelectorAll(selector))
  let fallback: HTMLElement | null = null

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    if (!fallback) fallback = node

    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') continue

    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue

    return node
  }

  return fallback
}

function isInsideStickyOrFixedContext(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current) {
    const pos = window.getComputedStyle(current).position
    if (pos === 'sticky' || pos === 'fixed') return true
    current = current.parentElement
  }
  return false
}

export function TutorialLauncher({ visible, onOpen }: TutorialLauncherProps) {
  if (!visible) return null

  return (
    <>
      <div className="hidden md:block fixed right-6 top-4 z-40">
        <button
          type="button"
          onClick={onOpen}
          data-tour="tour-launcher"
          className="group relative h-16 w-14 rounded-2xl border border-white/50 bg-white/90 text-slate-700 shadow-xl backdrop-blur-xl transition-transform active:scale-95"
          aria-label="打开新手引导"
          title="打开新手引导"
        >
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-slate-50/60 opacity-0 transition-opacity group-hover:opacity-100" />
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pt-1">
            <svg className="h-6 w-6 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M12 6.2v11.6M12 6.2c-1.5-1.1-3.5-1.8-6-2v11.3c2.3.1 4.2.9 6 2.2M12 6.2c1.5-1.1 3.5-1.8 6-2v11.3c-2.3.1-4.2.9-6 2.2" />
            </svg>
            <span className="text-[12px] leading-none text-cyan-700 yourtj-font-brand">教程</span>
          </span>
        </button>
      </div>

      <div className="md:hidden fixed right-4 bottom-56 z-50">
        <button
          type="button"
          onClick={onOpen}
          data-tour="tour-launcher"
          className="group relative h-16 w-14 rounded-2xl border border-white/50 bg-white/90 text-slate-700 shadow-xl backdrop-blur-xl transition-transform active:scale-95"
          aria-label="打开新手引导"
          title="打开新手引导"
        >
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-slate-50/60 opacity-0 transition-opacity group-hover:opacity-100" />
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pt-1">
            <svg className="h-6 w-6 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M12 6.2v11.6M12 6.2c-1.5-1.1-3.5-1.8-6-2v11.3c2.3.1 4.2.9 6 2.2M12 6.2c1.5-1.1 3.5-1.8 6-2v11.3c-2.3.1-4.2.9-6 2.2" />
            </svg>
            <span className="text-[12px] leading-none text-cyan-700 yourtj-font-brand">教程</span>
          </span>
        </button>
      </div>
    </>
  )
}

export default function TourGuide({ open, onClose, onComplete, onRequestNavigateHome }: TourGuideProps) {
  const location = useLocation()
  const coachRef = useRef<HTMLDivElement | null>(null)
  const autoScrollLockedRef = useRef(false)
  const autoScrollHandledStepRef = useRef('')
  const autoScrollSettleTimerRef = useRef<number | null>(null)
  const [index, setIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [mobileCoachTop, setMobileCoachTop] = useState<number | null>(null)
  const [mobileSkipStyle, setMobileSkipStyle] = useState<CSSProperties>({ left: '12px', top: '106px' })
  const eventAdvanceLockRef = useRef<string | null>(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight
  }))

  const step = TOUR_STEPS[index]
  const isMobile = viewport.width < 768

  const goNext = () => {
    if (index >= TOUR_STEPS.length - 1) {
      onComplete()
      return
    }
    setIndex((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1))
  }

  useEffect(() => {
    if (!open) return
    setIndex(0)
    eventAdvanceLockRef.current = null
    autoScrollHandledStepRef.current = ''
    autoScrollLockedRef.current = false
    if (autoScrollSettleTimerRef.current != null) {
      window.clearTimeout(autoScrollSettleTimerRef.current)
      autoScrollSettleTimerRef.current = null
    }
    onRequestNavigateHome?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    if (step.id === 'search-autofill') {
      window.dispatchEvent(
        new CustomEvent('yourtj-tour-fill-search', {
          detail: { keyword: TOUR_KEYWORD }
        })
      )
    }
  }, [open, step.id])

  useEffect(() => {
    if (!open) return
    if (step.id !== 'review-captcha') return
    const target = findVisibleTargetElement(step.target)
    if (!(target instanceof HTMLElement)) return
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }, [open, step.id, step.target])

  useEffect(() => {
    if (!open || !step.target) return

    const stepKey = `${location.pathname}::${step.id}`
    if (autoScrollHandledStepRef.current === stepKey) return

    const unlockAndSync = () => {
      autoScrollLockedRef.current = false
      const target = findVisibleTargetElement(step.target)
      if (target) {
        setTargetRect(target.getBoundingClientRect())
      } else {
        setTargetRect(null)
      }
    }

    let attempts = 0
    const timer = window.setInterval(() => {
      const target = findVisibleTargetElement(step.target)
      attempts += 1
      if (!(target instanceof HTMLElement)) {
        if (attempts > 20) {
          autoScrollHandledStepRef.current = stepKey
          unlockAndSync()
          window.clearInterval(timer)
        }
        return
      }

      const rect = target.getBoundingClientRect()
      const anchored = isInsideStickyOrFixedContext(target)
      const viewTop = isMobile ? 12 : 12
      const viewBottom = window.innerHeight - (isMobile ? 92 : 20)
      const inViewport = rect.bottom > 8 && rect.top < window.innerHeight - 8
      const isOutOfFocus =
        !anchored && (rect.top < viewTop || rect.bottom > viewBottom || !inViewport)

      if (isOutOfFocus || step.id === 'review-captcha') {
        autoScrollHandledStepRef.current = stepKey
        autoScrollLockedRef.current = true
        setTargetRect(null)
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        if (autoScrollSettleTimerRef.current != null) {
          window.clearTimeout(autoScrollSettleTimerRef.current)
        }
        let settleCount = 0
        let lastTop = Number.NaN
        let lastLeft = Number.NaN
        const settle = () => {
          const liveTarget = findVisibleTargetElement(step.target)
          if (!(liveTarget instanceof HTMLElement)) {
            unlockAndSync()
            autoScrollSettleTimerRef.current = null
            return
          }

          const liveRect = liveTarget.getBoundingClientRect()
          const liveAnchored = isInsideStickyOrFixedContext(liveTarget)
          const liveViewTop = isMobile ? 12 : 12
          const liveViewBottom = window.innerHeight - (isMobile ? 92 : 20)
          const liveInViewport = liveRect.bottom > 8 && liveRect.top < window.innerHeight - 8
          const inFocus =
            liveAnchored || (liveRect.top >= liveViewTop && liveRect.bottom <= liveViewBottom && liveInViewport)
          const moved =
            Number.isFinite(lastTop) && Number.isFinite(lastLeft)
              ? Math.abs(liveRect.top - lastTop) + Math.abs(liveRect.left - lastLeft)
              : 999

          lastTop = liveRect.top
          lastLeft = liveRect.left
          settleCount += 1

          if ((inFocus && moved < 0.9) || settleCount >= 18) {
            unlockAndSync()
            autoScrollSettleTimerRef.current = null
            return
          }

          autoScrollSettleTimerRef.current = window.setTimeout(settle, 42)
        }

        autoScrollSettleTimerRef.current = window.setTimeout(settle, 120)
        window.clearInterval(timer)
        return
      }

      autoScrollHandledStepRef.current = stepKey
      unlockAndSync()
      if (attempts > 0) {
        window.clearInterval(timer)
      }
    }, 120)

    return () => {
      window.clearInterval(timer)
      if (autoScrollSettleTimerRef.current != null) {
        window.clearTimeout(autoScrollSettleTimerRef.current)
        autoScrollSettleTimerRef.current = null
      }
    }
  }, [open, isMobile, step.id, step.target, location.pathname])

  useEffect(() => {
    if (!open || !step.target) return

    const element = findVisibleTargetElement(step.target)
    if (!(element instanceof HTMLElement)) return

    const prevZIndex = element.style.zIndex
    const prevPosition = element.style.position
    const computedPosition = window.getComputedStyle(element).position
    const shouldForceRelative = computedPosition === 'static' && !prevPosition

    element.style.zIndex = '130'
    if (shouldForceRelative) {
      element.style.position = 'relative'
    }
    element.setAttribute('data-tour-active-target', '1')

    return () => {
      element.style.zIndex = prevZIndex
      if (shouldForceRelative) {
        element.style.position = prevPosition
      }
      element.removeAttribute('data-tour-active-target')
    }
  }, [open, step.target, index])

  useEffect(() => {
    if (!open) return
    if (step.advance !== 'event' || !step.eventName) return

    eventAdvanceLockRef.current = null
    const handle = () => {
      if (eventAdvanceLockRef.current === step.id) return
      eventAdvanceLockRef.current = step.id
      goNext()
    }
    window.addEventListener(step.eventName, handle as EventListener)
    return () => window.removeEventListener(step.eventName!, handle as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step.advance, step.eventName, step.id, index])

  useEffect(() => {
    if (!open) return
    if (step.advance !== 'path' || !step.pathMatch) return
    if (step.pathMatch.test(location.pathname)) {
      goNext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step.advance, step.pathMatch, location.pathname, index])

  useEffect(() => {
    if (!open) return

    const update = () => {
      if (autoScrollLockedRef.current) return
      if (!step.target) {
        setTargetRect(null)
        return
      }

      const element = findVisibleTargetElement(step.target)
      if (!(element instanceof HTMLElement)) {
        setTargetRect(null)
        return
      }

      setTargetRect(element.getBoundingClientRect())
    }

    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      })
      update()
    }

    update()
    const timer = window.setInterval(update, 48)
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', update, true)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, step.target])

  const spotlightRect = useMemo(() => {
    if (!targetRect) return null
    const padding = 10
    const top = Math.max(8, targetRect.top - padding)
    const left = Math.max(8, targetRect.left - padding)
    const width = Math.max(44, targetRect.width + padding * 2)
    const height = Math.max(44, targetRect.height + padding * 2)

    return {
      top,
      left,
      width,
      height
    }
  }, [targetRect])

  const spotlightStyle = useMemo(() => {
    if (!spotlightRect) return null
    return {
      top: `${spotlightRect.top}px`,
      left: `${spotlightRect.left}px`,
      width: `${spotlightRect.width}px`,
      height: `${spotlightRect.height}px`
    }
  }, [spotlightRect])

  const coachStyle = useMemo<CSSProperties>(() => {
    if (isMobile) {
      if (mobileCoachTop != null) {
        return {
          position: 'fixed',
          left: '12px',
          right: '12px',
          top: `${mobileCoachTop}px`,
          width: 'min(560px, calc(100vw - 24px))',
          transform: 'none',
          maxHeight: 'min(42vh, 340px)',
          margin: '0 auto'
        }
      }

      return {
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: 'max(12px, env(safe-area-inset-bottom) + 72px)',
        width: 'min(560px, calc(100vw - 24px))',
        transform: 'none',
        maxHeight: 'min(40vh, 320px)',
        margin: '0 auto'
      }
    }

    if (!targetRect) {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)'
      }
    }

    const cardWidth = Math.min(380, Math.max(290, viewport.width - 32))
    const preferLeft = clamp(targetRect.left, 16, viewport.width - cardWidth - 16)
    const maxTop = viewport.height - 220
    const top = clamp(targetRect.bottom + 16, 16, Math.max(16, maxTop))

    return {
      width: `${cardWidth}px`,
      left: `${preferLeft}px`,
      top: `${top}px`
    }
  }, [mobileCoachTop, targetRect, viewport.height, viewport.width, isMobile])

  useEffect(() => {
    if (!open || !isMobile) {
      setMobileCoachTop(null)
      return
    }

    if (!spotlightRect) {
      setMobileCoachTop(null)
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const coachHeight = coachRef.current?.offsetHeight || 260
      const safeBottom = 84
      const defaultTop = viewport.height - safeBottom - coachHeight
      const defaultBottom = defaultTop + coachHeight
      const targetTop = spotlightRect.top
      const targetBottom = spotlightRect.top + spotlightRect.height
      const overlap = Math.min(defaultBottom, targetBottom) - Math.max(defaultTop, targetTop)

      if (overlap > 10) {
        const topLimit = 88
        const maxTop = Math.max(topLimit, viewport.height - coachHeight - 16)
        const preferredTop = targetTop - coachHeight - 14
        const nextTop = clamp(preferredTop, topLimit, maxTop)
        setMobileCoachTop(nextTop)
      } else {
        setMobileCoachTop(null)
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [open, isMobile, spotlightRect, viewport.height, index])

  useEffect(() => {
    if (!open || !isMobile) {
      setMobileSkipStyle({ left: '12px', top: '106px' })
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const coachRect = coachRef.current?.getBoundingClientRect() ?? null
      const btnWidth = 92
      const btnHeight = 38
      const margin = 12
      const topNav = 106

      const candidates: CSSProperties[] = [
        { left: `${margin}px`, top: `${topNav}px` },
        { right: `${margin}px`, top: `${topNav}px` },
        coachRect
          ? {
              left: `${margin}px`,
              top: `${Math.min(viewport.height - btnHeight - margin, coachRect.bottom + 8)}px`
            }
          : { left: `${margin}px`, top: `${topNav}px` }
      ]

      const intersects = (style: CSSProperties) => {
        if (!coachRect) return false
        const left = typeof style.left === 'string' ? Number.parseFloat(style.left) : 0
        const top = typeof style.top === 'string' ? Number.parseFloat(style.top) : topNav
        const right =
          typeof style.right === 'string'
            ? viewport.width - Number.parseFloat(style.right) - btnWidth
            : left + btnWidth
        const x = typeof style.right === 'string' ? right : left

        const btnRect = {
          left: x,
          right: x + btnWidth,
          top,
          bottom: top + btnHeight
        }

        return !(
          btnRect.right < coachRect.left - 8 ||
          btnRect.left > coachRect.right + 8 ||
          btnRect.bottom < coachRect.top - 8 ||
          btnRect.top > coachRect.bottom + 8
        )
      }

      const picked = candidates.find((item) => !intersects(item)) ?? candidates[1]
      setMobileSkipStyle(picked)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [open, isMobile, mobileCoachTop, index, viewport.width, viewport.height])

  if (!open) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      {spotlightStyle ? (
        <div
          className="pointer-events-none absolute rounded-3xl bg-transparent shadow-[0_0_0_9999px_rgba(2,6,23,0.54)] transition-all duration-300 ease-out"
          style={spotlightStyle}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-slate-950/54" />
      )}

      {spotlightStyle && (
        <div
          className="pointer-events-none absolute rounded-3xl border border-cyan-200/90 shadow-[0_0_0_1px_rgba(255,255,255,0.85),0_0_24px_rgba(56,189,248,0.72)] transition-all duration-300 ease-out"
          style={spotlightStyle}
        />
      )}

      <button
        type="button"
        onClick={onClose}
        className={`pointer-events-auto absolute z-[122] rounded-2xl border px-4 py-2 text-sm font-black shadow-lg transition border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 ${isMobile ? '' : 'right-4 top-4'}`}
        style={isMobile ? mobileSkipStyle : undefined}
      >
        跳过教程
      </button>

      <div className="pointer-events-none absolute inset-0">
        <div
          ref={coachRef}
          className="pointer-events-auto absolute z-[121] max-h-[calc(100vh-1.5rem)] overflow-y-auto overscroll-contain rounded-3xl border border-white/60 bg-white/92 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)] backdrop-blur-xl transition-[top,left,width,height,transform] duration-300 ease-out dark:border-slate-700/70 dark:bg-slate-900/85"
          style={coachStyle}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100 dark:bg-cyan-900/35 dark:text-cyan-200">
              <Logo size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black tracking-[0.2em] text-slate-400">YOURTJ 教程</div>
              <div className="mt-1 text-base font-black text-slate-900 dark:text-slate-100">{step.title}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-200">{step.description}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-slate-400">
              第 {index + 1} / {TOUR_STEPS.length} 步
            </div>
            {step.advance === 'manual' ? (
              <button
                type="button"
                onClick={goNext}
                className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-700"
              >
                {index === TOUR_STEPS.length - 1 ? '完成' : '下一步'}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50"
              >
                已完成，继续
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
