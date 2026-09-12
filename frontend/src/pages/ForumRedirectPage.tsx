import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/button'

const REDIRECT_TARGET = 'https://f.yourtj.de'
const REDIRECT_TARGET_LABEL = 'f.yourtj.de'
const REDIRECT_DELAY_SECONDS = 5
const OFFICIAL_SITE = 'https://yourtj.de'
const FEEDBACK_QQ_GROUP = '726096994'

declare global {
  interface Window {
    /* Set here, read by the boot fallback timer inlined in index.html. */
    __YOURTJ_REDIRECT_MOUNTED__?: boolean
  }
}

interface ServiceNotice {
  period: string
  detail: string
}

/*
 * The timeline is carried over from the original announcement, tightened to
 * what a visitor can actually read before the hand-off.
 */
const SERVICE_NOTICES: ServiceNotice[] = [
  { period: '9 月 5 日起', detail: '选课社区进入只读模式，不再支持发表新评价' },
  { period: '9 月 12 日', detail: '选课社区与 Course App 正式下线' },
  { period: '反馈渠道', detail: `QQ 群 ${FEEDBACK_QQ_GROUP}，欢迎填写使用反馈问卷` },
]

export default function ForumRedirectPage() {
  const [remainingSeconds, setRemainingSeconds] = useState(REDIRECT_DELAY_SECONDS)
  const [isPaused, setIsPaused] = useState(false)

  // Tells the inline fallback in index.html that the bundle booted, so only one
  // redirect timer is ever in flight.
  useEffect(() => {
    window.__YOURTJ_REDIRECT_MOUNTED__ = true
  }, [])

  useEffect(() => {
    if (isPaused) return

    if (remainingSeconds <= 0) {
      window.location.replace(REDIRECT_TARGET)
      return
    }

    const tick = window.setTimeout(() => setRemainingSeconds((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(tick)
  }, [isPaused, remainingSeconds])

  const goToForum = useCallback(() => {
    window.location.replace(REDIRECT_TARGET)
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused((paused) => !paused)
  }, [])

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center px-4 py-6 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="page-wash pointer-events-none fixed inset-0 -z-20" />
      <div aria-hidden="true" className="page-scrim pointer-events-none fixed inset-0 -z-10" />

      <section
        role="dialog"
        aria-labelledby="notice-title"
        aria-describedby="notice-summary"
        // deslop-ignore-next-line 22 radius and border live on this same box, so the corner is hatched by the border
        className="dialog-glass animate-dialog-in relative w-full max-w-[35rem] overflow-hidden rounded-2xl"
      >
        <header className="flex items-center gap-3 border-b border-edge/70 px-4 py-3.5 sm:px-7 sm:py-4">
          <img
            src="/favicon-96x96.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full ring-1 ring-edge"
          />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">YourTJ 选课社区</p>
          <span className="inline-flex shrink-0 items-center rounded-full bg-surface-selected px-2.5 py-1 text-xs font-medium text-link">
            服务公告
          </span>
        </header>

        <div className="animate-rise-in rise-delay-1 px-4 py-5 sm:px-7 sm:py-7">
          <h1
            id="notice-title"
            className="text-[1.375rem] font-semibold leading-snug tracking-tight text-primary sm:text-2xl"
          >
            选课社区已下线
          </h1>

          <p id="notice-summary" className="mt-2.5 text-balance text-[15px] leading-7 text-secondary">
            课程评价与讨论已迁移至新的 YourTJ 论坛，迁移详情已在官网{' '}
            <a
              href={OFFICIAL_SITE}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-link underline decoration-link/40 decoration-1 underline-offset-4 transition-colors hover:decoration-link"
            >
              yourtj.de
            </a>{' '}
            公布。
          </p>

          <dl className="mt-4 divide-y divide-edge/70 rounded-xl border border-edge/70 bg-surface/60 sm:mt-5">
            {SERVICE_NOTICES.map((notice) => (
              <div
                key={notice.period}
                className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[5.5rem_1fr] sm:items-baseline sm:gap-4 sm:px-4 sm:py-3"
              >
                <dt className="text-[13px] font-medium text-tertiary">{notice.period}</dt>
                <dd className="text-pretty text-sm leading-6 text-secondary">{notice.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="animate-rise-in rise-delay-2 border-t border-edge/70 bg-surface/40 px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            {/* The pause control rides beside the countdown on phones, and drops under it once the panel is wide. */}
            <div className="flex min-w-0 items-center justify-between gap-3 sm:block sm:space-y-1.5">
              <p className="text-sm leading-6 text-secondary">
                <span aria-hidden="true">
                  {isPaused ? (
                    '已暂停自动跳转'
                  ) : (
                    <>
                      <span
                        key={remainingSeconds}
                        className="animate-tick-in inline-block font-semibold tabular-nums text-link"
                      >
                        {remainingSeconds}
                      </span>{' '}
                      秒后自动前往{' '}
                      <span className="font-medium text-primary">{REDIRECT_TARGET_LABEL}</span>
                    </>
                  )}
                </span>
                {/* Static text, so the ticking number never spams a screen reader; it flips once on pause. */}
                <span role="status" className="sr-only">
                  {isPaused
                    ? '已暂停自动跳转'
                    : `页面将在 ${REDIRECT_DELAY_SECONDS} 秒后自动前往新的 YourTJ 论坛 ${REDIRECT_TARGET_LABEL}`}
                </span>
              </p>

              <Button
                variant="ghost"
                size="sm"
                onClick={togglePause}
                aria-pressed={isPaused}
                className="-mr-3 sm:-ml-3 sm:mr-0"
              >
                {isPaused ? '恢复自动跳转' : '暂停自动跳转'}
              </Button>
            </div>

            <Button onClick={goToForum} className="group w-full sm:w-auto">
              立即前往论坛
              <span
                aria-hidden="true"
                className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
              >
                →
              </span>
            </Button>
          </div>
        </footer>
      </section>
    </main>
  )
}
