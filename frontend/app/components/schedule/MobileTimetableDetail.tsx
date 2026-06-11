"use client";

import { useSchedulerStore } from "~/lib/schedule/store";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { XIcon } from "lucide-react";
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
    <div className="fixed inset-0 z-[2100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[88vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
            <div className="text-sm font-extrabold">
              {parsed.name || course.courseName || "课程"}
            </div>
            <div className="text-[11px] opacity-90">
              {parsed.code || course.code}
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-[12px] text-slate-600">
              {parsed.teacherAndCode || "未知教师"}
            </div>
            <div className="text-[13px] leading-snug text-slate-800 whitespace-pre-wrap break-words">
              {parsed.arrangement}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
