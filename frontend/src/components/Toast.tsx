import { useEffect, useState, useCallback } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
let addToastFn: ((msg: string, type: ToastType) => void) | null = null

export function showToast(message: string, type: ToastType = 'info') {
  addToastFn?.(message, type)
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  if (toasts.length === 0) return null

  const typeStyles: Record<ToastType, string> = {
    success: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20',
    error: 'bg-red-500 text-white shadow-lg shadow-red-500/20',
    info: 'bg-slate-800 text-white shadow-lg shadow-slate-800/20',
  }
  const typeIcons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'i',
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-bold animate-slide-in ${typeStyles[t.type]}`}
          style={{
            animation: 'slideIn 0.3s ease-out',
            minWidth: '200px',
            maxWidth: '360px',
          }}
        >
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs shrink-0">
            {typeIcons[t.type]}
          </span>
          <span className="leading-snug">{t.message}</span>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
