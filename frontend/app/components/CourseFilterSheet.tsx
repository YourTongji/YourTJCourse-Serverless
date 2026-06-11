import { useState, useMemo } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Separator } from "~/components/ui/separator";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "~/components/ui/command";

export interface FilterDraft {
  departments: string[];
  onlyWithReviews: boolean;
  courseName: string;
  courseCode: string;
  teacherName: string;
  campus: string;
}

interface CourseFilterSheetProps {
  departments: string[];
  draft: FilterDraft;
  onDraftChange: (draft: FilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
  activeCount: number;
}

function toggleDepartment(departments: string[], dept: string): string[] {
  return departments.includes(dept)
    ? departments.filter((d) => d !== dept)
    : [...departments, dept];
}

export default function CourseFilterSheet({
  departments,
  draft,
  onDraftChange,
  onApply,
  onReset,
  activeCount,
}: CourseFilterSheetProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deptSearch, setDeptSearch] = useState("");

  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [departments],
  );

  const filteredDepts = useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return sortedDepartments;
    return sortedDepartments.filter((d) => d.toLowerCase().includes(q));
  }, [deptSearch, sortedDepartments]);

  const setField = <K extends keyof FilterDraft>(
    key: K,
    value: FilterDraft[K],
  ) => {
    onDraftChange({ ...draft, [key]: value });
  };

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
      {/* Department filter */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">开课学院</h4>
          {draft.departments.length > 0 && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setField("departments", [])}
              className="text-xs font-medium text-cyan-600 hover:text-cyan-700 h-auto p-0"
            >
              清空
            </Button>
          )}
        </div>

        {/* Selected department badges */}
        {draft.departments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {draft.departments.map((dept) => (
              <Badge
                key={dept}
                variant="secondary"
                className="flex items-center gap-1 cursor-pointer"
                onClick={() =>
                  setField(
                    "departments",
                    toggleDepartment(draft.departments, dept),
                  )
                }
              >
                {dept}
                <X className="size-3" />
              </Badge>
            ))}
          </div>
        )}

        {/* Department search + list */}
        <div className="rounded-lg border">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="搜索学院..."
              value={deptSearch}
              onValueChange={setDeptSearch}
            />
            <CommandList>
              <CommandEmpty>没有匹配的学院</CommandEmpty>
              <CommandGroup>
                {filteredDepts.map((dept) => {
                  const selected = draft.departments.includes(dept);
                  return (
                    <CommandItem
                      key={dept}
                      value={dept}
                      onSelect={() =>
                        setField(
                          "departments",
                          toggleDepartment(draft.departments, dept),
                        )
                      }
                      data-checked={selected || undefined}
                    >
                      <Checkbox
                        checked={selected}
                        className="pointer-events-none mr-2"
                        tabIndex={-1}
                        readOnly
                      />
                      <span className="truncate text-sm">{dept}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>

      <Separator />

      {/* Only with reviews */}
      <label className="flex cursor-pointer items-center gap-2.5">
        <Checkbox
          checked={draft.onlyWithReviews}
          onChange={(e) => setField("onlyWithReviews", e.target.checked)}
          id="filter-only-reviews"
        />
        <div className="select-none">
          <span className="text-sm font-medium">仅显示有评价的课程</span>
          <p className="text-xs text-muted-foreground">
            过滤掉暂无评价的课程条目
          </p>
        </div>
      </label>

      <Separator />

      {/* Advanced filters */}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-foreground h-auto p-0"
        >
          <span>高级筛选</span>
          {showAdvanced ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </Button>

        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">课程名</label>
              <Input
                value={draft.courseName}
                onChange={(e) => setField("courseName", e.target.value)}
                placeholder="如：高等数学"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">课程代码</label>
              <Input
                value={draft.courseCode}
                onChange={(e) => setField("courseCode", e.target.value)}
                placeholder="如 TJ12345"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">授课教师</label>
              <Input
                value={draft.teacherName}
                onChange={(e) => setField("teacherName", e.target.value)}
                placeholder="输入教师名"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">校区</label>
              <Input
                value={draft.campus}
                onChange={(e) => setField("campus", e.target.value)}
                placeholder="四平路 / 嘉定 / 沪西"
              />
            </div>
          </div>
        )}
      </div>

      {/* Filter actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X className="mr-1 size-3.5" />
          重置
        </Button>
        <Button size="sm" onClick={onApply}>
          应用筛选
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1.5 size-5 rounded-full p-0 text-[10px]"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </div>
    </div>
  );
}
