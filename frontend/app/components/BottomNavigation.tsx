import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { BookOpen, CalendarDays, MessageSquareText, BarChart3, PenLine } from "lucide-react";

import { Button } from "~/components/ui/button";

type NavItem = {
  path: string;
  label: string;
  icon: React.ReactNode;
  external?: boolean;
  requiresCourseId?: boolean;
};

const navItems: NavItem[] = [
  {
    path: "/",
    label: "课程",
    icon: <BookOpen className="size-5" />,
  },
  {
    path: "/schedule",
    label: "排课",
    icon: <CalendarDays className="size-5" />,
  },
  {
    path: "/feedback",
    label: "反馈",
    icon: <MessageSquareText className="size-5" />,
  },
  {
    path: "https://umami.yourtj.de/share/Sv78TrEoxVnsshxy",
    label: "流量",
    icon: <BarChart3 className="size-5" />,
    external: true,
  },
  {
    path: "/write-review",
    label: "撰写",
    icon: <PenLine className="size-5" />,
    requiresCourseId: true,
  },
];

export default function BottomNavigation() {
  const [isVisible, setIsVisible] = useState(true);
  const location = useLocation();

  // Hide on write-review page
  const isWriteReviewPage = location.pathname.includes("/write-review");

  // Scroll-hide behavior (useRef to avoid re-registering on every scroll)
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollYRef.current && currentScrollY > 50) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollYRef.current) {
        setIsVisible(true);
      }
      lastScrollYRef.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []); // empty deps: stable because ref doesn't need re-registration

  if (isWriteReviewPage) return null;

  return (
    <nav
      data-tour="tour-mobile-bottom-nav"
      className={`md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-lg z-50 transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center justify-around px-2 pt-2">
        {navItems.map((item) => {
          // Handle external links
          if (item.external) {
            return (
              <Button
                key={item.path}
                variant="ghost"
                className="flex-1 flex-col h-full px-1 py-2"
                render={
                  <a
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <div className="mb-0.5">{item.icon}</div>
                <span className="text-[10px] font-semibold leading-none">
                  {item.label}
                </span>
              </Button>
            );
          }

          // Handle write-review tab
          if (item.requiresCourseId) {
            const courseMatch = location.pathname.match(/\/course\/(\d+)/);
            const courseId = courseMatch ? courseMatch[1] : null;

            if (courseId) {
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  className="flex-1 flex-col h-full px-1 py-2"
                  render={<Link to={`/write-review/${courseId}`} />}
                >
                  <div className="mb-0.5">{item.icon}</div>
                  <span className="text-[10px] font-semibold leading-none">
                    {item.label}
                  </span>
                </Button>
              );
            }

            // Disabled state when not on a course page
            return (
              <Button
                key={item.path}
                variant="ghost"
                disabled
                className="flex-1 flex-col h-full px-1 py-2"
              >
                <div className="mb-0.5">{item.icon}</div>
                <span className="text-[10px] font-semibold leading-none">
                  {item.label}
                </span>
              </Button>
            );
          }

          // Normal internal link tabs
          const isActive = location.pathname === item.path;

          return (
            <Button
              key={item.path}
              variant={isActive ? "default" : "ghost"}
              className="flex-1 flex-col h-full px-1 py-2"
              render={<Link to={item.path} />}
            >
              <div className="mb-0.5">{item.icon}</div>
              <span className="text-[10px] font-semibold leading-none">
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
