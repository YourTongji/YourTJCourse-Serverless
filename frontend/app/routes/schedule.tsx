"use client";

import { useState, useCallback, useEffect } from "react";
import type { CourseInfo } from "~/lib/schedule/types";
import { useSchedulerStore } from "~/lib/schedule/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import ScheduleHeader from "~/components/schedule/ScheduleHeader";
import TimetableGrid from "~/components/schedule/TimetableGrid";
import StagedCourseList from "~/components/schedule/StagedCourseList";
import ClassDetailTable from "~/components/schedule/ClassDetailTable";
import CreditSummary from "~/components/schedule/CreditSummary";
import CoursePickerDialog from "~/components/schedule/CoursePickerDialog";
import OptionalCourseSelector from "~/components/schedule/OptionalCourseSelector";
import ReviewDrawer from "~/components/schedule/ReviewDrawer";

export default function Schedule() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timeCellOpen, setTimeCellOpen] = useState(false);
  const [timeCellCourses, setTimeCellCourses] = useState<CourseInfo[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);

  // ── Persistence restoration: when cascade values are restored from
  //     localStorage by Zustand persist middleware, trigger compulsory
  //     course load if the list is still empty.
  const calendarId = useSchedulerStore((s) => s.calendarId);
  const grade = useSchedulerStore((s) => s.grade);
  const major = useSchedulerStore((s) => s.major);
  const compulsoryCourses = useSchedulerStore((s) => s.compulsoryCourses);
  const loadCompulsoryCourses = useSchedulerStore((s) => s.loadCompulsoryCourses);

  useEffect(() => {
    if (
      calendarId !== null &&
      grade !== null &&
      major !== null &&
      compulsoryCourses.length === 0
    ) {
      loadCompulsoryCourses();
    }
  }, [calendarId, grade, major, compulsoryCourses.length, loadCompulsoryCourses]);

  const handleCellCoursesFound = useCallback((courses: CourseInfo[]) => {
    setTimeCellCourses(courses);
    setTimeCellOpen(true);
  }, []);

  return (
    <div className="min-h-screen pb-8">
      <ScheduleHeader />

      {/* Desktop layout */}
      <div className="hidden md:flex gap-4 p-4">
        <div className="w-2/5 flex flex-col gap-4">
          <StagedCourseList onOpenPicker={() => setPickerOpen(true)} />
          <ClassDetailTable onOpenReview={() => setReviewOpen(true)} />
        </div>
        <div className="w-3/5">
          <TimetableGrid onCellCoursesFound={handleCellCoursesFound} />
          <CreditSummary />
        </div>
      </div>

      {/* Mobile layout with tabs */}
      <div className="md:hidden p-2 space-y-3">
        <Tabs defaultValue="timetable">
          <TabsList className="w-full">
            <TabsTrigger value="timetable">课表</TabsTrigger>
            <TabsTrigger value="courses">选课</TabsTrigger>
            <TabsTrigger value="details">详情</TabsTrigger>
          </TabsList>
          <TabsContent value="timetable">
            <TimetableGrid onCellCoursesFound={handleCellCoursesFound} />
            <CreditSummary />
          </TabsContent>
          <TabsContent value="courses">
            <StagedCourseList onOpenPicker={() => setPickerOpen(true)} />
          </TabsContent>
          <TabsContent value="details">
            <ClassDetailTable onOpenReview={() => setReviewOpen(true)} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <CoursePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
      <OptionalCourseSelector
        open={timeCellOpen}
        onOpenChange={setTimeCellOpen}
        courses={timeCellCourses}
      />
      <ReviewDrawer
        open={reviewOpen}
        onOpenChange={setReviewOpen}
      />
    </div>
  );
}
