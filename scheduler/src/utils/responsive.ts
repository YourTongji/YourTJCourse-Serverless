let _isMobile = window.innerWidth < 768
const listeners = new Set<(v: boolean) => void>()

function onResize() {
  const v = window.innerWidth < 768
  if (v !== _isMobile) {
    _isMobile = v
    listeners.forEach(fn => fn(v))
  }
}

// Initialize once
window.addEventListener('resize', onResize, { passive: true })

export function isMobile(): boolean {
  return _isMobile
}

export function onMobileChange(fn: (v: boolean) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
