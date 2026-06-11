"use client";

import type { CourseOnTable } from "~/lib/schedule/types";

/** Deterministic HSL hue from a string hash — ported from TimeTable.vue */
function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** Strip parenthetical remarks from the course name and truncate. */
function compactName(name: string): string {
  const cleaned = String(name || "")
    .replace(/[（(][^()（）]*[）)]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return "课程";
  const chars = Array.from(cleaned);
  return chars.length > 7 ? `${chars.slice(0, 6).join("")}…` : cleaned;
}

interface ParsedShowText {
  teacherAndCode: string;
  name: string;
  code: string;
  arrangement: string;
}

function parseShowText(raw: string): ParsedShowText {
  const text = String(raw || "").trim();
  const m = /^(\S+)\s+(.+?)\(([^)]+)\)\s+(.+)$/.exec(text);
  if (!m) {
    return { teacherAndCode: "", name: "", code: "", arrangement: text };
  }
  return {
    teacherAndCode: m[1],
    name: m[2].trim(),
    code: m[3].trim(),
    arrangement: m[4].trim(),
  };
}

interface TimetableCellProps {
  course: CourseOnTable;
  isMobile: boolean;
  cellHeight: number;
  /** When true, render compact mobile layout */
  onClick?: () => void;
}

export function formatCourseForMobile(course: CourseOnTable): {
  title: string;
  mobileTitle: string;
  mobileMeta: string;
  teacherAndCode: string;
  sub: string;
} {
  const raw = String(course.showText || "").trim();
  const m = /^(\S+)\s+(.+?)\(([^)]+)\)\s+(.+)$/.exec(raw);
  if (m) {
    const teacher = m[1];
    const name = m[2].trim();
    const code = m[3].trim();
    const rest = m[4].trim();
    const dayMatch = rest.match(/(星期[一二三四五六日])(\d{1,2}-\d{1,2})节/);
    const weekMatch = rest.match(/\[([^\]]+)\]/);
    const roomMatch = rest.match(/\]\s*(.+)$/);
    const shortDay = dayMatch
      ? `${dayMatch[1].replace("星期", "周")}${dayMatch[2]}`
      : "";
    const weekText = weekMatch ? weekMatch[1] : "";
    let room = roomMatch ? roomMatch[1].trim() : "";
    // Clean room for mobile compactness
    const compactTeacher = teacher.replace(/[A-Z0-9]+$/i, "").trim();
    const compactRoom = room
      .replace(/校区/g, "")
      .replace(/教学楼|学院楼|综合楼/g, "")
      .replace(/\s+/g, "")
      .trim();
    return {
      title: `${teacher} ${name}(${code})`,
      mobileTitle: compactName(name),
      mobileMeta: [compactTeacher, compactRoom].filter(Boolean).join(" · "),
      teacherAndCode: teacher,
      sub: [shortDay, weekText, room].filter(Boolean).join(" "),
    };
  }
  const fallback = course.courseName || course.code || "课程";
  return {
    title: fallback,
    mobileTitle: compactName(fallback),
    mobileMeta: course.code || "",
    teacherAndCode: "",
    sub: raw,
  };
}

export default function TimetableCell({
  course,
  isMobile,
  cellHeight,
  onClick,
}: TimetableCellProps) {
  const hue = hashHue(course.code || course.courseName || course.showText || "course");
  const hue2 = (hue + 24) % 360;

  if (isMobile) {
    const fmt = formatCourseForMobile(course);
    return (
      <button
        type="button"
        className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl px-0.5"
        style={{
          background: `linear-gradient(135deg, hsl(${hue},82%,52%), hsl(${hue2},82%,42%))`,
          minHeight: cellHeight,
        }}
        onClick={onClick}
      >
        <span
          className="max-w-full overflow-hidden text-ellipsis text-center text-[9.5px] font-extrabold leading-tight text-white break-words"
          style={{
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            display: "-webkit-box",
            textShadow: "0 1px 2px rgb(15 23 42 / 0.24)",
          }}
        >
          {fmt.mobileTitle}
        </span>
        {fmt.mobileMeta && (
          <span className="mt-0.5 max-w-full overflow-hidden text-ellipsis text-[8px] leading-none text-white/80 whitespace-nowrap">
            {fmt.mobileMeta}
          </span>
        )}
      </button>
    );
  }

  // Desktop: purple gradient card
  const fmt = formatCourseForMobile(course);
  const parsed = parseShowText(course.showText || "");

  return (
    <div
      className="flex h-full flex-col rounded-xl px-1.5 py-1 text-[11px] leading-tight text-white"
      style={{
        background: "linear-gradient(135deg, #5d57e8, #4b3fd9)",
        minHeight: cellHeight,
      }}
    >
      <div className="font-extrabold tracking-tight break-words">
        {parsed.teacherAndCode} {parsed.name}({parsed.code})
      </div>
      {fmt.sub && (
        <div className="mt-0.5 opacity-95 break-words whitespace-pre-line">
          {fmt.sub}
        </div>
      )}
    </div>
  );
}
