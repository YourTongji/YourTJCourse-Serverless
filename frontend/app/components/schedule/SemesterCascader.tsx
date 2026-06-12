"use client";

import { Loader2 } from "lucide-react";
import { useSchedulerStore } from "~/lib/schedule/store";

const LABEL_CLASS = "text-xs text-slate-500 mb-0.5";
const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function SemesterCascader() {
  const calendarId = useSchedulerStore((s) => s.calendarId);
  const grade = useSchedulerStore((s) => s.grade);
  const major = useSchedulerStore((s) => s.major);
  const calendars = useSchedulerStore((s) => s.calendars);
  const grades = useSchedulerStore((s) => s.grades);
  const majors = useSchedulerStore((s) => s.majors);
  const gradesLoading = useSchedulerStore((s) => s.gradesLoading);
  const majorsLoading = useSchedulerStore((s) => s.majorsLoading);
  const selectCalendar = useSchedulerStore((s) => s.selectCalendar);
  const selectGrade = useSchedulerStore((s) => s.selectGrade);
  const selectMajor = useSchedulerStore((s) => s.selectMajor);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Semester */}
      <div className="flex flex-col">
        <span className={LABEL_CLASS}>学期</span>
        <select
          className={SELECT_CLASS}
          value={calendarId ?? ""}
          disabled={calendars.length === 0}
          onChange={(e) => {
            const v = e.target.value;
            if (v) selectCalendar(Number(v));
          }}
        >
          <option value="" disabled>
            {calendars.length === 0 ? "加载中..." : "请选择学期"}
          </option>
          {calendars.map((cal) => (
            <option key={cal.calendarId} value={cal.calendarId}>
              {cal.calendarName}
            </option>
          ))}
        </select>
      </div>

      {/* Grade */}
      <div className="flex flex-col">
        <span className={`${LABEL_CLASS} inline-flex items-center gap-1`}>
          年级
          {gradesLoading && <Loader2 className="size-3 animate-spin" />}
        </span>
        <select
          className={SELECT_CLASS}
          value={grade ?? ""}
          disabled={!calendarId}
          onChange={(e) => {
            const v = e.target.value;
            if (v) selectGrade(Number(v));
          }}
        >
          <option value="" disabled>
            {!calendarId ? "请先选择学期" : gradesLoading && grades.length === 0 ? "加载中..." : "请选择年级"}
          </option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      {/* Major */}
      <div className="flex flex-col min-w-[120px] flex-1">
        <span className={`${LABEL_CLASS} inline-flex items-center gap-1`}>
          专业
          {majorsLoading && <Loader2 className="size-3 animate-spin" />}
        </span>
        <select
          className={SELECT_CLASS}
          value={major ?? ""}
          disabled={!grade}
          onChange={(e) => {
            const v = e.target.value;
            if (v) selectMajor(v);
          }}
        >
          <option value="" disabled>
            {!grade ? "请先选择年级" : majorsLoading && majors.length === 0 ? "加载中..." : "请选择专业"}
          </option>
          {majors.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}