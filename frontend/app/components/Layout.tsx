import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { createPortal } from "react-dom";

import CreditWalletPanel from "~/components/CreditWalletPanel";
import Navbar from "~/components/Navbar";
import BottomNavigation from "~/components/BottomNavigation";
import AnnouncementBar from "~/components/AnnouncementBar";
import TourGuide from "~/components/TourGuide";
import MaintenanceBar from "~/components/MaintenanceBar";

/** Renders children into document.body via portal, but only on the client. */
function ClientPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

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

      {/* ─── Credit Wallet (client-side only) ─── */}
      <ClientPortal>
        <CreditWalletPanel />
      </ClientPortal>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        YOURTJ选课社区 · 不记名、自由、简洁、高效的选课社区
      </footer>
    </div>
  );
}
