"use client";

import { useState, useEffect } from "react";
import { useSchedulerStore } from "~/lib/schedule/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { useIsMobile } from "~/lib/schedule/responsive";
import type { CourseInfo } from "~/lib/schedule/types";

interface OptionalCourseSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Courses returned by the clickTimeCell action */
  courses: CourseInfo[];
}

export default function OptionalCourseSelector({
  open,
  onOpenChange,
  courses,
}: OptionalCourseSelectorProps) {
  const isMobile = useIsMobile();
  const stageCourses = useSchedulerStore((s) => s.stageCourses);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) setSelectedKeys([]);
  }, [open]);

  function handleToggle(key: string) {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleSubmit() {
    if (selectedKeys.length === 0) return;
    setSubmitting(true);
    try {
      const courseInfoByCode: Record<string, Partial<CourseInfo>> = {};
      for (const course of courses) {
        if (selectedKeys.includes(course.courseCode)) {
          courseInfoByCode[course.courseCode] = course;
        }
      }
      await stageCourses(selectedKeys, courseInfoByCode);
      onOpenChange(false);
    } catch {
      // noop
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[70vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>该时间段可选课程</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto -mx-4 px-4">
          {courses.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              该时间段暂无可选课程
            </div>
          ) : (
            <div className="space-y-1">
              {courses.map((course) => {
                const checked = selectedKeys.includes(course.courseCode);
                return (
                  <label
                    key={course.courseCode}
                    className="flex items-center gap-2 px-2 py-2 hover:bg-slate-50 cursor-pointer rounded-lg"
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => handleToggle(course.courseCode)}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-800 truncate">
                        {course.courseName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                        <span className="font-mono">{course.courseCode}</span>
                        <span>{course.credit} 学分</span>
                        {course.courseType && <span>{course.courseType}</span>}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t mt-3">
          <span className="text-xs text-slate-500">
            已选 {selectedKeys.length} 门
          </span>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={selectedKeys.length === 0 || submitting}
          >
            {submitting ? "添加中..." : "添加到已选"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
