import { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  hover?: boolean
}

export default function GlassCard({ children, className = '', onClick, hover = true }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden
        bg-white/95 md:bg-white/70 backdrop-blur-md md:backdrop-blur-xl
        border border-white/75 md:border-white/60
        shadow-[0_12px_30px_-20px_rgba(15,23,42,0.28)] md:shadow-[0_4px_20px_-4px_rgba(6,182,212,0.15)]
        rounded-3xl p-6
        ${hover ? 'active:scale-[0.98] md:hover:scale-[1.02] md:hover:bg-white/85 md:hover:shadow-[0_10px_40px_-10px_rgba(6,182,212,0.3)] cursor-pointer' : ''}
        transition-all duration-300
        ${className}
      `}
    >
      {/* 渐变层 - 移动端简化 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/55 via-white/10 to-slate-50/28 md:from-transparent md:via-transparent md:to-cyan-50/30 pointer-events-none opacity-80 md:opacity-100" />
      <div className="relative z-10 h-full">
        {children}
      </div>
    </div>
  )
}
