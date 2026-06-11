import type { StagedCourse } from "./types";
import type { SheetData } from "write-excel-file/browser";

// ─── XLS Row Shape ──────────────────────────────────────────────────────────

interface XlsRow {
  code: string;
  courseName: string;
  teacherName: string;
}

// ─── Data Conversion ────────────────────────────────────────────────────────

function buildXlsRows(
  selectedCodes: string[],
  stagedCourses: StagedCourse[],
): XlsRow[] {
  const rows: XlsRow[] = [];

  for (const code of selectedCodes) {
    const baseCode = code.slice(0, -2);
    const course = stagedCourses.find((c) => c.courseCode === baseCode);
    if (!course) continue;

    const targetClass = course.courseDetail.find((d) => d.code === code);
    if (!targetClass) continue;

    rows.push({
      code,
      courseName: course.courseName,
      teacherName: course.teacher.map((t) => t.teacherName).join(","),
    });
  }

  return rows;
}

// ─── XLSX Generation ────────────────────────────────────────────────────────

async function jsonToXlsx(rows: XlsRow[]): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");

  const headerRow: SheetData[number] = [
    { value: "课号", fontWeight: "bold" },
    { value: "课程名称", fontWeight: "bold" },
    { value: "教师", fontWeight: "bold" },
  ];

  const dataRows: SheetData[number][] = rows.map(
    (row) => [row.code, row.courseName, row.teacherName],
  );

  const sheetData: SheetData = [headerRow, ...dataRows];

  const result = writeExcelFile(sheetData, {
    columns: [{ width: 25 }, { width: 50 }, { width: 62.5 }],
  });

  return await result.toBlob();
}

function downloadXlsx(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = "同济排课助手-辅助表.xlsx";
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function exportXLS(
  selectedCodes: string[],
  stagedCourses: StagedCourse[],
): Promise<void> {
  const rows = buildXlsRows(selectedCodes, stagedCourses);
  const blob = await jsonToXlsx(rows);
  downloadXlsx(blob);
}
