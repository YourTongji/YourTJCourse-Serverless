"use client";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DownloadIcon } from "lucide-react";
import { useSchedulerStore } from "~/lib/schedule/store";
import { exportCSV } from "~/lib/schedule/export-csv";
import { exportXLS } from "~/lib/schedule/export-xls";

export default function ExportMenu() {
  const selectedCodes = useSchedulerStore((s) => s.selectedCodes);
  const stagedCourses = useSchedulerStore((s) => s.stagedCourses);

  const handleExportCSV = async () => {
    try {
      await exportCSV(selectedCodes, stagedCourses);
    } catch {
      alert("导出 CSV 失败，请重试");
    }
  };

  const handleExportXLS = async () => {
    try {
      await exportXLS(selectedCodes, stagedCourses);
    } catch {
      alert("导出 XLS 失败，请重试");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline" size="sm">
          <DownloadIcon className="size-3.5" />
          <span className="hidden sm:inline">导出</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportCSV}>
          导出 CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportXLS}>
          导出 XLS
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
