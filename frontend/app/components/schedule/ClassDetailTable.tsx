"use client";

import { useSchedulerStore } from "~/lib/schedule/store";
import { useIsMobile } from "~/lib/schedule/responsive";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import type { ClassDetail } from "~/lib/schedule/types";

const STATUS_LABELS: Record<number, string> = {
  0: "未选择",
  1: "已选课",
  2: "已确认",
};

function formatCampus(val: string): string {
  if (!val) return "";
  const cleaned = val.replace(/^\[|\]$/g, "").replace(/"/g, "");
  return cleaned || val;
}

function getCampusClass(campus: string): string {
  const c = formatCampus(campus);
  if (c.includes("四平")) return "bg-cyan-50 text-cyan-700";
  if (c.includes("嘉定")) return "bg-amber-50 text-amber-700";
  if (c.includes("沪西")) return "bg-emerald-50 text-emerald-700";
  if (c.includes("沪北")) return "bg-purple-50 text-purple-700";
  return "bg-slate-100 text-slate-600";
}

function getStatusColor(status: number): string {
  if (status === 1) return "text-indigo-600";
  if (status === 2) return "text-green-600";
  return "text-slate-400";
}

interface ClassDetailTableProps {
  onOpenReview?: () => void;
}

export default function ClassDetailTable({ onOpenReview }: ClassDetailTableProps) {
  const isMobile = useIsMobile();
  const clickedCourse = useSchedulerStore((s) => s.clickedCourse);
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);
  const selectClass = useSchedulerStore((s) => s.selectClass);

  const selectedStaged = stagedCourses.find(
    (sc) => sc.courseCode === clickedCourse.courseCode,
  );
  const details = selectedStaged?.courseDetail ?? [];

  function handleSelect(detail: ClassDetail) {
    const result = selectClass(detail);
    if (!result.ok && result.conflict) {
      alert(`课程冲突：${result.conflict}`);
    }
  }

  if (!clickedCourse.courseCode) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 shadow-sm p-6 text-center text-sm text-slate-400">
        点击左侧课程查看班级详情
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 shadow-sm">
      <div className="flex items-center justify-between p-3 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-700 truncate">
            {clickedCourse.courseName}
          </h2>
          <p className="text-[11px] text-slate-400 font-mono">
            {clickedCourse.courseCode}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenReview}
        >
          查看评价
        </Button>
      </div>

      {details.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          暂无班级信息
        </div>
      ) : isMobile ? (
        <div className="p-3 space-y-3 max-h-[420px] overflow-auto">
          {details.map((d) => (
            <button
              key={d.code}
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-left active:scale-[0.99] transition-transform"
              onClick={() => handleSelect(d)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {d.isExclusive && (
                    <Badge variant="secondary" className="mb-1 text-[10px]">
                      专业课表
                    </Badge>
                  )}
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {d.code}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    <span>
                      教师：{d.teachers.map((t) => t.teacherName).join("、") ||
                        "未知"}
                    </span>
                    <span className="ml-2">
                      语言：{d.teachingLanguage || "-"}
                    </span>
                  </div>
                </div>
                <div
                  className={`shrink-0 text-[11px] font-semibold ${getStatusColor(d.status)}`}
                >
                  {STATUS_LABELS[d.status]}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span
                  className={`px-2 py-1 rounded-lg ${getCampusClass(d.campus)}`}
                >
                  {formatCampus(d.campus) || "-"}
                </span>
              </div>

              {d.arrangementInfo.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {d.arrangementInfo.map((arr, ai) => (
                    <div
                      key={`${d.code}_arr_${ai}`}
                      className="rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-700"
                    >
                      {arr.arrangementText}
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-auto max-h-[420px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium text-slate-500">
                  代码
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  校区
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  教师
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  安排
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  语言
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  状态
                </th>
              </tr>
            </thead>
            <tbody>
              {details.map((d) => (
                <tr
                  key={d.code}
                  className="border-t border-slate-100 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  onClick={() => handleSelect(d)}
                >
                  <td className="p-2 font-mono text-slate-600">
                    {d.isExclusive && (
                      <Badge
                        variant="secondary"
                        className="mr-1 text-[10px]"
                      >
                        专
                      </Badge>
                    )}
                    {d.code}
                  </td>
                  <td className="p-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${getCampusClass(d.campus)}`}
                    >
                      {formatCampus(d.campus) || "-"}
                    </span>
                  </td>
                  <td className="p-2 text-slate-600">
                    {d.teachers.map((t) => t.teacherName).join("、") || "-"}
                  </td>
                  <td className="p-2 text-slate-600 max-w-[200px] truncate">
                    {d.arrangementInfo.map((a) => a.arrangementText).join("; ") ||
                      "-"}
                  </td>
                  <td className="p-2 text-slate-600">
                    {d.teachingLanguage || "-"}
                  </td>
                  <td className="p-2">
                    <span
                      className={`font-semibold ${getStatusColor(d.status)}`}
                    >
                      {STATUS_LABELS[d.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
