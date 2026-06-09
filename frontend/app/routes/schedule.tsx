"use client";

import { useState, useCallback } from "react";
import type { CourseInfo } from "~/lib/schedule/types";
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

      {/* Mobile layout */}
      <div className="md:hidden p-2 space-y-3">
        <TimetableGrid onCellCoursesFound={handleCellCoursesFound} />
        <CreditSummary />
        <StagedCourseList onOpenPicker={() => setPickerOpen(true)} />
        <ClassDetailTable onOpenReview={() => setReviewOpen(true)} />
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
