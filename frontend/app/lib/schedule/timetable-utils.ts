import type { CourseOnTable } from "./types";

// ─── Public API ────────────────────────────────────────────────────────────────

export { getMaxRows, computeTimetableLayout };

// ─── Row Count ─────────────────────────────────────────────────────────────────

/**
 * calendarId ≥ 120 uses the 11-row system; earlier calendars use 12 rows.
 */
function getMaxRows(calendarId: number): number {
  return calendarId >= 120 ? 11 : 12;
}

// ─── Layout Computation ────────────────────────────────────────────────────────

export interface TimetableLayout {
  /** timeTable[row][day] = courses displayed in that cell */
  timeTable: CourseOnTable[][][];
  /** maxSpans[row][day] = rowspan for that cell */
  maxSpans: number[][];
  /** occupied[row][day] = true when the cell is consumed by a rowspan above */
  cellOccupied: boolean[][];
}

/**
 * Compute the timetable grid layout from flat `CourseOnTable[]`.
 * Merges short courses into longer course cells that overlap in time.
 */
function computeTimetableLayout(
  coursesOnTable: CourseOnTable[],
  maxRows: number,
): TimetableLayout {
  // Initialize
  const timeTable: CourseOnTable[][][] = Array.from({ length: maxRows }, () =>
    Array.from({ length: 7 }, () => []),
  );
  const maxSpans: number[][] = Array.from({ length: maxRows }, () =>
    Array(7).fill(1),
  );
  const cellOccupied: boolean[][] = Array.from({ length: maxRows }, () =>
    Array(7).fill(false),
  );

  // Guard: validate and filter
  const safeCourses = coursesOnTable.filter((course) => {
    return (
      Array.isArray(course.occupyTime) &&
      course.occupyTime.length > 0 &&
      typeof course.occupyDay === "number" &&
      course.occupyDay >= 1 &&
      course.occupyDay <= 7 &&
      course.occupyTime.every((slot) => slot >= 1 && slot <= maxRows)
    );
  });

  // Sort by duration descending (long courses placed first)
  const sortedCourses = [...safeCourses].sort(
    (a, b) => b.occupyTime.length - a.occupyTime.length,
  );

  // Track time-range per cell for overlap detection
  interface CellRange {
    startTime: number;
    endTime: number;
    courses: CourseOnTable[];
  }
  const cellRanges: (CellRange | null)[][] = Array.from(
    { length: maxRows },
    () => Array(7).fill(null),
  );

  for (const course of sortedCourses) {
    const startRow = course.occupyTime[0] - 1;
    const dayIndex = course.occupyDay - 1;

    let mergedIntoExisting = false;

    // Try to merge into an existing cell whose time-range contains this course
    for (let checkRow = 0; checkRow <= startRow; checkRow++) {
      const existingRange = cellRanges[checkRow]![dayIndex];
      if (
        existingRange &&
        existingRange.startTime <= course.occupyTime[0] &&
        existingRange.endTime >=
          course.occupyTime[course.occupyTime.length - 1]
      ) {
        existingRange.courses.push(course);
        timeTable[checkRow]![dayIndex]!.push(course);
        mergedIntoExisting = true;
        break;
      }
    }

    // Otherwise create a new cell at the start row
    if (!mergedIntoExisting) {
      timeTable[startRow]![dayIndex]!.push(course);
      cellRanges[startRow]![dayIndex] = {
        startTime: course.occupyTime[0],
        endTime: course.occupyTime[course.occupyTime.length - 1],
        courses: [course],
      };
    }
  }

  // Compute rowspans
  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < 7; col++) {
      const courses = timeTable[row]![col]!;
      if (courses.length > 0) {
        maxSpans[row]![col] = Math.max(
          ...courses.map((c) => c.occupyTime.length),
        );
      }
    }
  }

  // Mark cells consumed by rowspans above
  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < 7; col++) {
      const span = maxSpans[row]![col]!;
      if (span > 1) {
        for (let i = 1; i < span; i++) {
          if (row + i < maxRows) {
            cellOccupied[row + i]![col] = true;
          }
        }
      }
    }
  }

  return { timeTable, maxSpans, cellOccupied };
}
