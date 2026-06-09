import type { ArrangementInfo } from "./types";

/**
 * Compare two ISO/DB timestamp strings for equality.
 */
export function isUpToDate(oldTime: string, newTime: string): boolean {
  return oldTime === newTime;
}

/**
 * Normalize arrangement text into structured arrangement info.
 * Handles various messy formats from the PK backend.
 *
 * Expected format:
 *   "周一1-2节 教学楼A201" or "星期二3-4节 致远楼B301" etc.
 */
export function normalizeArrangementInfo(
  rawArrangements: unknown,
): ArrangementInfo[] {
  if (!Array.isArray(rawArrangements)) return [];
  return rawArrangements
    .map((item: any) => {
      const text: string =
        typeof item?.arrangementText === "string" ? item.arrangementText : "";

      return {
        arrangementText: text,
        occupyDay:
          typeof item?.occupyDay === "number" && item.occupyDay >= 1 && item.occupyDay <= 7
            ? item.occupyDay
            : 0,
        occupyTime: Array.isArray(item?.occupyTime)
          ? (item.occupyTime as number[]).filter(
              (slot) => typeof slot === "number" && slot >= 1 && slot <= 12,
            )
          : [],
        occupyWeek: Array.isArray(item?.occupyWeek)
          ? (item.occupyWeek as number[]).filter(
              (week) => typeof week === "number",
            )
          : [],
        occupyRoom:
          typeof item?.occupyRoom === "string" ? item.occupyRoom : "",
        teacherAndCode:
          typeof item?.teacherAndCode === "string" ? item.teacherAndCode : "",
      };
    })
    .filter(
      (item) =>
        item.occupyDay >= 1 &&
        item.occupyDay <= 7 &&
        item.occupyTime.length > 0,
    );
}
