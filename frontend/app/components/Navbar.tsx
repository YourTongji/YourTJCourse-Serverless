import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Home, Menu } from "lucide-react";

import { Button, buttonVariants } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import AnnouncementBell from "~/components/AnnouncementBell";
import ThemeToggle from "~/components/ThemeToggle";
import { cn } from "~/lib/utils";

type NavItem = { path: string; label: string; external?: boolean };

const NAV_ITEMS: NavItem[] = [
  { path: "/courses", label: "课程目录" },
  { path: "/schedule", label: "排课模拟" },
  { path: "/about", label: "关于" },
  { path: "/feedback", label: "反馈" },
  { path: "https://umami.yourtj.de/share/Sv78TrEoxVnsshxy", label: "流量监测", external: true },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  const key = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash],
  );

  const stackRef = useRef<string[]>([]);
  const idxRef = useRef(0);
  const navModeRef = useRef<"push" | "back" | "forward" | "home">("push");
  const [, forceRender] = useState(0);

  const persistState = () => {
    try {
      const st: Record<string, unknown> = window.history.state || {};
      window.history.replaceState(
        { ...st, __yourtj_stack: stackRef.current, __yourtj_idx: idxRef.current },
        "",
      );
    } catch {
      // ignore
    }
  };

  // init stack from history.state once
  useEffect(() => {
    try {
      const st: Record<string, unknown> = window.history.state || {};
      const stack: string[] = Array.isArray(st.__yourtj_stack) ? st.__yourtj_stack : [];
      const idx = Number.isFinite(Number(st.__yourtj_idx)) ? Number(st.__yourtj_idx) : 0;
      stackRef.current = stack.length ? stack : [key];
      idxRef.current = Math.min(Math.max(0, idx), stackRef.current.length - 1);
      if (stackRef.current[idxRef.current] !== key) {
        stackRef.current = [key];
        idxRef.current = 0;
      }
      persistState();
      forceRender((x) => x + 1);
    } catch {
      stackRef.current = [key];
      idxRef.current = 0;
      forceRender((x) => x + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update stack on navigation
  useEffect(() => {
    const stack = stackRef.current;
    const idx = idxRef.current;

    if (stack[idx] === key) {
      navModeRef.current = "push";
      forceRender((x) => x + 1);
      return;
    }

    if (navModeRef.current === "back" || navModeRef.current === "forward") {
      navModeRef.current = "push";
      persistState();
      forceRender((x) => x + 1);
      return;
    }

    // normal navigation: push
    const nextStack = idx < stack.length - 1 ? stack.slice(0, idx + 1) : stack.slice();
    nextStack.push(key);
    stackRef.current = nextStack;
    idxRef.current = nextStack.length - 1;
    persistState();
    forceRender((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const isHome = location.pathname === "/";
  const canBack = idxRef.current > 0;
  const canForward = idxRef.current < stackRef.current.length - 1;

  const navBack = () => {
    if (!canBack) return;
    idxRef.current -= 1;
    navModeRef.current = "back";
    persistState();
    navigate(stackRef.current[idxRef.current], { replace: true });
    forceRender((x) => x + 1);
  };

  const navForward = () => {
    if (!canForward) return;
    idxRef.current += 1;
    navModeRef.current = "forward";
    persistState();
    navigate(stackRef.current[idxRef.current], { replace: true });
    forceRender((x) => x + 1);
  };

  const goHome = () => {
    if (isHome) return;
    navModeRef.current = "home";
    navigate("/");
  };

  const isNavActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <header
      className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur"
      data-tour="tour-navbar"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Brand */}
        <Link
          to="/"
          className="shrink-0 font-brand text-lg font-bold text-slate-900 transition-colors hover:text-teal-700"
        >
          YOURTJ选课社区
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* In-app nav controls (always visible) */}
          <div className="flex items-center gap-0.5" data-tour="tour-nav-controls">
            <Button
              variant="ghost"
              size="icon"
              onClick={navBack}
              disabled={!canBack}
              data-tour="tour-nav-back"
              aria-label="后退"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={navForward}
              disabled={!canForward}
              data-tour="tour-nav-forward"
              aria-label="前进"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goHome}
              disabled={isHome}
              data-tour="tour-nav-home"
              aria-label="回到首页"
            >
              <Home className="size-4" />
            </Button>
          </div>

          {/* Pill-style nav links (desktop only) */}
          <div className="hidden md:flex items-center gap-1 rounded-full bg-slate-100/50 p-1 ml-1">
            {NAV_ITEMS.map((item) => {
              if (item.external) {
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "ghost", className: "rounded-full" })}
                  >
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={buttonVariants({
                    variant: isNavActive(item.path) ? "default" : "ghost",
                    className: "rounded-full",
                  })}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <AnnouncementBell />
          <ThemeToggle />

          {/* Mobile sheet trigger */}
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="菜单" />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle className="font-brand">YOURTJ选课社区</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 p-4">
                {NAV_ITEMS.map((item) => {
                  if (item.external) {
                    return (
                      <a
                        key={item.path}
                        href={item.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-950"
                      >
                        {item.label}
                      </a>
                    );
                  }

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all",
                        isNavActive(item.path)
                          ? "bg-slate-100 text-teal-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
