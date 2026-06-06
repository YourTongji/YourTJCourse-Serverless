import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

export default function MaintenanceLogo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(media.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (reducedMotion || !containerRef.current) return

    const ctx = gsap.context(() => {
      gsap.set(glowRef.current, { opacity: 0, scale: 0 })

      const tl = gsap.timeline()

      tl
        // 1. 光晕先亮起
        .to(glowRef.current, {
          opacity: 0.6,
          scale: 1,
          duration: 0.6,
          ease: 'power2.out',
        })
        // 2. web 图标从微缩弹性入场（与光晕重叠）
        .fromTo(imgRef.current,
          { opacity: 0, scale: 0.6, rotation: -12 },
          {
            opacity: 1,
            scale: 1,
            rotation: 0,
            duration: 1.0,
            ease: 'back.out(1.7)',
          },
          '-=0.2'
        )
        // 3. 光晕渐隐
        .to(glowRef.current, {
          opacity: 0,
          duration: 0.5,
          ease: 'power2.in',
        })
        // 4. 呼吸循环
        .to(imgRef.current, {
          scale: 1.04,
          duration: 2.5,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
    }, containerRef)

    return () => ctx.revert()
  }, [reducedMotion])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full mx-auto flex items-center justify-center"
      aria-hidden="true"
    >
      <div
        ref={glowRef}
        className="absolute inset-0 rounded-full bg-cyan-300/30 dark:bg-cyan-500/15 blur-xl pointer-events-none"
      />
      <img
        ref={imgRef}
        src="/assets/web-icon.svg"
        alt="YourTJ"
        className="absolute inset-0 w-full h-full object-contain"
      />
    </div>
  )
}
