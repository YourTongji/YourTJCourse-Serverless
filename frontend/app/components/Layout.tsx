import { Link, NavLink, Outlet } from "react-router";
import { Menu } from "lucide-react";

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
import AnnouncementBar from "~/components/AnnouncementBar";
import AnnouncementBell from "~/components/AnnouncementBell";
import MaintenanceBar from "~/components/MaintenanceBar";

const NAV_ITEMS = [
  { to: "/courses", label: "课程目录" },
  { to: "/schedule", label: "排课模拟" },
  { to: "/about", label: "关于" },
  { to: "/feedback", label: "反馈" },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ─── Navbar ─── */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          {/* Brand */}
          <Link
            to="/"
            className="shrink-0 font-brand text-lg font-bold text-slate-900 transition-colors hover:text-teal-700"
          >
            YOURTJ选课社区
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex md:flex-1 md:justify-center md:px-8">
            <NavigationMenu>
              <NavigationMenuList>
                {NAV_ITEMS.map((item) => (
                  <NavigationMenuItem key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `inline-flex h-9 w-max items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                          isActive
                            ? "bg-slate-100 text-teal-700"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
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
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                          isActive
                            ? "bg-slate-100 text-teal-700"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* ─── Maintenance & Announcement ─── */}
      <MaintenanceBar />
      <AnnouncementBar />

      {/* ─── Main content ─── */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        YOURTJ选课社区 · 不记名、自由、简洁、高效的选课社区
      </footer>
    </div>
  );
}
