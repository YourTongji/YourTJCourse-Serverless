"use client";

import { cn } from "~/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import type { CourseOnTable } from "~/lib/schedule/types";

function parseShowText(raw: string) {
  const text = String(raw || "").trim();
  const m = /^(\S+)\s+(.+?)\(([^)]+)\)\s+(.+)$/.exec(text);
  if (!m) {
    return { teacherAndCode: "", name: "", code: "", arrangement: text };
  }
  return {
    teacherAndCode: m[1],
    name: m[2].trim(),
    code: m[3].trim(),
    arrangement: m[4].trim(),
  };
}

interface MobileTimetableDetailProps {
  course: CourseOnTable;
  onClose: () => void;
}

export default function MobileTimetableDetail({
  course,
  onClose,
}: MobileTimetableDetailProps) {
  const parsed = parseShowText(course.showText || "");

  return (
    <Sheet open={!!course} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="max-h-[70vh]">
        <SheetHeader>
          <SheetTitle>
            {parsed.name || course.courseName || "课程"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-mono",
              "border border-slate-200 bg-slate-50 text-slate-600",
            )}
          >
            {parsed.code || course.code}
          </div>

          <div className="text-sm text-slate-600">
            {parsed.teacherAndCode || "未知教师"}
          </div>

          <div className="text-sm leading-snug text-slate-800 whitespace-pre-wrap break-words">
            {parsed.arrangement}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
