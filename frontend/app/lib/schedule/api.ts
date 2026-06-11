import { API_BASE } from "~/lib/api";
import type {
  Calendar,
  CampusOption,
  ClassDetail,
  CourseInfo,
  FacultyOption,
  OptionalCourseType,
} from "./types";

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface PkEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => stringList(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[]" || trimmed === '[""]') return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return stringList(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }
  return trimmed
    .split(/[,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeClassDetail(raw: any): ClassDetail {
  return {
    code: String(raw?.code || ""),
    campus: String(raw?.campus || raw?.campusI18n || ""),
    arrangementInfo: Array.isArray(raw?.arrangementInfo) ? raw.arrangementInfo : [],
    teachers: Array.isArray(raw?.teachers) ? raw.teachers : [],
    teachingLanguage: String(raw?.teachingLanguage || raw?.teachingLanguageI18n || ""),
    isExclusive:
      typeof raw?.isExclusive === "boolean" ? raw.isExclusive : undefined,
    status: Number(raw?.status || 0),
  };
}

function normalizeCourseInfo(raw: any): CourseInfo {
  const courseNature = stringList(raw?.courseNature);
  const courseLabelIds = Array.isArray(raw?.courseLabelIds)
    ? raw.courseLabelIds.map((id: unknown) => Number(id)).filter(Number.isFinite)
    : [];
  const courseLabelId = Number(raw?.courseLabelId);
  return {
    courseName: String(raw?.courseName || ""),
    courseCode: String(raw?.courseCode || ""),
    courseType: String(raw?.courseType || raw?.courseLabelName || courseNature[0] || ""),
    credit: Number(raw?.credit || 0),
    courseDetail: Array.isArray(raw?.courseDetail)
      ? raw.courseDetail.map(normalizeClassDetail)
      : [],
    grade: raw?.grade == null ? undefined : Number(raw.grade),
    faculty: String(raw?.faculty || raw?.facultyI18n || ""),
    courseLabelId: Number.isFinite(courseLabelId) ? courseLabelId : undefined,
    courseLabelIds,
    courseLabelName:
      typeof raw?.courseLabelName === "string" ? raw.courseLabelName : undefined,
    courseNature,
    campus: stringList(raw?.campus ?? raw?.campus_list),
    crossDiscipline: Boolean(raw?.crossDiscipline),
  };
}

function normalizeCourseInfoList(raw: unknown): CourseInfo[] {
  return Array.isArray(raw) ? raw.map(normalizeCourseInfo) : [];
}

function normalizeOptionalCourseGroups(raw: unknown): CourseInfo[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((group: any) => {
    if (!Array.isArray(group?.courses)) return [normalizeCourseInfo(group)];
    return group.courses.map((course: any) =>
      normalizeCourseInfo({
        ...course,
        courseLabelId: group.courseLabelId,
        courseLabelIds: group.courseLabelIds,
        courseLabelName: group.courseLabelName,
        crossDiscipline: group.crossDiscipline,
      }),
    );
  });
}

function normalizeDetailMap(raw: unknown): Record<string, ClassDetail[]> {
  const out: Record<string, ClassDetail[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [code, details] of Object.entries(raw as Record<string, unknown>)) {
    out[code] = Array.isArray(details) ? details.map(normalizeClassDetail) : [];
  }
  return out;
}

async function pkGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`PK API ${path} failed (${res.status})`);
  const envelope = (await res.json()) as PkEnvelope<T>;
  return envelope.data;
}

async function pkPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PK API ${path} failed (${res.status})`);
  const envelope = (await res.json()) as PkEnvelope<T>;
  return envelope.data;
}

// ─── Endpoints ─────────────────────────────────────────────────────────────────

// 1. All calendars
export async function getAllCalendars(): Promise<Calendar[]> {
  return pkGet<Calendar[]>("/api/getAllCalendar");
}

// 2. Grades for a calendar
export async function getGradesByCalendar(calendarId: number): Promise<number[]> {
  const data = await pkPost<{ gradeList: number[] }>("/api/findGradeByCalendarId", { calendarId });
  return data.gradeList;
}

// 3. Majors for a calendar + grade
export async function getMajorsByGrade(
  calendarId: number,
  grade: number,
): Promise<{ code: string; name: string }[]> {
  return pkPost<{ code: string; name: string }[]>("/api/findMajorByGrade", {
    calendarId,
    grade: String(grade),
  });
}

// 4. Compulsory courses
export async function getCompulsoryCourses(
  calendarId: number,
  grade: number,
  major: string,
): Promise<CourseInfo[]> {
  const data = await pkPost<unknown>("/api/findCourseByMajor", {
    calendarId,
    grade: String(grade),
    code: major,
  });
  return normalizeCourseInfoList(data);
}

// 5. Optional course types
export async function getOptionalCourseTypes(
  calendarId: number,
): Promise<OptionalCourseType[]> {
  return pkPost<OptionalCourseType[]>("/api/findOptionalCourseType", {
    calendarId,
  });
}

// 6. Optional courses by type IDs
export async function getOptionalCoursesByType(
  calendarId: number,
  typeIds: number[],
): Promise<CourseInfo[]> {
  const data = await pkPost<unknown>("/api/findCourseByNatureId", {
    calendarId,
    ids: typeIds,
  });
  return normalizeOptionalCourseGroups(data);
}

// 7. Course detail by codes
export async function getCourseDetailByCode(
  calendarId: number,
  courseCodes: string[],
): Promise<Record<string, ClassDetail[]>> {
  const data = await pkPost<unknown>("/api/findCourseDetailByCode", {
    calendarId,
    courseCodes,
  });
  return normalizeDetailMap(data);
}

// 8. Find course by time slot
export async function findCourseByTime(
  calendarId: number,
  day: number,
  section: number,
): Promise<CourseInfo[]> {
  const data = await pkPost<unknown>("/api/findCourseByTime", {
    calendarId,
    day,
    section,
  });
  return normalizeCourseInfoList(data);
}

// 9. Search courses
export interface SearchParams {
  courseName?: string;
  courseCode?: string;
  teacherCode?: string;
  teacherName?: string;
  campus?: string;
  faculty?: string;
}

export interface SearchResult {
  courses: CourseInfo[];
  sizeLimit: number;
}

export async function findCourseBySearch(
  calendarId: number,
  params: SearchParams,
): Promise<SearchResult> {
  const result = await pkPost<SearchResult>("/api/findCourseBySearch", {
    calendarId,
    ...params,
  });
  return {
    ...result,
    courses: normalizeCourseInfoList(result.courses),
  };
}

// 10. All campuses
export async function getAllCampuses(
  calendarId: number,
): Promise<CampusOption[]> {
  return pkGet<CampusOption[]>(`/api/getAllCampus?calendarId=${calendarId}`);
}

// 11. All faculties
export async function getAllFaculties(
  calendarId: number,
): Promise<FacultyOption[]> {
  return pkGet<FacultyOption[]>(`/api/getAllFaculty?calendarId=${calendarId}`);
}

// 12. Latest update time
export async function getLatestUpdateTime(): Promise<string | null> {
  return pkGet<string | null>("/api/getLatestUpdateTime");
}

// 13. Get latest course info (used during sync)
export async function getLatestCourseInfo(
  calendarId: number,
  majorCodes: string[],
  otherCodes: string[],
  majorInfo?: { grade?: number | null; code?: string | null },
): Promise<Record<string, ClassDetail[]>> {
  const data = await pkPost<unknown>("/api/getLatestCourseInfo", {
    calendarId,
    majorCourseCodes: majorCodes,
    otherCourseCodes: otherCodes,
    majorInfo,
  });
  return normalizeDetailMap(data);
}
