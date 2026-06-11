import { Outlet } from "react-router";
import { createPortal } from "react-dom";

import CreditWalletPanel from "~/components/CreditWalletPanel";
import Navbar from "~/components/Navbar";
import BottomNavigation from "~/components/BottomNavigation";
import AnnouncementBar from "~/components/AnnouncementBar";
import TourGuide from "~/components/TourGuide";
import MaintenanceBar from "~/components/MaintenanceBar";

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ─── Navbar ─── */}
      <Navbar />

      {/* ─── Maintenance & Announcement ─── */}
      <MaintenanceBar />
      <AnnouncementBar />

      {/* ─── Main content ─── */}
      <main className="mx-auto max-w-7xl px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>

      {/* ─── Tour Guide ─── */}
      <TourGuide />

      {/* ─── Bottom Navigation (mobile) ─── */}
      <BottomNavigation />

      {/* ─── Footer ─── */}

      {/* ─── Credit Wallet ─── */}
      {createPortal(<CreditWalletPanel />, document.body)}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        YOURTJ选课社区 · 不记名、自由、简洁、高效的选课社区
      </footer>
    </div>
  );
}
