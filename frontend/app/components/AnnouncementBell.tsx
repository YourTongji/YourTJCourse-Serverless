import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
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

interface Announcement {
  id: string;
  type: "info" | "warning" | "error" | "success";
  content: string;
  enabled: boolean;
}

export default function AnnouncementBell() {
  const queryOpts = useAnnouncements();
  const { data: rawData, isLoading } = useQuery(queryOpts);
  const { announcementReadIds, markAnnouncementRead } = useUIStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [pendingModal, setPendingModal] = useState<Announcement | null>(null);
  const modalShownRef = useRef(false);

  // Normalize to Bell's Announcement shape (API returns { type, content, id, enabled })
  const announcements: Announcement[] = Array.isArray(rawData)
    ? (rawData as unknown as Announcement[]).filter((a) => a.enabled)
    : [];

  // Show modal for first unread on initial data arrival
  useEffect(() => {
    if (modalShownRef.current || isLoading || announcements.length === 0) return;
    modalShownRef.current = true;
    const unread = announcements.filter(
      (a) => !announcementReadIds.includes(a.id),
    );
    if (unread.length > 0) {
      setPendingModal(unread[0]);
      setModalOpen(true);
    }
  }, [announcements, announcementReadIds, isLoading]);

  const handleAcknowledge = useCallback(() => {
    if (pendingModal) {
      markAnnouncementRead(pendingModal.id);
      setPendingModal(null);
    }
    setModalOpen(false);
  }, [pendingModal, markAnnouncementRead]);

  const unreadCount = announcements.filter(
    (a) => !announcementReadIds.includes(a.id),
  ).length;

  return (
    <>
      {/* Announcement Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="size-5 text-cyan-600" />
              公告
            </DialogTitle>
            {pendingModal && (
              <DialogDescription className="text-sm text-slate-600 leading-relaxed pt-2 whitespace-pre-wrap">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium mb-2 ${
                    pendingModal.type === "warning"
                      ? "bg-amber-50 text-amber-700"
                      : pendingModal.type === "error"
                      ? "bg-red-50 text-red-700"
                      : pendingModal.type === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {pendingModal.type === "info"
                    ? "通知"
                    : pendingModal.type === "warning"
                    ? "警告"
                    : pendingModal.type === "error"
                    ? "错误"
                    : "成功"}
                </span>
                <span className="mt-1 block">{pendingModal.content}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={handleAcknowledge}
              className="w-full sm:w-auto"
            >
              我已了解
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bell Icon */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label="公告"
            />
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-3 border-b border-border">
            <p className="text-sm font-bold text-slate-800">公告</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <p className="text-xs text-muted-foreground">加载中...</p>
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <p className="text-xs text-muted-foreground">暂无公告</p>
              </div>
            ) : (
              announcements.map((a) => {
                const isRead = announcementReadIds.includes(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 border-b border-border p-3 text-xs transition-colors last:border-0 hover:bg-muted/50 ${
                      isRead ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium mb-1 ${
                          a.type === "warning"
                            ? "bg-amber-50 text-amber-700"
                            : a.type === "error"
                            ? "bg-red-50 text-red-700"
                            : a.type === "success"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {a.type === "info"
                          ? "通知"
                          : a.type === "warning"
                          ? "警告"
                          : a.type === "error"
                          ? "错误"
                          : "成功"}
                      </span>
                      <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {a.content}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
