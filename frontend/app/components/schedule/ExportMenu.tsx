"use client";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DownloadIcon } from "lucide-react";

export default function ExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline" size="sm">
          <DownloadIcon className="size-3.5" />
          <span className="hidden sm:inline">导出</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => alert("即将上线")}>
          导出 CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => alert("即将上线")}>
          导出 XLS
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
