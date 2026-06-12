"use client";

import { useState } from "react";
import { useSchedulerStore } from "~/lib/schedule/store";
import { useIsMobile } from "~/lib/schedule/responsive";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { SearchIcon } from "lucide-react";
import type { CourseInfo } from "~/lib/schedule/types";

interface CompulsoryCourseTabProps {
  selectedKeys: string[];
  onToggle: (key: string) => void;
}

export default function CompulsoryCourseTab({
  selectedKeys,
  onToggle,
}: CompulsoryCourseTabProps) {
  const isMobile = useIsMobile();
  const calendarId = useSchedulerStore((s) => s.calendarId);
  const grade = useSchedulerStore((s) => s.grade);
  const major = useSchedulerStore((s) => s.major);
  const compulsoryCourses = useSchedulerStore((s) => s.compulsoryCourses);
  const compulsoryLoading = useSchedulerStore((s) => s.compulsoryLoading);
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);
  const [search, setSearch] = useState("");

  const stagedCodes = new Set(stagedCourses.map((c) => c.courseCode));


  // Filter out already staged courses
  const availableCourses = compulsoryCourses.filter(
    (c) => !stagedCodes.has(c.courseCode),
  );

  const filtered = search
    ? availableCourses.filter(
        (c) =>
          c.courseName.includes(search) || c.courseCode.includes(search),
      )
    : availableCourses;

  // Group by grade
  const grouped = new Map<number, CourseInfo[]>();
  for (const course of filtered) {
    const g = course.grade ?? 0;
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(course);
  }
  const sortedGrades = [...grouped.keys()].sort((a, b) => a - b);

  if (compulsoryLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (availableCourses.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        {!major ? "请先选择专业" : "暂无可选课程"}
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <Input
            className="pl-8 h-7 text-xs"
            placeholder="搜索课程名称或代码..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="max-h-[400px] overflow-auto">
        {sortedGrades.map((g) => (
          <div key={g}>
            <div className="sticky top-0 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 border-b border-slate-100">
              {g} 级
            </div>
            {grouped.get(g)!.map((course) => {
              const key = course.courseCode;
              const checked = selectedKeys.includes(key);
              return (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50"
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => onToggle(key)}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {course.courseName}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                      <span className="font-mono">{course.courseCode}</span>
                      <span>{course.credit} 学分</span>
                      <span>{course.courseType}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
