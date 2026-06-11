import type { StagedCourse } from "./types";

// ─── CSV Row Shape ──────────────────────────────────────────────────────────

interface CsvRow {
  courseName: string;
  occupyDay: number | string;
  start: number | string;
  end: number | string;
  teacherName: string;
  occupyRoom: string;
  occucpyWeek: string;
}

const CSV_HEADER: CsvRow = {
  courseName: "课程名称",
  occupyDay: "星期",
  start: "开始节次",
  end: "结束节次",
  teacherName: "教师",
  occupyRoom: "教室",
  occucpyWeek: "周次",
};

const DAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

// ─── Data Conversion ────────────────────────────────────────────────────────

function buildCsvRows(
  selectedCodes: string[],
  stagedCourses: StagedCourse[],
): CsvRow[] {
  const rows: CsvRow[] = [CSV_HEADER];

  for (const code of selectedCodes) {
    const baseCode = code.slice(0, -2);
    const course = stagedCourses.find((c) => c.courseCode === baseCode);
    if (!course) continue;

    const targetClass = course.courseDetail.find((d) => d.code === code);
    if (!targetClass) continue;

    for (const arr of targetClass.arrangementInfo) {
      const dayLabel = DAY_LABELS[arr.occupyDay] ?? arr.occupyDay;
      rows.push({
        courseName: course.courseName,
        occupyDay: dayLabel,
        start: arr.occupyTime[0],
        end:
          arr.occupyTime.length === 1
            ? arr.occupyTime[0]
            : arr.occupyTime[arr.occupyTime.length - 1],
        teacherName: arr.teacherAndCode
          .split(",")
          .map((str) => str.split("(")[0].trim())
          .join(","),
        occupyRoom: arr.occupyRoom,
        occucpyWeek:
          arr.arrangementText.split("]")[0].split("[")[1]?.split(" ").join("、") ??
          "",
      });
    }
  }

  return rows;
}

// ─── CSV Generation ─────────────────────────────────────────────────────────

async function jsonToCsv(rows: CsvRow[]): Promise<string> {
  const Papa = (await import("papaparse")).default;
  return Papa.unparse(rows, { header: false });
}

function downloadCsv(csvData: string): void {
  // BOM prefix for correct CJK encoding in Excel
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvData], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = "同济排课助手-课程表.csv";
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function exportCSV(
  selectedCodes: string[],
  stagedCourses: StagedCourse[],
): Promise<void> {
  const rows = buildCsvRows(selectedCodes, stagedCourses);
  const csv = await jsonToCsv(rows);
  downloadCsv(csv);
}
