import { useEffect, useState } from "react";

/**
 * Returns `true` when the viewport width is below `breakpoint` (default 768 px).
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize, { passive: true });
    onResize(); // sync after SSR hydration
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}
