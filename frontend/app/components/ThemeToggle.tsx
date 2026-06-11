import { useState, useCallback, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "~/components/ui/button";

export default function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("yourtj-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
  }, [dark]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("yourtj-theme");
      if (stored === "dark" && !dark) {
        document.documentElement.classList.add("dark");
        setDark(true);
      }
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "切换到亮色模式" : "切换到深色模式"}
      className="touch-target"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
