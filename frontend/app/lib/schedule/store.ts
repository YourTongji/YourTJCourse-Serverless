import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Calendar,
  CampusOption,
  ClassDetail,
  ClickedCourseInfo,
  CourseInfo,
  CourseOnTable,
  FacultyOption,
  OccupyCell,
  OccupiedGrid,
  OptionalCourseType,
  StagedCourse,
} from "./types";
import {
  canAddCourse,
  createEmptyOccupied,
  deleteOccupied,
  insertOccupied,
  isSameCourse,
} from "./course-manipulate";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MajorCode {
  code: string;
  name: string;
}

export interface SchedulerState {
  // ── Cascade Selection ──────────────────────────────────────────────────────
  calendarId: number | null;
  grade: number | null;
  major: string | null;

  // ── Reference Data ─────────────────────────────────────────────────────────
  calendars: Calendar[];
  grades: number[];
  majors: MajorCode[];
  compulsoryCourses: CourseInfo[];
  optionalTypes: OptionalCourseType[];
  optionalCourses: CourseInfo[];
  searchCourses: CourseInfo[];
  campuses: CampusOption[];
  faculties: FacultyOption[];

  // ── User Selections ────────────────────────────────────────────────────────
  stagedCourses: StagedCourse[];
  selectedCodes: string[];

  // ── Timetable ──────────────────────────────────────────────────────────────
  timeTableData: CourseOnTable[];
  occupied: OccupiedGrid;
  maxRows: number;

  // ── UI State ───────────────────────────────────────────────────────────────
  clickedCourse: ClickedCourseInfo;
  isSyncing: boolean;
  updateTime: string;
  latestUpdateTime: string;
  isDataOutdated: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  selectCalendar: (id: number) => Promise<void>;
  selectGrade: (grade: number) => Promise<void>;
  selectMajor: (code: string) => void;
  loadCompulsoryCourses: () => Promise<void>;
  loadOptionalCourses: () => Promise<void>;
  stageCourses: (courseKeys: string[]) => Promise<void>;
  removeCourse: (courseCode: string) => void;
  selectClass: (classDetail: ClassDetail) => { ok: boolean; conflict?: string };
  clickTimeCell: (day: number, section: number) => Promise<CourseInfo[]>;
  confirmSelection: () => void;
  checkSync: () => Promise<void>;
  syncLatest: () => Promise<void>;
  resetSchedule: () => void;
  setClickedCourse: (info: ClickedCourseInfo) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Build the `showText` field for CourseOnTable in the exact Vue format. */
function buildShowText(
  courseName: string,
  code: string,
  teacherAndCode: string,
  arrangementText: string,
): string {
  return `${teacherAndCode} ${courseName}(${code}) ${arrangementText}`;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useSchedulerStore = create<SchedulerState>()(
  persist(
    (set, get) => ({
      // ── Initial State ──────────────────────────────────────────────────────
      calendarId: null,
      grade: null,
      major: null,
      calendars: [],
      grades: [],
      majors: [],
      compulsoryCourses: [],
      optionalTypes: [],
      optionalCourses: [],
      searchCourses: [],
      campuses: [],
      faculties: [],
      stagedCourses: [],
      selectedCodes: [],
      timeTableData: [],
      occupied: createEmptyOccupied(),
      maxRows: 12,
      clickedCourse: {
        courseCode: "",
        courseName: "",
        teacherCode: "",
        teacherName: "",
      },
      isSyncing: false,
      updateTime: "",
      latestUpdateTime: "",
      isDataOutdated: false,

      // ── Cascade Actions ────────────────────────────────────────────────────

      async selectCalendar(id: number) {
        set({
          calendarId: id,
          grade: null,
          major: null,
          grades: [],
          majors: [],
          compulsoryCourses: [],
          optionalTypes: [],
          optionalCourses: [],
          searchCourses: [],
          maxRows: id >= 120 ? 11 : 12,
        });
        const { getGradesByCalendar } = await import("./api");
        try {
          const grades = await getGradesByCalendar(id);
          set({ grades });
        } catch {
          // grades remain empty on error
        }
      },

      async selectGrade(grade: number) {
        set({ grade, major: null, majors: [], compulsoryCourses: [] });
        const { calendarId } = get();
        if (calendarId !== null) {
          const { getMajorsByGrade } = await import("./api");
          try {
            const majors = await getMajorsByGrade(calendarId, grade);
            set({ majors });
          } catch {
            // majors remain empty on error
          }
        }
      },

      selectMajor(code: string) {
        set({ major: code, compulsoryCourses: [] });
      },

      async loadCompulsoryCourses() {
        const { calendarId, grade, major } = get();
        if (calendarId === null || grade === null || major === null) return;
        const { getCompulsoryCourses } = await import("./api");
        try {
          const courses = await getCompulsoryCourses(calendarId, grade, major);
          set({ compulsoryCourses: courses });
        } catch {
          // noop
        }
      },

      async loadOptionalCourses() {
        const { calendarId } = get();
        if (calendarId === null) return;
        const { getOptionalCourseTypes, getOptionalCoursesByType } =
          await import("./api");
        try {
          const types = await getOptionalCourseTypes(calendarId);
          set({ optionalTypes: types });
          if (types.length > 0) {
            const courses = await getOptionalCoursesByType(
              calendarId,
              types.map((t) => t.courseLabelId),
            );
            set({ optionalCourses: courses });
          }
        } catch {
          // noop
        }
      },

      // ── Course Selection ───────────────────────────────────────────────────

      async stageCourses(courseKeys: string[]) {
        const { calendarId, stagedCourses } = get();
        if (calendarId === null) return;
        const { getCourseDetailByCode } = await import("./api");

        // Deduplicate — skip codes already staged
        const alreadyStaged = new Set(stagedCourses.map((c) => c.courseCode));
        const newKeys = courseKeys.filter((k) => !alreadyStaged.has(k));
        if (newKeys.length === 0) return;

        const detailMap = await getCourseDetailByCode(calendarId, newKeys);

        const additions: StagedCourse[] = [];
        for (const key of newKeys) {
          const details = detailMap[key];
          if (!details || details.length === 0) continue;

          const firstDetail = details[0]!;
          const tea = firstDetail.teachers[0];
          additions.push({
            courseCode: key,
            courseName: firstDetail.campus || key,
            credit: 0,
            courseType: "",
            teacher: tea
              ? [{ teacherCode: tea.teacherCode, teacherName: tea.teacherName }]
              : [],
            status: 0,
            courseDetail: details,
          });
        }

        set({ stagedCourses: [...stagedCourses, ...additions] });
      },

      removeCourse(courseCode: string) {
        const state = get();
        const stripSuffix = (code: string) => {
          const dot = code.lastIndexOf(".");
          return dot > 0 ? code.substring(0, dot) : code;
        };

        const newStaged = state.stagedCourses.filter(
          (c) => c.courseCode !== courseCode,
        );
        const newSelected = state.selectedCodes.filter(
          (c) => stripSuffix(c) !== courseCode,
        );
        const newTimetable = state.timeTableData.filter(
          (c) => stripSuffix(c.code) !== courseCode,
        );

        const occupied = JSON.parse(
          JSON.stringify(state.occupied),
        ) as OccupiedGrid;
        const targetCell = occupied
          .flat()
          .flat()
          .find((item: OccupyCell) => stripSuffix(item.code) === courseCode);
        if (targetCell) {
          deleteOccupied(occupied, targetCell.code);
        }

        set({
          stagedCourses: newStaged,
          selectedCodes: newSelected,
          timeTableData: newTimetable,
          occupied,
          clickedCourse: {
            courseCode: "",
            courseName: "",
            teacherCode: "",
            teacherName: "",
          },
        });
      },

      selectClass(classDetail: ClassDetail) {
        const state = get();
        const result = canAddCourse(
          classDetail.arrangementInfo,
          state.occupied,
          classDetail.code,
        );

        if (!result.canAdd) {
          return { ok: false, conflict: result.collideCourse };
        }

        // Remove same-base-course from timetable first
        let occupied = state.occupied;
        let timetable = [...state.timeTableData];

        const sameCodeCourse = timetable.find((c) =>
          isSameCourse(c.code, classDetail.code),
        );
        if (sameCodeCourse) {
          timetable = timetable.filter(
            (c) => !isSameCourse(c.code, classDetail.code),
          );
          occupied = JSON.parse(JSON.stringify(occupied)) as OccupiedGrid;
          deleteOccupied(occupied, sameCodeCourse.code);

          // Reset status on the previous selection
          const staged = state.stagedCourses.map((sc) => {
            if (sc.courseCode === classDetail.code.slice(0, -2)) {
              const newDetail = sc.courseDetail.map((d) =>
                isSameCourse(d.code, classDetail.code) && d.status === 1
                  ? { ...d, status: 0 }
                  : d,
              );
              return { ...sc, courseDetail: newDetail };
            }
            return sc;
          });
          set({ stagedCourses: staged });
        }

        // Push new course blocks into timetable
        const clickedCourse = state.clickedCourse;
        const newBlocks: CourseOnTable[] = classDetail.arrangementInfo.map(
          (arr) => ({
            showText: buildShowText(
              clickedCourse.courseName,
              classDetail.code,
              arr.teacherAndCode,
              arr.arrangementText,
            ),
            courseName: clickedCourse.courseName,
            code: classDetail.code,
            occupyTime: arr.occupyTime,
            occupyDay: arr.occupyDay,
          }),
        );
        timetable = [...timetable, ...newBlocks];

        // Update occupied
        occupied = JSON.parse(JSON.stringify(occupied)) as OccupiedGrid;
        insertOccupied(
          occupied,
          classDetail.arrangementInfo,
          classDetail.code,
          clickedCourse.courseName,
        );

        // Update statuses
        classDetail.status = 1;
        const updatedStaged = state.stagedCourses.map((sc) => {
          if (sc.courseCode === classDetail.code.slice(0, -2)) {
            return {
              ...sc,
              status: 1,
              teacher: classDetail.teachers,
              courseDetail: sc.courseDetail.map((d) =>
                isSameCourse(d.code, classDetail.code)
                  ? { ...d, status: 1 }
                  : d,
              ),
            };
          }
          return sc;
        });

        set({
          timeTableData: timetable,
          occupied,
          stagedCourses: updatedStaged,
        });

        return { ok: true };
      },

      async clickTimeCell(day: number, section: number) {
        const { calendarId } = get();
        if (calendarId === null) return [];
        const { findCourseByTime } = await import("./api");
        try {
          return await findCourseByTime(calendarId, day, section);
        } catch {
          return [];
        }
      },

      confirmSelection() {
        const state = get();
        const updatedStaged = state.stagedCourses.map((sc) => {
          if (sc.status === 1) {
            const newDetail = sc.courseDetail.map((d) => {
              if (d.status === 1) return { ...d, status: 2 };
              if (d.status === 2) return { ...d, status: 0 };
              return d;
            });
            return { ...sc, status: 2, courseDetail: newDetail };
          }
          return sc;
        });

        const newSelected: string[] = [];
        for (const sc of updatedStaged) {
          for (const d of sc.courseDetail) {
            if (d.status === 2) newSelected.push(d.code);
          }
        }

        // Remove codes whose status was reset to 0
        const removeSet = new Set<string>();
        for (const sc of state.stagedCourses) {
          for (const d of sc.courseDetail) {
            if (d.status === 2) {
              const stillSelected = updatedStaged
                .find((u) => u.courseCode === sc.courseCode)
                ?.courseDetail.some(
                  (ud) => ud.code === d.code && ud.status === 2,
                );
              if (!stillSelected) removeSet.add(d.code);
            }
          }
        }
        const filteredSelected = [
          ...state.selectedCodes.filter((c) => !removeSet.has(c)),
          ...newSelected.filter((c) => !state.selectedCodes.includes(c)),
        ];

        set({
          stagedCourses: updatedStaged,
          selectedCodes: filteredSelected,
        });
      },

      async checkSync() {
        set({ isSyncing: true });
        try {
          const { getLatestUpdateTime } = await import("./api");
          const latest = (await getLatestUpdateTime()) ?? "";
          set({
            latestUpdateTime: latest,
            isDataOutdated:
              latest !== "" &&
              get().updateTime !== "" &&
              latest !== get().updateTime,
          });
        } finally {
          set({ isSyncing: false });
        }
      },

      async syncLatest() {
        const state = get();
        const { calendarId } = state;
        if (calendarId === null) return;

        const majorCodes = state.stagedCourses
          .filter((c) => c.courseType !== "通识选修课")
          .map((c) => c.courseCode);
        const otherCodes = state.stagedCourses
          .filter((c) => c.courseType === "通识选修课")
          .map((c) => c.courseCode);

        const { getLatestCourseInfo, getLatestUpdateTime } =
          await import("./api");
        try {
          const [detailMap, latestTime] = await Promise.all([
            getLatestCourseInfo(calendarId, majorCodes, otherCodes),
            getLatestUpdateTime(),
          ]);

          // Rebuild staged courses with fresh details
          const updatedStaged = state.stagedCourses.map((sc) => {
            const freshDetails = detailMap[sc.courseCode];
            if (!freshDetails || freshDetails.length === 0) return sc;
            const merged = freshDetails.map((fd) => {
              const existing = sc.courseDetail.find((d) => d.code === fd.code);
              return { ...fd, status: existing?.status ?? 0 };
            });
            return { ...sc, courseDetail: merged };
          });

          // Rebuild selected codes from fresh data
          const newSelected: string[] = [];
          for (const sc of updatedStaged) {
            for (const d of sc.courseDetail) {
              if (d.status === 2) newSelected.push(d.code);
            }
          }

          set({
            stagedCourses: updatedStaged,
            selectedCodes: newSelected,
            updateTime: latestTime ?? "",
            latestUpdateTime: latestTime ?? "",
            isDataOutdated: false,
          });
        } catch {
          // sync failed, leave state as-is
        }
      },

      resetSchedule() {
        set({
          stagedCourses: [],
          selectedCodes: [],
          timeTableData: [],
          occupied: createEmptyOccupied(),
          clickedCourse: {
            courseCode: "",
            courseName: "",
            teacherCode: "",
            teacherName: "",
          },
        });
      },

      setClickedCourse(info: ClickedCourseInfo) {
        set({ clickedCourse: info });
      },
    }),
    {
      name: "scheduler-storage-v2",
      partialize: (state) => ({
        calendarId: state.calendarId,
        grade: state.grade,
        major: state.major,
        maxRows: state.maxRows,
        stagedCourses: state.stagedCourses,
        selectedCodes: state.selectedCodes,
        timeTableData: state.timeTableData,
        occupied: state.occupied,
        updateTime: state.updateTime,
      }),
    },
  ),
);
