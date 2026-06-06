import { Link, Outlet } from "react-router";

import { Button } from "~/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "~/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { Menu } from "lucide-react";
import AnnouncementBell from "~/components/AnnouncementBell";

const NAV_ITEMS = [
  { to: "/courses", label: "课程目录" },
  { to: "/schedule", label: "排课模拟" },
  { to: "/about", label: "关于" },
  { to: "/feedback", label: "反馈" },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50">
      {/* ─── Navbar ─── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-white/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          {/* Brand */}
          <Link
            to="/"
            className="font-brand text-lg font-bold text-slate-800 transition-colors hover:text-cyan-600 shrink-0"
          >
            YOURTJ选课社区
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex md:flex-1 md:justify-center md:px-8">
            <NavigationMenu>
              <NavigationMenuList>
                {NAV_ITEMS.map((item) => (
                  <NavigationMenuItem key={item.to}>
                    <Link
                      to={item.to}
                      className="inline-flex h-9 w-max items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all hover:bg-muted hover:text-cyan-600"
                    >
                      {item.label}
                    </Link>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <AnnouncementBell />

            {/* Mobile sheet trigger */}
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="菜单"
                  />
                }
              >
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle className="font-brand">
                    YOURTJ选课社区
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-1 p-4">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-muted"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      {/* ─── Footer ─── */}
      <footer className="text-xs text-slate-400 text-center py-8">
        YOURTJ选课社区 · 不记名、自由、简洁、高效的选课社区
      </footer>
    </div>
  );
}
