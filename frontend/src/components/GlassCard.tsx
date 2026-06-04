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
        bg-white/82 md:bg-white/70 backdrop-blur-0 md:backdrop-blur-xl
        border border-white/60
        shadow-[0_4px_14px_-8px_rgba(15,23,42,0.16)] md:shadow-[0_4px_20px_-4px_rgba(6,182,212,0.15)]
        rounded-3xl p-6
        ${hover ? 'active:scale-[0.98] md:hover:scale-[1.02] md:hover:bg-white/85 md:hover:shadow-[0_10px_40px_-10px_rgba(6,182,212,0.3)] cursor-pointer' : ''}
        transition-all duration-300
        ${className}
      `}
    >
      {/* 渐变层 - 移动端简化 */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-cyan-50/18 md:to-cyan-50/30 pointer-events-none opacity-40 md:opacity-100" />
      <div className="relative z-10 h-full">
        {children}
      </div>
    </div>
  )
}
