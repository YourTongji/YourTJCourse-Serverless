"use client";

import { useState, useEffect } from "react";
import { useSchedulerStore } from "~/lib/schedule/store";
import { getOptionalCourseTypes, getOptionalCoursesByType } from "~/lib/schedule/api";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import type { CourseInfo } from "~/lib/schedule/types";

interface OptionalCourseTabProps {
  selectedKeys: string[];
  onToggle: (key: string) => void;
}

export default function OptionalCourseTab({
  selectedKeys,
  onToggle,
}: OptionalCourseTabProps) {
  const calendarId = useSchedulerStore((s) => s.calendarId);
  const optionalTypes = useSchedulerStore((s) => s.optionalTypes);
  const optionalCourses = useSchedulerStore((s) => s.optionalCourses);
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState<number | null>(null);

  const stagedCodes = new Set(stagedCourses.map((c) => c.courseCode));

  useEffect(() => {
    if (!calendarId) return;
    setLoading(true);
    Promise.all([
      getOptionalCourseTypes(calendarId).then((types) => {
        useSchedulerStore.setState({ optionalTypes: types });
        if (types.length > 0 && activeType === null) {
          setActiveType(types[0].courseLabelId);
        }
      }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [calendarId]);

  useEffect(() => {
    if (!calendarId || optionalTypes.length === 0) return;
    setLoading(true);
    getOptionalCoursesByType(
      calendarId,
      optionalTypes.map((t) => t.courseLabelId),
    )
      .then((courses) => {
        useSchedulerStore.setState({ optionalCourses: courses });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [calendarId, optionalTypes.length]);

  // Filter courses for the active type
  const activeCourses = (() => {
    if (activeType === null) return [];
    // CourseInfo doesn't have a direct type label — we use the label name to match
    return optionalCourses.filter(
      (c) =>
        !stagedCodes.has(c.courseCode),
    );
  })();

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (optionalTypes.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        暂无可选通识选修课类型
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 p-3 border-b border-slate-100">
        {optionalTypes.map((type) => (
          <button
            key={type.courseLabelId}
            type="button"
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              activeType === type.courseLabelId
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            onClick={() => setActiveType(type.courseLabelId)}
          >
            {type.courseLabelName}
          </button>
        ))}
      </div>

      <div className="max-h-[400px] overflow-auto">
        {activeCourses.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            该分类暂无可选课程
          </div>
        ) : (
          activeCourses.map((course) => {
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
                    {course.faculty && <span>{course.faculty}</span>}
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
