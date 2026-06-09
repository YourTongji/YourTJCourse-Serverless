// ─── Conflict Detection Grid Cell ──────────────────────────────────────────────

export interface OccupyCell {
  code: string;
  courseName: string;
  occupyWeek: number[];
}

// occupied[timeSlot][day] = OccupyCell[]
export type OccupiedGrid = OccupyCell[][][];

// ─── Timetable Display ─────────────────────────────────────────────────────────

export interface CourseOnTable {
  showText: string;
  courseName: string;
  code: string;
  occupyTime: number[];
  occupyDay: number;
}

// ─── Course Arrangement ────────────────────────────────────────────────────────

export interface ArrangementInfo {
  arrangementText: string;
  occupyDay: number;       // 1=Mon … 7=Sun
  occupyTime: number[];    // e.g. [1, 2]
  occupyWeek: number[];    // e.g. [1, 2, …, 16]
  occupyRoom: string;
  teacherAndCode: string;
}

// ─── Teachers ──────────────────────────────────────────────────────────────────

export interface Teacher {
  teacherCode: string;
  teacherName: string;
}

// ─── Course Detail (one class section) ─────────────────────────────────────────

export interface ClassDetail {
  code: string;
  campus: string;
  arrangementInfo: ArrangementInfo[];
  teachers: Teacher[];
  teachingLanguage: string;
  isExclusive?: boolean;
  status: number;  // 0=unselected, 1=staged, 2=confirmed
}

// ─── Course Info (top-level group) ─────────────────────────────────────────────

export interface CourseInfo {
  courseName: string;
  courseCode: string;
  courseType: string;
  credit: number;
  courseDetail: ClassDetail[];
  grade?: number;
  faculty?: string;
}

// ─── Cascade Selection State ───────────────────────────────────────────────────

export interface BaseInfoTriplet {
  calendarId: number | null;
  grade: number | null;
  major: string | null;
}

// ─── Staged Course (user's working copy) ───────────────────────────────────────

export interface StagedCourse {
  courseCode: string;
  courseName: string;
  credit: number;
  courseType: string;
  teacher: Teacher[];
  status: number;
  courseDetail: ClassDetail[];
}

// ─── Reference Data ────────────────────────────────────────────────────────────

export interface Calendar {
  calendarId: number;
  calendarName: string;
}

export interface CampusOption {
  campusId: string;
  campusName: string;
}

export interface FacultyOption {
  facultyId: string;
  facultyName: string;
}

export interface OptionalCourseType {
  courseLabelId: number;
  courseLabelName: string;
}

// ─── UI Interaction ────────────────────────────────────────────────────────────

export interface ClickedCourseInfo {
  courseCode: string;
  courseName: string;
  teacherCode?: string;
  teacherName?: string;
}

// ─── Course Change Tracking ────────────────────────────────────────────────────

export enum CourseChangeType {
  NoChange = "noChange",
  Closed = "closed",
  InfoChanged = "infoChanged",
  ConflictAfterUpdate = "conflictAfterUpdate",
}

export interface CourseChangeInfo {
  courseCode: string;
  courseName: string;
  changeType: CourseChangeType;
  details?: string;
  conflictWith?: string;
}

export interface CourseSyncResult {
  changes: CourseChangeInfo[];
  hasChanges: boolean;
}
