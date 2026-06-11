import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
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

  // ── Initialize: load calendars on mount
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const { getAllCalendars } = await import("~/lib/schedule/api");
        const data = await getAllCalendars();
        if (data.length > 0) {
          useSchedulerStore.setState({ calendars: data });
        }
      } catch (e) {
        console.error("Failed to load calendars", e);
      } finally {
        setIsInitialized(true);
      }
    };
    init();
  }, []);


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

  if (!isInitialized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="text-sm">加载排课数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScheduleHeader />

      {/* Desktop layout */}
      <div className="hidden gap-4 md:grid md:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <StagedCourseList onOpenPicker={() => setPickerOpen(true)} />
          <ClassDetailTable onOpenReview={() => setReviewOpen(true)} />
        </div>
        <div className="min-w-0">
          <TimetableGrid onCellCoursesFound={handleCellCoursesFound} />
          <CreditSummary />
        </div>
      </div>

      {/* Mobile layout with tabs */}
      <div className="space-y-3 md:hidden">
        <Tabs defaultValue="timetable" className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsList className="grid w-full grid-cols-3">
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
