import { useEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'
import MaintenanceLogo from './MaintenanceLogo'
import MaintenanceCard from './MaintenanceCard'
import {
  DEFAULT_MAINTENANCE_CONFIG,
  type MaintenanceDisplayConfig
} from './maintenance'
import { type SiteAnnouncement } from '../services/api'

function StatusIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
    </svg>
  )
}

function ProgressIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function ContactIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 01-6 0" />
    </svg>
  )
}

type MaintenancePageProps = {
  announcements?: SiteAnnouncement[]
  maintenanceConfig?: MaintenanceDisplayConfig | null
}

export default function MaintenancePage({ announcements = [], maintenanceConfig }: MaintenancePageProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const cfg = useMemo(() => ({
    ...DEFAULT_MAINTENANCE_CONFIG,
    ...(maintenanceConfig || {})
  }), [maintenanceConfig])

  useEffect(() => {
    if (!pageRef.current) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })

      // 1. 顶部装饰光晕浮动
      tl.fromTo('.ambient-glow-1',
        { opacity: 0, scale: 0.6 },
        { opacity: 0.25, scale: 1, duration: 1.5, ease: 'sine.inOut' },
        0
      )
      tl.to('.ambient-glow-1', {
        y: -12, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1,
      }, 1.5)
      tl.fromTo('.ambient-glow-2',
        { opacity: 0, scale: 0.4 },
        { opacity: 0.15, scale: 1, duration: 2, ease: 'sine.inOut' },
        0.3
      )
      tl.to('.ambient-glow-2', {
        y: 16, x: 8, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1,
      }, 2)

      // 2. 标题行：从下往上滑入
      tl.fromTo('.page-title',
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6 },
        0.15
      )
      // 3. 域名：稍延迟跟随
      tl.fromTo('.page-domain',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4 },
        0.35
      )
      // 4. 副标题
      tl.fromTo('.page-subtitle',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.5 },
        0.45
      )
      // 5. 状态标签：弹性弹入
      tl.fromTo('.status-badge',
        { opacity: 0, scale: 0.7 },
        { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' },
        0.65
      )
      // 6. 状态消息
      tl.fromTo('.status-message',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5 },
        0.8
      )
      // 7. 卡片交错入场：从左到右依次弹性飞入
      tl.fromTo('.mcard',
        { opacity: 0, y: 40, scale: 0.92 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 0.5,
          stagger: 0.12,
          ease: 'back.out(1.7)',
        },
        0.9
      )
      // 8. 进度步骤：依次揭示（使用卡片内选择器）
      tl.fromTo('.progress-step',
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, duration: 0.35, stagger: 0.1, ease: 'power2.out' },
        1.5
      )
      // 9. 历史记录：依次滑入
      tl.fromTo('.announcement-entry',
        { opacity: 0, x: -16 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.1, ease: 'power2.out' },
        1.6
      )
      // 10. 联系链接：淡入
      tl.fromTo('.contact-link',
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.08 },
        1.5
      )
      // 11. 页脚淡入
      tl.fromTo('.page-footer',
        { opacity: 0 },
        { opacity: 1, duration: 0.6 },
        1.8
      )
    }, pageRef)

    return () => ctx.revert()
  }, [])

  return (
    <main ref={pageRef} className="yourtj-scrollbar-hidden fixed inset-0 z-[200] flex flex-col items-center md:justify-center overflow-x-hidden overflow-y-auto bg-sea-50 dark:bg-slate-950">
      {/* Ambient glows */}
      <div className="ambient-glow-1 pointer-events-none fixed -top-16 left-1/2 h-56 w-56 -translate-x-[70%] rounded-full bg-cyan-300/16 blur-[48px] md:-top-24 md:left-1/4 md:h-96 md:w-96 md:translate-x-0 md:bg-cyan-300/20 md:blur-[100px] dark:bg-cyan-500/10" />
      <div className="ambient-glow-2 pointer-events-none fixed -bottom-20 right-0 h-48 w-48 translate-x-1/4 rounded-full bg-sky-300/14 blur-[44px] md:-bottom-32 md:right-1/4 md:h-80 md:w-80 md:translate-x-0 md:bg-sky-300/20 md:blur-[100px] dark:bg-sky-500/10" />

      <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08] pointer-events-none bg-[length:26px_26px]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(14,165,233,0.55) 1px, transparent 0)',
        }}
      />

      <div className="relative w-full max-w-6xl px-3 pt-8 pb-5 md:px-4 md:py-12">
        {/* Logo Animation */}
        <div className="mb-5 md:mb-8">
          <div className="mx-auto flex h-[80px] w-[80px] md:h-[92px] md:w-[92px] items-center justify-center rounded-[20px] md:rounded-[26px] bg-gradient-to-br from-cyan-100 to-sky-50 dark:from-slate-800 dark:to-slate-700 shadow-sm">
            <MaintenanceLogo />
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-2">
          <h1 className="page-title yourtj-font-brand text-[26px] md:text-[28px] font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            {cfg.title}
          </h1>
          <p className="page-domain yourtj-font-domain text-[12px] font-semibold tracking-[0.22em] text-slate-500 dark:text-slate-400 mt-1">
            xk.yourtj.de
          </p>
        </div>

        {/* Subtitle */}
        <p className="page-subtitle yourtj-font-slogan text-center text-base md:text-xl font-semibold text-slate-600 dark:text-slate-300 mt-2 md:mt-3 mb-1">
          {cfg.subtitle}
        </p>

        {/* Status Badge */}
        <div className="status-badge text-center mb-2">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-700/50 text-amber-800 dark:text-amber-300 text-xs font-black tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {cfg.statusLabel}
          </span>
        </div>

        {/* Message */}
        <p className="status-message text-center text-slate-600 dark:text-slate-400 text-sm md:text-base mb-6 md:mb-10">
          {cfg.message}
        </p>

        {/* Cards Grid - Flex horizontal */}
        <div className="flex w-full flex-col gap-3 md:flex-row md:flex-wrap md:justify-center md:gap-5">
          {/* Status Card */}
          <MaintenanceCard className="mcard" icon={<StatusIcon />} title="系统状态">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 text-xs">当前状态</span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{cfg.statusLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 text-xs">预计恢复</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{cfg.eta}</span>
              </div>
            </div>
          </MaintenanceCard>

          {/* Progress Card */}
          <MaintenanceCard className="mcard" icon={<ProgressIcon />} title="维护进度">
            <div className="space-y-3">
              {cfg.progress.map((step, idx) => (
                <div key={step.id} className="progress-step flex items-center gap-3">
                  <div className={`flex h-5 w-5 items-center justify-center self-center rounded-full text-[10px] font-black shrink-0 ${
                    step.done
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                      : step.active
                        ? 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 ring-2 ring-cyan-300/50 dark:ring-cyan-600/50'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                  }`}>
                    {step.done ? '✓' : idx + 1}
                  </div>
                  <span className={`min-w-0 flex-1 text-xs leading-5 ${
                    step.done
                      ? 'text-slate-500 dark:text-slate-400 line-through decoration-slate-600 dark:decoration-slate-300'
                      : step.active
                        ? 'text-slate-800 dark:text-slate-100 font-semibold'
                        : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </MaintenanceCard>

          {/* Contact Card */}
          <MaintenanceCard className="mcard" icon={<ContactIcon />} title="联系我们">
            <div className="space-y-3">
              <a
                href={`mailto:${cfg.contact.email}`}
                className="contact-link flex items-center gap-2 text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {cfg.contact.email}
              </a>
              {cfg.socialLinks.map((link) => (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-link flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-xs"
                >
                  {link.platform === 'Telegram' ? (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 448 512" fill="currentColor">
                      <path d="M446.7 98.6l-67.6 318.8c-5.1 22.5-18.4 28.1-37.3 17.5l-103-75.9-49.7 47.8c-5.5 5.5-10.1 10.1-20.7 10.1l7.4-104.9 190.9-172.5c8.3-7.4-1.8-11.5-12.9-4.1L117.8 284 16.2 252.2c-22.1-6.9-22.5-22.1 4.6-32.7L418.2 66.4c18.4-6.9 34.5 4.1 28.5 32.2z" />
                    </svg>
                  ) : link.platform === 'QQ' ? (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 448 512" fill="currentColor">
                      <path d="M433.8 420.4c-11.5 1.4-44.9-52.7-44.9-52.7 0 31.3-16.1 72.2-51.1 101.8 16.8 5.2 54.8 19.2 45.8 34.4-7.3 12.3-125.5 7.9-159.6 4-34.1 3.8-152.3 8.3-159.6-4-9-15.3 28.9-29.2 45.8-34.4-34.9-29.5-51.1-70.4-51.1-101.8 0 0-33.3 54.1-44.9 52.7-5.4-.7-12.4-29.6 9.3-99.7 10.3-33 29.6-63.1 47.2-85.8 3.3-4.2 6.7-8.2 10.4-11.9-5.9-16.6-11.5-44-11.5-68.9 0-86.7 67.4-157 150.4-157 83.1 0 150.5 70.3 150.5 157 0 24.9-5.6 52.2-11.5 68.9 3.7 3.7 7.2 7.7 10.4 11.9 17.6 22.6 37 52.7 47.2 85.8 21.8 70 14.7 99 9.3 99.7z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 496 512" fill="currentColor">
                      <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zM256 8C119.3 8 8 119.3 8 256c0 110.5 71.6 204.4 170.9 237.6 12.5 2.3 17.1-5.4 17.1-12 0-5.9-.2-21.6-.3-42.4-69.6 15.1-84.3-33.6-84.3-33.6-11.4-28.9-27.8-36.6-27.8-36.6-22.7-15.5 1.7-15.2 1.7-15.2 25.1 1.8 38.3 25.8 38.3 25.8 22.3 38.2 58.6 27.2 72.9 20.8 2.3-16.2 8.7-27.2 15.9-33.5-55.6-6.3-114-27.8-114-123.8 0-27.3 9.8-49.7 25.8-67.2-2.6-6.3-11.2-31.8 2.4-66.3 0 0 21-6.7 69 25.7 20-5.6 41.5-8.4 62.8-8.5 21.3.1 42.8 2.9 62.8 8.5 48-32.4 69-25.7 69-25.7 13.6 34.5 5 60 2.4 66.3 16 17.5 25.8 39.9 25.8 67.2 0 96.1-58.5 117.4-114.2 123.6 9 7.7 17 23.1 17 46.6 0 33.6-.3 60.7-.3 69 0 6.6 4.6 14.3 17.2 11.9C376.5 460.3 448 366.5 448 256 448 119.3 340.8 8 256 8z" />
                    </svg>
                  )}
                  {link.label}
                </a>
              ))}
            </div>
          </MaintenanceCard>

          {/* Announcements Card */}
          <MaintenanceCard className="mcard" icon={<BellIcon />} title="系统公告">
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">暂无公告</p>
              ) : (
                announcements.slice(0, 4).map((item) => {
                  const typeStyles: Record<string, string> = {
                    info: 'border-sky-200 dark:border-sky-700/50 bg-sky-50/50 dark:bg-sky-950/30',
                    warning: 'border-amber-200 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/30',
                    error: 'border-rose-200 dark:border-rose-700/50 bg-rose-50/50 dark:bg-rose-950/30',
                    success: 'border-emerald-200 dark:border-emerald-700/50 bg-emerald-50/50 dark:bg-emerald-950/30',
                  }
                  const dotStyles: Record<string, string> = {
                    info: 'bg-sky-400',
                    warning: 'bg-amber-400',
                    error: 'bg-rose-400',
                    success: 'bg-emerald-400',
                  }
                  return (
                    <div
                      key={item.id}
                      className={`announcement-entry overflow-hidden rounded-xl border px-3 py-2.5 ${typeStyles[item.type] || typeStyles.info}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles[item.type] || dotStyles.info}`} />
                        <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 line-clamp-3">
                          {item.content}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </MaintenanceCard>
        </div>

        {/* Footer */}
        <footer className="page-footer mt-8 md:mt-12 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            最后更新：{cfg.lastUpdated}
          </p>
          <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">
            &copy; {new Date().getFullYear()} YOURTJ选课社区
          </p>
        </footer>
      </div>
    </main>
  )
}
