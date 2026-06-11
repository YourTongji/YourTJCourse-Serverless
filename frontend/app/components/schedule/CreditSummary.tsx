"use client";

import { useSchedulerStore } from "~/lib/schedule/store";

export default function CreditSummary() {
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);
  const totalCredits = stagedCourses.reduce(
    (sum, c) => sum + (c.credit || 0),
    0,
  );

  if (stagedCourses.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span className="font-bold text-slate-700">已选学分</span>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-indigo-700">
          {totalCredits.toFixed(1)}
        </span>
        <span className="text-slate-400">共 {stagedCourses.length} 门课</span>
      </div>
    </div>
  );
}
