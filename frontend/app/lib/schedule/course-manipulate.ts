import type { ArrangementInfo, OccupyCell } from "./types";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function hasIntersection(arr1: number[], arr2: number[]): boolean {
  return arr1.some((item) => arr2.includes(item));
}

// ─── Course Identity ───────────────────────────────────────────────────────────

/** Strip a teaching-class suffix such as `.01` or the trailing two class digits. */
export function getBaseCourseCode(code: string): string {
  const normalized = String(code || "").trim();
  if (!normalized) return "";
  const dotted = normalized.match(/^(.+)\.\d{1,2}$/);
  if (dotted?.[1]) return dotted[1];
  return normalized.length > 6 ? normalized.slice(0, -2) : normalized;
}

/** Two courses are the same when their base codes match. */
export function isSameCourse(code1: string, code2: string): boolean {
  if (!code1 || !code2) return false;
  if (code1 === code2) return true;
  return getBaseCourseCode(code1) === getBaseCourseCode(code2);
}

// ─── Occupied Grid Operations ──────────────────────────────────────────────────

/**
 * Check whether `arrangementInfo` can be added to `occupied` grid.
 * Returns `{ canAdd: true }` or `{ canAdd: false, collideCourse: "…" }`.
 */
export function canAddCourse(
  arrangementInfo: ArrangementInfo[],
  occupied: OccupyCell[][][],
  code: string,
): { canAdd: boolean; collideCourse?: string } {
  // If a course with the same base code is already present, simulate removal
  // and re-check against the cleaned grid.
  const existingCode = occupied
    .flat()
    .flat()
    .find((item) => isSameCourse(item.code, code))?.code;

  if (existingCode) {
    const newOccupied = JSON.parse(JSON.stringify(occupied)) as OccupyCell[][][];
    deleteOccupied(newOccupied, existingCode);
    return canAddCourse(arrangementInfo, newOccupied, code);
  }

  for (const arr of arrangementInfo) {
    for (const timeSlot of arr.occupyTime) {
      const cell = occupied[timeSlot - 1]?.[arr.occupyDay - 1];
      if (!cell) continue;
      const collideItem = cell.find((item) =>
        hasIntersection(arr.occupyWeek, item.occupyWeek),
      );
      if (collideItem) {
        return {
          canAdd: false,
          collideCourse: collideItem.code + " " + collideItem.courseName,
        };
      }
    }
  }
  return { canAdd: true };
}

/** Insert a course into the occupied grid. */
export function insertOccupied(
  occupied: OccupyCell[][][],
  arrangementInfo: ArrangementInfo[],
  code: string,
  courseName: string,
): void {
  for (const arr of arrangementInfo) {
    for (const timeSlot of arr.occupyTime) {
      const row = occupied[timeSlot - 1];
      if (!row) continue;
      const col = row[arr.occupyDay - 1];
      if (!col) continue;
      col.push({
        code,
        courseName,
        occupyWeek: arr.occupyWeek,
      });
    }
  }
}

/** Remove all entries matching a given base course code from the occupied grid. */
export function deleteOccupied(
  occupied: OccupyCell[][][],
  code: string,
): void {
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 7; j++) {
      const cell = occupied[i]?.[j];
      if (cell) {
        occupied[i][j] = cell.filter((item) => !isSameCourse(item.code, code));
      }
    }
  }
}

// ─── Grid Factory ──────────────────────────────────────────────────────────────

/** Create a fresh 12×7 empty occupied grid. */
export function createEmptyOccupied(): OccupyCell[][][] {
  return Array.from({ length: 12 }, () =>
    Array.from({ length: 7 }, () => []),
  );
}
