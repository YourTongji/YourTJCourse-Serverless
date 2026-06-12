"use client";

import { useState, useEffect } from "react";
import { useSchedulerStore } from "~/lib/schedule/store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { useIsMobile } from "~/lib/schedule/responsive";
import StarRating from "~/components/StarRating";

interface ReviewEntry {
  id?: number;
  rating?: number;
  comment?: string;
  reviewer?: string;
  createdAt?: string;
  reviewer_name?: string;
  created_at?: string | number;
}

interface ReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReviewDrawer({ open, onOpenChange }: ReviewDrawerProps) {
  const isMobile = useIsMobile();
  const clickedCourse = useSchedulerStore((s) => s.clickedCourse);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !clickedCourse.courseCode) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (clickedCourse.teacherName) params.set("teacherName", clickedCourse.teacherName);
    if (clickedCourse.teacherCode) params.set("teacherCode", clickedCourse.teacherCode);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    fetch(`/api/course/by-code/${encodeURIComponent(clickedCourse.courseCode)}${suffix}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json() as Promise<{ reviews?: ReviewEntry[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setReviews(data.reviews ?? []);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clickedCourse.courseCode, clickedCourse.teacherCode, clickedCourse.teacherName]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "h-[75vh] rounded-t-2xl" : "w-[400px] sm:max-w-[400px]"}
      >
        <SheetHeader>
          <SheetTitle>
            {clickedCourse.courseName || "课程评价"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto mt-4 space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </>
          ) : reviews.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              暂无课程评价
            </div>
          ) : (
            reviews.map((review, idx) => (
              <div
                key={review.id ?? idx}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">
                    {review.reviewer || review.reviewer_name || "匿名用户"}
                  </span>
                  {review.rating != null && (
                    <StarRating rating={review.rating} size={12} />
                  )}
                </div>
                {review.comment && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {review.comment}
                  </p>
                )}
                {(review.createdAt || review.created_at) && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    {(() => {
                      const raw = review.createdAt || review.created_at || "";
                      const d = typeof raw === "number" ? new Date(raw * 1000) : new Date(raw);
                      return d.toLocaleDateString("zh-CN");
                    })()}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
