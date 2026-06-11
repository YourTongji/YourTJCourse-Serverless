import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useAnnouncements } from "~/lib/queries";
import { useUIStore } from "~/lib/stores";
import MarkdownContent from "~/components/MarkdownContent";

interface RuntimeAnnouncement {
  id: string;
  type: "info" | "warning" | "error" | "success";
  content: string;
  enabled?: boolean;
  title?: string;
}

const TYPE_STYLES: Record<string, string> = {
  info: "bg-blue-50/90 backdrop-blur-sm border-blue-200 text-blue-800",
  warning: "bg-amber-50/90 backdrop-blur-sm border-amber-200 text-amber-800",
  error: "bg-red-50/90 backdrop-blur-sm border-red-200 text-red-800",
  success: "bg-emerald-50/90 backdrop-blur-sm border-emerald-200 text-emerald-800",
};

const TYPE_BADGE: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  success: "bg-emerald-100 text-emerald-700",
};

const TYPE_LABELS: Record<string, string> = {
  info: "通知",
  warning: "警告",
  error: "错误",
  success: "成功",
};

const CYCLE_INTERVAL_MS = 4000;
const SLIDE_DURATION_MS = 520;

export default function AnnouncementBar() {
  const announcementsQueryOptions = useAnnouncements();
  const { data: announcements, isLoading } = useQuery(announcementsQueryOptions);
  const { announcementReadIds, markAnnouncementRead } =
    useUIStore();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAnnouncement, setModalAnnouncement] = useState<RuntimeAnnouncement | null>(null);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Normalize announcements: the backend returns { type, content, id, enabled }
  const enabled = Array.isArray(announcements)
    ? (announcements as unknown as RuntimeAnnouncement[]).filter(
        (a) => a.enabled !== false && a.content,
      )
    : [];

  const hasAnnouncements = enabled.length > 0;

  const cycleTo = useCallback(
    (index: number, dir: "next" | "prev") => {
      if (animating || !hasAnnouncements) return;
      setDirection(dir);
      setAnimating(true);
      setActiveIndex(index);
      setTimeout(() => setAnimating(false), SLIDE_DURATION_MS);
    },
    [animating, hasAnnouncements],
  );

  const nextAnnouncement = useCallback(() => {
    if (!hasAnnouncements) return;
    const nextIndex = (activeIndex + 1) % enabled.length;
    cycleTo(nextIndex, "next");
  }, [activeIndex, enabled.length, cycleTo, hasAnnouncements]);

  // Auto-cycle timer
  useEffect(() => {
    if (!hasAnnouncements || isCollapsed) return;

    cycleTimerRef.current = setInterval(() => {
      nextAnnouncement();
    }, CYCLE_INTERVAL_MS);

    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    };
  }, [hasAnnouncements, isCollapsed, nextAnnouncement]);

  const handleOpenModal = useCallback(
    (announcement: RuntimeAnnouncement) => {
      markAnnouncementRead(announcement.id);
      setModalAnnouncement(announcement);
      setModalOpen(true);
    },
    [markAnnouncementRead],
  );

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setModalAnnouncement(null);
  }, []);

  if (isLoading || !hasAnnouncements || isCollapsed) return null;

  const current = enabled[activeIndex];
  if (!current) return null;

  const isRead = announcementReadIds.includes(current.id);
  const containerStyle = TYPE_STYLES[current.type] || TYPE_STYLES.info;
  const badgeStyle = TYPE_BADGE[current.type] || TYPE_BADGE.info;
  const label = TYPE_LABELS[current.type] || TYPE_LABELS.info;

  // Show pagination dots only if more than one
  const showPagination = enabled.length > 1;

  return (
    <>
      {/* ─── Announcement Bar ─── */}
      <div
        className={`relative border-b ${containerStyle} ${
          isRead ? "opacity-75" : ""
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Type badge */}
            <span
              className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeStyle}`}
            >
              {label}
            </span>

            {/* Carousel content */}
            <button
              type="button"
              onClick={() => handleOpenModal(current)}
              className="flex-1 min-w-0 overflow-hidden cursor-pointer"
            >
              <div className="relative overflow-hidden h-5">
                <p
                  key={`${activeIndex}-${direction}`}
                  className={`text-sm truncate animate-slide-in-${direction}`}
                >
                  {current.content}
                </p>
              </div>
            </button>

            {/* Navigation */}
            <div className="flex items-center gap-0.5 shrink-0">
              {showPagination && (
                <div className="flex items-center gap-1 mr-1">
                  {enabled.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        cycleTo(
                          i,
                          i > activeIndex
                            ? "next"
                            : i < activeIndex
                              ? "prev"
                              : "next",
                        )
                      }
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === activeIndex
                          ? "bg-current opacity-90"
                          : "bg-current opacity-30 hover:opacity-60"
                      }`}
                      aria-label={`公告 ${i + 1}`}
                    />
                  ))}
                </div>
              )}

              {/* Collapse */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCollapsed(true);
                }}
                aria-label="关闭公告栏"
              >
                <X className="size-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Announcement Modal ─── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {modalAnnouncement && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    TYPE_BADGE[modalAnnouncement.type] || TYPE_BADGE.info
                  }`}
                >
                  {TYPE_LABELS[modalAnnouncement.type] || TYPE_LABELS.info}
                </span>
              )}
              <span className="text-base">公告详情</span>
            </DialogTitle>
            <DialogDescription>
              <div className="pt-3">
                {modalAnnouncement && (
                  <MarkdownContent content={modalAnnouncement.content} />
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleCloseModal} className="w-full sm:w-auto">
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
