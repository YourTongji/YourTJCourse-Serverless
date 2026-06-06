import { useEffect, useMemo, useRef, useState } from 'react'

type Point = { x: number; y: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function getDragBounds() {
  if (typeof window === 'undefined') return { maxX: 800, maxY: 800 }
  const vw = Math.max(320, window.innerWidth || 0)
  const vh = Math.max(480, window.innerHeight || 0)
  // Wide enough so it doesn't feel "stuck", but still roughly within viewport.
  return {
    maxX: Math.max(360, Math.floor(vw * 0.8)),
    maxY: Math.max(520, Math.floor(vh * 0.8))
  }
}

function loadPoint(key: string, fallback: Point): Point {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const v = JSON.parse(raw)
    const x = Number(v?.x)
    const y = Number(v?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback
    return { x, y }
  } catch {
    return fallback
  }
}

export function useDraggableDesktop(storageKey: string, fallback: Point) {
  const [offset, setOffset] = useState<Point>(() => (typeof window === 'undefined' ? fallback : loadPoint(storageKey, fallback)))
  const dragRef = useRef<null | { startClientX: number; startClientY: number; startX: number; startY: number }>(null)
  const draggedRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(offset))
    } catch {
      // ignore
    }
  }, [offset, storageKey])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e as any).button !== undefined && (e as any).button !== 0) return
    draggedRef.current = false
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: offset.x, startY: offset.y }
    try {
      ;(e.currentTarget as any).setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startClientX
    const dy = e.clientY - dragRef.current.startClientY
    if (Math.abs(dx) + Math.abs(dy) > 4) draggedRef.current = true

    const { maxX, maxY } = getDragBounds()
    const nextX = clamp(dragRef.current.startX + dx, -maxX, maxX)
    const nextY = clamp(dragRef.current.startY + dy, -maxY, maxY)
    setOffset({ x: nextX, y: nextY })
  }

  const onPointerUp = (_e: React.PointerEvent) => {
    dragRef.current = null
  }

  const consumeDragFlag = () => {
    const v = draggedRef.current
    draggedRef.current = false
    return v
  }

  const style = useMemo(() => ({ transform: `translate(${offset.x}px, ${offset.y}px)` }), [offset.x, offset.y])

  return {
    style,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      style: {
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none'
      } as any
    },
    consumeDragFlag
  }
}
