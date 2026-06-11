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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">排课模拟</h1>
          <p className="mt-1 text-xs text-slate-500">
            选择学期与专业后添加课程，点击空课格查找同时间可选课
          </p>
        </div>
        <div className="min-w-0 flex-1 lg:max-w-2xl">
          <SemesterCascader />
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
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
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
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
