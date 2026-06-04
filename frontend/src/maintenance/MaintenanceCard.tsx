import type { ReactNode } from 'react'
import GlassCard from '../components/GlassCard'

interface MaintenanceCardProps {
  icon: ReactNode
  title: string
  children: ReactNode
  className?: string
}

export default function MaintenanceCard({ icon, title, children, className = '' }: MaintenanceCardProps) {
  return (
    <GlassCard
      className={`flex-1 min-w-[220px] md:min-w-[220px] max-w-[360px] rounded-2xl md:rounded-3xl p-4 md:p-6 dark:bg-slate-900/70 dark:border-slate-700/50 dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] dark:md:hover:bg-slate-900/85 dark:md:hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-cyan-50/30 md:to-cyan-50/30 dark:to-slate-800/20 opacity-50 md:opacity-100" />
      <div className="flex items-center gap-2.5 md:gap-3 mb-3 md:mb-4">
        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-cyan-50/50 dark:bg-slate-800/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
          {icon}
        </div>
        <h3 className="text-xs md:text-sm font-black text-slate-700 dark:text-slate-200 tracking-wide">{title}</h3>
      </div>
      <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {children}
      </div>
    </GlassCard>
  )
}
