"use client";

import { useState, useEffect } from "react";
import { useSchedulerStore } from "~/lib/schedule/store";
import {
  getAllCampuses,
  getAllFaculties,
  findCourseBySearch,
} from "~/lib/schedule/api";
import { useIsMobile } from "~/lib/schedule/responsive";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Skeleton } from "~/components/ui/skeleton";
import { SearchIcon } from "lucide-react";
import type { CampusOption, FacultyOption, CourseInfo } from "~/lib/schedule/types";

/** Flatten array/string fields like courseNature, campus */
function formatList(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[]" || trimmed === '[""]') return "";
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return formatList(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => formatList(item).split("、"))
      .map((item) => item.trim())
      .filter(Boolean)
      .join("、");
  }
  return "";
}

interface AdvancedSearchTabProps {
  selectedKeys: string[];
  onToggle: (key: string) => void;
}

export default function AdvancedSearchTab({
  selectedKeys,
  onToggle,
}: AdvancedSearchTabProps) {
  const isMobile = useIsMobile();
  const calendarId = useSchedulerStore((s) => s.calendarId);
  const searchCourses = useSchedulerStore((s) => s.searchCourses);
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);
  const [loading, setLoading] = useState(false);
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [faculties, setFaculties] = useState<FacultyOption[]>([]);
  const [form, setForm] = useState({
    courseName: "",
    courseCode: "",
    teacherCode: "",
    teacherName: "",
    campus: "",
    faculty: "",
  });

  const stagedCodes = new Set(stagedCourses.map((c) => c.courseCode));

  useEffect(() => {
    if (!calendarId) return;
    Promise.all([
      getAllCampuses(calendarId).then(setCampuses).catch(() => {}),
      getAllFaculties(calendarId).then(setFaculties).catch(() => {}),
    ]);
  }, [calendarId]);

  async function handleSearch() {
    if (!calendarId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v) params[k] = v;
      }
      const result = await findCourseBySearch(calendarId, params);
      useSchedulerStore.setState({ searchCourses: result.courses });
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  // Filter out staged courses
  const availableCourses = searchCourses.filter(
    (c) => !stagedCodes.has(c.courseCode),
  );

  function renderMobileCard(course: CourseInfo) {
    const key = `查_${course.courseCode}`;
    const checked = selectedKeys.includes(key);
    return (
      <button
        key={key}
        type="button"
        className={`w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.99] ${
          checked ? "border-cyan-400 ring-2 ring-cyan-100" : "border-slate-200"
        }`}
        onClick={() => onToggle(key)}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-cyan-600"
            checked={checked}
            onChange={() => onToggle(key)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-snug text-slate-900">
              {course.courseName}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono">
                {course.courseCode}
              </span>
              <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-cyan-800">
                {course.credit} 学分
              </span>
              {course.faculty && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
                  {course.faculty}
                </span>
              )}
            </div>
            <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
              {course.courseType && <div>性质：{course.courseType}</div>}
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div>
      {/* Search form */}
      <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-3 border-b border-slate-100">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-500">课程名称</label>
          <Input
            className="h-7 text-xs"
            placeholder="课程名称"
            value={form.courseName}
            onChange={(e) =>
              setForm((f) => ({ ...f, courseName: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-500">课程代码</label>
          <Input
            className="h-7 text-xs"
            placeholder="课程代码"
            value={form.courseCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, courseCode: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-500">教师工号</label>
          <Input
            className="h-7 text-xs"
            placeholder="教师工号"
            value={form.teacherCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, teacherCode: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-500">教师姓名</label>
          <Input
            className="h-7 text-xs"
            placeholder="教师姓名"
            value={form.teacherName}
            onChange={(e) =>
              setForm((f) => ({ ...f, teacherName: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-500">校区</label>
          <select
            className="h-7 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={form.campus}
            onChange={(e) => setForm((f) => ({ ...f, campus: e.target.value }))}
          >
            <option value="">全部</option>
            {campuses.map((c) => (
              <option
                key={c.campusId || c.campusName}
                value={c.campusName}
              >
                {c.campusName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-500">开课学院</label>
          <select
            className="h-7 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={form.faculty}
            onChange={(e) =>
              setForm((f) => ({ ...f, faculty: e.target.value }))
            }
          >
            <option value="">全部</option>
            {faculties.map((f) => (
              <option
                key={f.facultyId || f.facultyName}
                value={f.facultyName}
              >
                {f.facultyName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-3">
        <Button size="sm" onClick={handleSearch} disabled={loading}>
          <SearchIcon className="size-3.5" />
          {loading ? "搜索中..." : "搜索"}
        </Button>
      </div>

      {/* Results */}
      <div className="max-h-[400px] overflow-auto border-t border-slate-100">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : availableCourses.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            {searchCourses.length > 0
              ? "所有搜索结果已在已选列表中"
              : "请输入搜索条件并点击搜索"}
          </div>
        ) : isMobile ? (
          <div className="space-y-3 p-3">
            {availableCourses.map(renderMobileCard)}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-2 w-10">
                  <span className="sr-only">选择</span>
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  代码
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  名称
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  学院
                </th>
                <th className="text-right p-2 font-medium text-slate-500">
                  学分
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  性质
                </th>
                <th className="text-left p-2 font-medium text-slate-500">
                  校区
                </th>
              </tr>
            </thead>
            <tbody>
              {availableCourses.map((course, idx) => {
                const key = `查_${course.courseCode}`;
                const checked = selectedKeys.includes(key);
                return (
                  <tr
                    key={key}
                    className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${
                      idx % 2 === 1 ? "bg-gray-50" : ""
                    }`}
                    onClick={() => onToggle(key)}
                  >
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={checked}
                        onChange={() => onToggle(key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="p-2 font-mono text-slate-600">
                      {course.courseCode}
                    </td>
                    <td className="p-2 text-slate-800 max-w-[200px] truncate">
                      {course.courseName}
                    </td>
                    <td className="p-2 text-slate-600">
                      {course.faculty || "-"}
                    </td>
                    <td className="p-2 text-right text-slate-600">
                      {course.credit}
                    </td>
                    <td className="p-2 text-slate-600 max-w-[120px] truncate">
                      {course.courseType || formatList((course as any).courseNature) || "-"}
                    </td>
                    <td className="p-2 text-slate-600 max-w-[120px] truncate">
                      {formatList((course as any).campus) || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
