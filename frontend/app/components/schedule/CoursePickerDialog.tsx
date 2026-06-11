"use client";

import { useState, useCallback } from "react";
import { useSchedulerStore } from "~/lib/schedule/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import CompulsoryCourseTab from "./CompulsoryCourseTab";
import OptionalCourseTab from "./OptionalCourseTab";
import AdvancedSearchTab from "./AdvancedSearchTab";
import type { CourseInfo } from "~/lib/schedule/types";

interface CoursePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CoursePickerDialog({
  open,
  onOpenChange,
}: CoursePickerDialogProps) {
  const stageCourses = useSchedulerStore((s) => s.stageCourses);
  const compulsoryCourses = useSchedulerStore((s) => s.compulsoryCourses);
  const optionalCourses = useSchedulerStore((s) => s.optionalCourses);
  const searchCourses = useSchedulerStore((s) => s.searchCourses);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleToggle = useCallback((key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  async function handleSubmit() {
    if (selectedKeys.length === 0) return;
    setSubmitting(true);
    try {
      // Extract real course codes from selected keys (strip prefix if any)
      const codes = selectedKeys.map((k) => {
        // Remove prefix like "查_" from search tab
        return k.startsWith("查_") ? k.slice(2) : k;
      });
      const courseInfoByCode: Record<string, Partial<CourseInfo>> = {};
      for (const course of [
        ...compulsoryCourses,
        ...optionalCourses,
        ...searchCourses,
      ]) {
        if (codes.includes(course.courseCode)) {
          courseInfoByCode[course.courseCode] = course;
        }
      }
      await stageCourses(codes, courseInfoByCode);
      setSelectedKeys([]);
      onOpenChange(false);
    } catch {
      // noop
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>选择课程</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="compulsory" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger
              value="compulsory"
              className="text-xs data-active:text-indigo-600"
            >
              计划内课程
            </TabsTrigger>
            <TabsTrigger
              value="optional"
              className="text-xs data-active:text-indigo-600"
            >
              通识选修课
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="text-xs data-active:text-indigo-600"
            >
              高级检索
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compulsory" className="flex-1 overflow-auto">
            <CompulsoryCourseTab
              selectedKeys={selectedKeys}
              onToggle={handleToggle}
            />
          </TabsContent>
          <TabsContent value="optional" className="flex-1 overflow-auto">
            <OptionalCourseTab
              selectedKeys={selectedKeys}
              onToggle={handleToggle}
            />
          </TabsContent>
          <TabsContent value="search" className="flex-1 overflow-auto">
            <AdvancedSearchTab
              selectedKeys={selectedKeys}
              onToggle={handleToggle}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            已选 {selectedKeys.length} 门
          </div>
          <Button
            onClick={handleSubmit}
            disabled={selectedKeys.length === 0 || submitting}
          >
            {submitting ? "提交中..." : `提交 (${selectedKeys.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
