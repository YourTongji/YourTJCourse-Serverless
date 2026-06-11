"use client";

import { useSchedulerStore } from "~/lib/schedule/store";
import { useIsMobile } from "~/lib/schedule/responsive";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Trash2Icon, SaveIcon, PlusIcon, GripVerticalIcon } from "lucide-react";
import type { StagedCourse } from "~/lib/schedule/types";

const STATUS_LABELS: Record<number, string> = {
  0: "未选择",
  1: "已选课",
  2: "已确认",
};

const STATUS_VARIANTS: Record<number, "secondary" | "default" | "outline"> = {
  0: "outline",
  1: "secondary",
  2: "default",
};

// ─── Draggable Row (desktop only) ───────────────────────────────────────

function DraggableRow({
  course,
  onRemove,
}: {
  course: StagedCourse;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: course.courseCode });

  const setClickedCourse = useSchedulerStore((s) => s.setClickedCourse);

  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        position: "relative",
        zIndex: isDragging ? 50 : 0,
        opacity: isDragging ? 0.3 : 1,
        boxShadow: isDragging
          ? "0 12px 32px rgba(15,23,42,0.18)"
          : undefined,
      }
    : {
        position: "relative",
        zIndex: isDragging ? 50 : 0,
      };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "border-t border-slate-100 transition-colors",
        isDragging ? "bg-indigo-50/80" : "hover:bg-slate-50",
      )}
    >
      <td className="p-1 w-8">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 touch-none"
          aria-label="拖动课程"
          {...listeners}
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
      </td>
      <td className="p-2 font-mono text-slate-600">{course.courseCode}</td>
      <td className="p-2">
        <button
          type="button"
          className="text-slate-800 hover:text-indigo-600 text-left max-w-[180px] truncate block"
          onClick={() =>
            setClickedCourse({
              courseCode: course.courseCode,
              courseName: course.courseName,
              teacherCode: course.teacher[0]?.teacherCode ?? "",
              teacherName: course.teacher[0]?.teacherName ?? "",
            })
          }
        >
          {course.courseName}
        </button>
      </td>
      <td className="p-2 text-right text-slate-600">
        {(course.credit as number).toFixed(1)}
      </td>
      <td className="p-2 text-slate-600 max-w-[100px] truncate">
        {course.teacher.map((t) => t.teacherName).join("、") || "-"}
      </td>
      <td className="p-2">
        <Badge
          variant={STATUS_VARIANTS[course.status] ?? "outline"}
          className="text-[10px]"
        >
          {STATUS_LABELS[course.status]}
        </Badge>
      </td>
      <td className="p-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          className="text-red-400 hover:text-red-600"
        >
          <Trash2Icon className="size-3" />
        </Button>
      </td>
    </tr>
  );
}

interface StagedCourseListProps {
  onOpenPicker?: () => void;
}

export default function StagedCourseList({ onOpenPicker }: StagedCourseListProps) {
  const isMobile = useIsMobile();
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);
  const removeCourse = useSchedulerStore((s) => s.removeCourse);
  const setClickedCourse = useSchedulerStore((s) => s.setClickedCourse);
  const confirmSelection = useSchedulerStore((s) => s.confirmSelection);

  const totalCredits = stagedCourses.reduce(
    (sum, c) => sum + (c.credit || 0),
    0,
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 shadow-sm">
      <div className="flex items-center justify-between p-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">
          已选课程 ({stagedCourses.length})
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onOpenPicker}
          >
            <PlusIcon className="size-3.5" />
            <span className="hidden sm:inline text-xs">选择课程</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={confirmSelection}
            disabled={stagedCourses.length === 0}
          >
            <SaveIcon className="size-3.5" />
            <span className="hidden sm:inline text-xs">保存课表</span>
          </Button>
        </div>
      </div>

      {stagedCourses.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          还未选择课程，点击上方「选择课程」开始
        </div>
      ) : isMobile ? (
        <div className="p-3 space-y-2 max-h-[400px] overflow-auto">
          {stagedCourses.map((course) => (
            <div
              key={course.courseCode}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="text-sm font-semibold text-slate-800 text-left hover:text-indigo-600 truncate w-full"
                    onClick={() =>
                      setClickedCourse({
                        courseCode: course.courseCode,
                        courseName: course.courseName,
                        teacherCode: course.teacher[0]?.teacherCode ?? "",
                        teacherName: course.teacher[0]?.teacherName ?? "",
                      })
                    }
                  >
                    {course.courseName}
                  </button>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                    <span className="font-mono">{course.courseCode}</span>
                    {course.credit > 0 && (
                      <span>{(course.credit as number).toFixed(1)} 学分</span>
                    )}
                    <Badge
                      variant={STATUS_VARIANTS[course.status] ?? "outline"}
                      className="text-[10px]"
                    >
                      {STATUS_LABELS[course.status]}
                    </Badge>
                  </div>
                  {course.teacher.length > 0 && (
                    <div className="mt-1 text-[11px] text-slate-400">
                      {course.teacher.map((t) => t.teacherName).join("、")}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeCourse(course.courseCode)}
                  className="text-red-400 hover:text-red-600 shrink-0"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-auto max-h-[420px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-1 w-8" />
                <th className="text-left p-2 font-medium text-slate-500">
                  课号
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  课程名
                </th>
                <th className="text-right p-2 font-medium text-slate-500">
                  学分
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  教师
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  状态
                </th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {stagedCourses.map((course) => (
                <DraggableRow
                  key={course.courseCode}
                  course={course}
                  onRemove={() => removeCourse(course.courseCode)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td
                  colSpan={7}
                  className="p-2 text-right text-xs font-semibold text-slate-700"
                >
                  总学分：{totalCredits.toFixed(1)}（{stagedCourses.length}门课）
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
