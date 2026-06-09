import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Tour Store ──────────────────────────────────────────────────────────────

interface TourState {
  isActive: boolean;
  currentStep: number;
  isCompleted: boolean;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  resetTour: () => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      isActive: false,
      currentStep: 0,
      isCompleted: false,

      startTour: () => set({ isActive: true, currentStep: 0 }),
      nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
      prevStep: () =>
        set((s) => ({ currentStep: Math.max(0, s.currentStep - 1) })),
      skipTour: () => set({ isActive: false }),
      resetTour: () =>
        set({ isActive: false, currentStep: 0, isCompleted: false }),
    }),
    {
      name: "yourtj-tour",
      partialize: (state) => ({ isCompleted: state.isCompleted }),
    },
  ),
);

// ─── UI Store ────────────────────────────────────────────────────────────────

interface UIState {
  announcementReadIds: string[];
  isAnnouncementBarExpanded: boolean;
  isMobileMenuOpen: boolean;
  markAnnouncementRead: (id: string) => void;
  toggleAnnouncementBar: () => void;
  toggleMobileMenu: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  announcementReadIds: [],
  isAnnouncementBarExpanded: false,
  isMobileMenuOpen: false,

  markAnnouncementRead: (id) =>
    set((s) => ({
      announcementReadIds: s.announcementReadIds.includes(id)
        ? s.announcementReadIds
        : [...s.announcementReadIds, id],
    })),
  toggleAnnouncementBar: () =>
    set((s) => ({ isAnnouncementBarExpanded: !s.isAnnouncementBarExpanded })),
  toggleMobileMenu: () =>
    set((s) => ({ isMobileMenuOpen: !s.isMobileMenuOpen })),
}));
