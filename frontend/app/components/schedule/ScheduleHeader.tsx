"use client";

import SemesterCascader from "./SemesterCascader";
import ExportMenu from "./ExportMenu";
import { useSchedulerStore } from "~/lib/schedule/store";
import { Button } from "~/components/ui/button";
import { RefreshCwIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react";

export default function ScheduleHeader() {
  const isDataOutdated = useSchedulerStore((s) => s.isDataOutdated);
  const isSyncing = useSchedulerStore((s) => s.isSyncing);
  const checkSync = useSchedulerStore((s) => s.checkSync);
  const syncLatest = useSchedulerStore((s) => s.syncLatest);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 shadow-sm p-3 md:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-800 shrink-0">
          排课模拟
        </h1>
        <SemesterCascader />
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Sync status */}
          {isDataOutdated && (
            <Button
              variant="outline"
              size="sm"
              onClick={syncLatest}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <RefreshCwIcon className="size-3.5 animate-spin" />
              ) : (
                <AlertCircleIcon className="size-3.5 text-amber-600" />
              )}
              <span className="hidden sm:inline text-xs">
                {isSyncing ? "同步中..." : "数据已过时"}
              </span>
            </Button>
          )}
          {!isDataOutdated && (
            <span
              className="inline-flex items-center gap-1 text-xs text-slate-400 cursor-pointer"
              onClick={checkSync}
            >
              <CheckCircleIcon className="size-3 text-green-500" />
              <span className="hidden sm:inline">已是最新</span>
            </span>
          )}
          <ExportMenu />
        </div>
      </div>
    </div>
  );
}
