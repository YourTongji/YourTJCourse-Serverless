import { useState, useEffect, useCallback, useRef } from "react";
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
import { ANNOUNCEMENT_API, READ_KEY } from "~/lib/announcements";

interface Announcement {
  id: string;
  type: "info" | "warning" | "error" | "success";
  content: string;
  enabled: boolean;
}

function getReadIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markRead(id: string) {
  try {
    const ids = getReadIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem(READ_KEY, JSON.stringify(ids));
    }
  } catch {
    // ignore
  }
}

export default function AnnouncementBell() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingModal, setPendingModal] = useState<Announcement | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(ANNOUNCEMENT_API)
      .then((res) => res.json() as Promise<{ announcements: Announcement[] }>)
      .then((data) => {
        const active = data.announcements.filter((a) => a.enabled);
        setAnnouncements(active);

        // Check for unread announcements
        const readIds = getReadIds();
        const unread = active.filter((a) => !readIds.includes(a.id));
        if (unread.length > 0) {
          // Show the first unread as a modal
          setPendingModal(unread[0]);
          setModalOpen(true);
        }
      })
      .catch(() => {
        // silent
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAcknowledge = useCallback(() => {
    if (pendingModal) {
      markRead(pendingModal.id);
      setPendingModal(null);
    }
    setModalOpen(false);
  }, [pendingModal]);

  const unreadCount = announcements.filter(
    (a) => !getReadIds().includes(a.id),
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
                {pendingModal.content}
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
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <p className="text-xs text-muted-foreground">加载中...</p>
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <p className="text-xs text-muted-foreground">暂无公告</p>
              </div>
            ) : (
              announcements.map((a) => {
                const isRead = getReadIds().includes(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 border-b border-border p-3 text-xs transition-colors last:border-0 hover:bg-muted/50 ${
                      isRead ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="mt-1 text-slate-600 leading-relaxed whitespace-pre-wrap">
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
