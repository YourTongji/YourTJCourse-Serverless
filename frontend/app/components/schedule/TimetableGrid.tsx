"use client";

import { useMemo, useCallback, useState, useRef } from "react";
import {
  DndContext,
  useDroppable,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useSchedulerStore } from "~/lib/schedule/store";
import { computeTimetableLayout } from "~/lib/schedule/timetable-utils";
import { useIsMobile } from "~/lib/schedule/responsive";
import TimetableCell from "./TimetableCell";
import type { CourseOnTable, CourseInfo, ClassDetail } from "~/lib/schedule/types";
import MobileTimetableDetail from "./MobileTimetableDetail";

const DAYS = ["一", "二", "三", "四", "五", "六", "日"] as const;

/** Section labels for 12-row and 11-row systems */
const SECTION_LABELS_12 = [
  "第一节(1-2)",
  "第二节(3-4)",
  "第三节(5-6)",
  "第四节(7-8)",
  "第五节(9)",
  "第六节(10-12)",
];
const SECTION_LABELS_11 = [
  "第一节(1-2)",
  "第二节(3-4)",
  "第三节(5-6)",
  "第四节(7-8)",
  "第五节(9-10)",
  "第六节(11)",
];

// ─── Droppable Cell ────────────────────────────────────────────────────────

function DroppableCell({
  row,
  day,
  isOccupied,
  children,
}: {
  row: number;
  day: number;
  isOccupied: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${row}-${day}` });

  return (
    <td
      ref={setNodeRef}
      className={`border border-slate-200 align-top text-center p-[2px] md:p-1 bg-white/60 transition-colors ${
        isOccupied
          ? ""
          : isOver
            ? "bg-green-100/90 ring-2 ring-green-400/60"
            : ""
      }`}
    >
      {children}
    </td>
  );
}

// ─── Drag Overlay Preview ──────────────────────────────────────────────────

function CourseDragOverlay({ courseName, courseCode }: { courseName: string; courseCode: string }) {
  return (
    <div className="rounded-xl bg-indigo-500 shadow-2xl px-4 py-2.5 text-white opacity-90">
      <div className="text-sm font-bold">{courseName}</div>
      <div className="text-[10px] font-mono text-indigo-100">{courseCode}</div>
    </div>
  );
}

// ─── Main Grid Component ───────────────────────────────────────────────────

interface TimetableGridProps {
  onCellCoursesFound?: (courses: CourseInfo[]) => void;
}

export default function TimetableGrid({ onCellCoursesFound }: TimetableGridProps) {
  const isMobile = useIsMobile();
  const timeTableData = useSchedulerStore((s) => s.timeTableData);
  const maxRows = useSchedulerStore((s) => s.maxRows);
  const calendarId = useSchedulerStore((s) => s.calendarId);
  const occupied = useSchedulerStore((s) => s.occupied);
  const clickTimeCell = useSchedulerStore((s) => s.clickTimeCell);
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);
  const selectClass = useSchedulerStore((s) => s.selectClass);
  const [showDetail, setShowDetail] = useState(false);
  const [detailCourse, setDetailCourse] = useState<CourseOnTable | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartPos = useRef({ x: 0, y: 0 });

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  const layout = useMemo(
    () => computeTimetableLayout(timeTableData, maxRows),
    [timeTableData, maxRows],
  );

  const cellHeight = isMobile ? 44 : 54;

  // ── Drag Handlers ───────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;

      const courseCode = String(active.id);
      const overId = String(over.id);
      if (!overId.startsWith("cell-")) return;

      const parts = overId.split("-");
      const row = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10) + 1; // back to 1-based

      // Find the course in staged courses
      const course = stagedCourses.find((c) => c.courseCode === courseCode);
      if (!course) return;

      // Find the first class section that has schedule data for this day/section
      let targetDetail: ClassDetail | null = null;
      for (const detail of course.courseDetail) {
        if (detail.arrangementInfo.length === 0) continue;
        for (const arr of detail.arrangementInfo) {
          if (arr.occupyDay === day && arr.occupyTime.includes(row + 1)) {
            targetDetail = detail;
            break;
          }
        }
        if (targetDetail) break;
      }

      // Fallback: pick the first class section with any schedule data
      if (!targetDetail) {
        targetDetail = course.courseDetail.find(
          (d) => d.arrangementInfo.length > 0,
        ) ?? null;
      }

      if (!targetDetail) return;

      const result = selectClass(targetDetail);
      if (!result.ok) {
        alert(`课程冲突：${result.conflict ?? ""}`);
      }
    },
    [stagedCourses, selectClass],
  );

  // ── Long Press / Touch ──────────────────────────────────────────────────

  const onPressStart = useCallback(
    (course: CourseOnTable, clientX: number, clientY: number) => {
      if (!isMobile) return;
      cancelPress();
      pressStartPos.current = { x: clientX, y: clientY };
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        setDetailCourse(course);
        setShowDetail(true);
      }, 420);
    },
    [isMobile],
  );

  const onPressMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!pressTimer.current) return;
      const dx = Math.abs(clientX - pressStartPos.current.x);
      const dy = Math.abs(clientY - pressStartPos.current.y);
      if (dx > 10 || dy > 10) cancelPress();
    },
    [],
  );

  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  const handleCellClick = useCallback(
    async (rowIndex: number, dayIndex: number) => {
      if (!calendarId) return;
      if (layout.cellOccupied[rowIndex]?.[dayIndex]) return;
      if ((occupied[rowIndex]?.[dayIndex] ?? []).length > 0) return;

      const day = dayIndex + 1;
      const rowToGroupMap: Record<number, number> = maxRows === 11
        ? { 0: 1, 2: 2, 4: 3, 6: 4, 8: 5, 10: 6 }
        : { 0: 1, 2: 2, 4: 3, 6: 4, 8: 5, 9: 6 };
      const section = rowToGroupMap[rowIndex];
      if (section === undefined) return;
      const courses = await clickTimeCell(day, section);
      if (courses.length > 0 && onCellCoursesFound) {
        onCellCoursesFound(courses);
      }
    },
    [calendarId, layout.cellOccupied, occupied, clickTimeCell, onCellCoursesFound, maxRows],
  );

  const sectionLabels =
    maxRows === 11 ? SECTION_LABELS_11 : SECTION_LABELS_12;

  // Get active course for DragOverlay
  const activeCourse = activeDragId
    ? stagedCourses.find((c) => c.courseCode === activeDragId)
    : null;

  const tableContent = (
    <table className="w-full min-w-0 border-collapse table-fixed">
      <thead>
        <tr className="bg-slate-100/80">
          <th className="border border-slate-200 p-1 md:p-2 text-[10px] md:text-xs font-semibold text-slate-700 w-[42px] md:w-[78px]">
            节次
          </th>
          {DAYS.map((day) => (
            <th
              key={day}
              className="border border-slate-200 p-1 md:p-2 text-[10px] md:text-xs font-semibold text-slate-700"
            >
              周{day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: maxRows }, (_, row) => {
          const isLastRow = row === maxRows - 1;
          return (
            <tr
              key={row}
              className={
                isLastRow && maxRows === 12
                  ? "bg-red-50"
                  : Math.floor(row / 2) % 2 === 0
                    ? "bg-white"
                    : "bg-gray-50"
              }
            >
              <td
                className={`border border-slate-200 text-center p-1 md:p-2 text-[10px] md:text-xs font-semibold bg-white/70 ${
                  isLastRow && maxRows === 12 ? "text-red-600" : "text-slate-700"
                }`}
                style={{ height: cellHeight }}
              >
                {(() => {
                  const sectionMap: Record<number, number> = {};
                  if (maxRows === 11) {
                    Object.assign(sectionMap, {
                      0: 1, 2: 2, 4: 3, 6: 4, 8: 5, 10: 6,
                    });
                  } else {
                    Object.assign(sectionMap, {
                      0: 1, 2: 2, 4: 3, 6: 4, 8: 5, 9: 6,
                    });
                  }
                  const labelIdx = sectionMap[row];
                  if (labelIdx !== undefined && sectionLabels[labelIdx - 1]) {
                    return (
                      <div>
                        <div className="text-[10px] md:text-xs">
                          {sectionLabels[labelIdx - 1].replace(/\(.*\)/, "")}
                        </div>
                        <div className="text-[8px] md:text-[10px] text-slate-400">
                          {sectionLabels[labelIdx - 1].match(/\(([^)]+)\)/)?.[1]}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </td>
              {Array.from({ length: 7 }, (_, day) => {
                if (layout.cellOccupied[row]?.[day]) return null;
                const courses = layout.timeTable[row]?.[day] ?? [];
                const span = layout.maxSpans[row]?.[day] ?? 1;
                const isOcc = (occupied[row]?.[day] ?? []).length > 0;

                return (
                  <DroppableCell
                    key={day}
                    row={row}
                    day={day}
                    isOccupied={isOcc}
                  >
                    {courses.length > 0 ? (
                      <div
                        className="h-full rounded-xl overflow-hidden"
                        style={{ height: span * cellHeight }}
                      >
                        {courses.map((course, ci) => (
                          <div
                            key={`${course.code}_${ci}`}
                            className={`h-full ${
                              ci !== courses.length - 1
                                ? "border-b border-dashed border-white/60"
                                : ""
                            }`}
                            onTouchStart={(e) => {
                              const t = e.touches[0];
                              onPressStart(course, t.clientX, t.clientY);
                            }}
                            onTouchMove={(e) => {
                              const t = e.touches[0];
                              onPressMove(t.clientX, t.clientY);
                            }}
                            onTouchEnd={cancelPress}
                            onTouchCancel={cancelPress}
                            onMouseDown={(e) =>
                              onPressStart(course, e.clientX, e.clientY)
                            }
                            onMouseUp={cancelPress}
                            onMouseLeave={cancelPress}
                          >
                            <TimetableCell
                              course={course}
                              isMobile={isMobile}
                              cellHeight={cellHeight}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className="w-full cursor-pointer"
                        style={{ height: cellHeight, minHeight: 44 }}
                        onClick={() => handleCellClick(row, day)}
                      />
                    )}
                  </DroppableCell>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // Desktop: wrap in DndContext; Mobile: plain table
  const tableWrapper = !isMobile ? (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {tableContent}
      <DragOverlay dropAnimation={null}>
        {activeCourse ? (
          <CourseDragOverlay
            courseName={activeCourse.courseName}
            courseCode={activeCourse.courseCode}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  ) : (
    tableContent
  );

  return (
    <div>
      <div className="overflow-x-hidden max-w-full rounded-2xl border border-slate-200 bg-white/70 shadow-sm">
        {isMobile && (
          <div className="px-3 pt-2 pb-1 text-[11px] text-slate-500">
            提示：长按课程块查看详细信息
          </div>
        )}
        {tableWrapper}
      </div>

      {/* Mobile detail portal */}
      {isMobile && showDetail && detailCourse && (
        <MobileTimetableDetail
          course={detailCourse}
          onClose={() => {
            setShowDetail(false);
            setDetailCourse(null);
          }}
        />
      )}
    </div>
  );
}
