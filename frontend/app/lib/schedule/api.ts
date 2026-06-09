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
  return pkPost<number[]>("/api/findGradeByCalendarId", { calendarId });
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
  return pkPost<CourseInfo[]>("/api/findCourseByMajor", {
    calendarId,
    grade: String(grade),
    code: major,
  });
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
  return pkPost<CourseInfo[]>("/api/findCourseByNatureId", {
    calendarId,
    typeIds,
  });
}

// 7. Course detail by codes
export async function getCourseDetailByCode(
  calendarId: number,
  courseCodes: string[],
): Promise<Record<string, ClassDetail[]>> {
  return pkPost<Record<string, ClassDetail[]>>("/api/findCourseDetailByCode", {
    calendarId,
    codes: courseCodes,
  });
}

// 8. Find course by time slot
export async function findCourseByTime(
  calendarId: number,
  day: number,
  section: number,
): Promise<CourseInfo[]> {
  return pkPost<CourseInfo[]>("/api/findCourseByTime", {
    calendarId,
    day,
    section,
  });
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
  return pkPost<SearchResult>("/api/findCourseBySearch", {
    calendarId,
    ...params,
  });
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
): Promise<Record<string, ClassDetail[]>> {
  return pkPost<Record<string, ClassDetail[]>>("/api/getLatestCourseInfo", {
    calendarId,
    codes: [...majorCodes, ...otherCodes],
  });
}
