import { useEffect, useMemo, useState } from "react";
import {
  X,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Separator } from "~/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "~/components/ui/command";
import { useDraggableDesktop } from "~/hooks/useDraggableDesktop";
import { fetchAllCampus, type CampusOption } from "~/lib/api";

export interface FilterState {
  selectedDepartments: string[];
  onlyWithReviews: boolean;
  courseName: string;
  courseCode: string;
  teacherCode: string;
  teacherName: string;
  campus: string;
}

interface FilterPanelProps {
  value: FilterState;
  onFilterChange: (filters: FilterState) => void;
  departments: string[];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

export default function FilterPanel({
  value,
  onFilterChange,
  departments,
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(value);
  const [searchTerm, setSearchTerm] = useState("");
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([]);
  const [campusPickerOpen, setCampusPickerOpen] = useState(false);
  const [campusSearch, setCampusSearch] = useState("");
  const drag = useDraggableDesktop("yourtj_floating_filter_pos", {
    x: 0,
    y: 0,
  });

  const openPanel = () => {
    window.dispatchEvent(
      new CustomEvent("yourtj-floating-open", { detail: { panel: "filter" } }),
    );
    setIsOpen(true);
  };

  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      const panel = String((e as CustomEvent).detail?.panel || "");
      if (panel === "wallet") {
        setIsOpen(false);
        setCampusPickerOpen(false);
      }
    };
    window.addEventListener("yourtj-floating-open", onOtherOpen);
    return () =>
      window.removeEventListener("yourtj-floating-open", onOtherOpen);
  }, []);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const activeCount =
    (value.onlyWithReviews ? 1 : 0) +
    value.selectedDepartments.length +
    (value.courseName ? 1 : 0) +
    (value.courseCode ? 1 : 0) +
    (value.teacherCode ? 1 : 0) +
    (value.teacherName ? 1 : 0) +
    (value.campus ? 1 : 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const campuses = await fetchAllCampus();
        if (cancelled) return;
        const campusUniq = Array.from(
          new Map(campuses.map((c) => [c.campusName, c])).values(),
        ).sort((a, b) =>
          String(a.campusName || "").localeCompare(
            String(b.campusName || ""),
            "zh-CN",
          ),
        );
        setCampusOptions(campusUniq);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [departments]);

  const filteredDepartments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sortedDepartments;
    return sortedDepartments.filter((d) => d.toLowerCase().includes(q));
  }, [searchTerm, sortedDepartments]);

  const toggleDepartment = (dept: string) => {
    setDraft((prev) => {
      const exists = prev.selectedDepartments.includes(dept);
      const next = exists
        ? prev.selectedDepartments.filter((d) => d !== dept)
        : [...prev.selectedDepartments, dept];
      return { ...prev, selectedDepartments: next };
    });
  };

  const removeDepartment = (dept: string) => {
    setDraft((prev) => ({
      ...prev,
      selectedDepartments: prev.selectedDepartments.filter((d) => d !== dept),
    }));
  };

  const apply = () => {
    onFilterChange({
      selectedDepartments: uniq(draft.selectedDepartments),
      onlyWithReviews: !!draft.onlyWithReviews,
      courseName: draft.courseName.trim(),
      courseCode: draft.courseCode.trim(),
      teacherCode: draft.teacherCode.trim(),
      teacherName: draft.teacherName.trim(),
      campus: draft.campus,
    });
    setIsOpen(false);
  };

  const resetAndApply = () => {
    const cleared: FilterState = {
      selectedDepartments: [],
      onlyWithReviews: false,
      courseName: "",
      courseCode: "",
      teacherCode: "",
      teacherName: "",
      campus: "",
    };
    setDraft(cleared);
    setSearchTerm("");
    onFilterChange(cleared);
    setIsOpen(false);
  };

  const content = (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 max-h-[calc(100vh-190px)]">
      {/* Header + Action Buttons */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">高级筛选</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetAndApply}
        >
          <X className="mr-1 size-3.5" />
          重置
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={apply}
          className="bg-slate-800 hover:bg-slate-700 text-white"
        >
          应用
        </Button>
      </div>

      {/* Search Fields */}
      <Card className="bg-muted/30">
        <CardContent className="p-3 space-y-2.5">
          <h4 className="text-xs font-semibold text-muted-foreground">
            检索条件
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                课程名称
              </label>
              <Input
                placeholder="如：高等数学"
                value={draft.courseName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, courseName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                课程代码
              </label>
              <Input
                placeholder="如：TJ12345"
                value={draft.courseCode}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, courseCode: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                教师工号
              </label>
              <Input
                placeholder="如：20231234"
                value={draft.teacherCode}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, teacherCode: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                教师姓名
              </label>
              <Input
                placeholder="如：张三"
                value={draft.teacherName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, teacherName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                校区
              </label>
              <button
                type="button"
                onClick={() => setCampusPickerOpen(true)}
                className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground transition-colors outline-none hover:bg-muted/50"
              >
                <span className="truncate text-muted-foreground">
                  {draft.campus
                    ? (campusOptions.find((c) => c.campusId === draft.campus)
                        ?.campusName || "已选择")
                    : "不限"}
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Only with reviews */}
      <Card className="bg-muted/30">
        <CardContent className="p-3">
          <label className="flex cursor-pointer items-center gap-2.5">
            <Checkbox
              checked={draft.onlyWithReviews}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  onlyWithReviews: e.target.checked,
                }))
              }
              id="filter-only-reviews"
            />
            <div className="select-none">
              <span className="text-sm font-medium">
                只看有评价的课程
              </span>
              <p className="text-xs text-muted-foreground">
                过滤掉暂无评价的课程条目
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Separator />

      {/* Departments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">开课单位</h4>
          {draft.selectedDepartments.length > 0 && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() =>
                setDraft((p) => ({ ...p, selectedDepartments: [] }))
              }
              className="text-xs text-cyan-600 hover:text-cyan-700 h-auto p-0"
            >
              清空
            </Button>
          )}
        </div>

        {/* Selected department badges */}
        {draft.selectedDepartments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {draft.selectedDepartments.slice(0, 8).map((dept) => (
              <Badge
                key={dept}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => removeDepartment(dept)}
                title="点击移除"
              >
                <span className="max-w-[180px] truncate">{dept}</span>
                <X className="ml-0.5 size-3" />
              </Badge>
            ))}
            {draft.selectedDepartments.length > 8 && (
              <Badge variant="outline">
                +{draft.selectedDepartments.length - 8}
              </Badge>
            )}
          </div>
        )}

        {/* Department search + list */}
        <div className="rounded-lg border">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="搜索单位..."
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              <CommandEmpty>没有匹配的单位</CommandEmpty>
              <CommandGroup>
                {filteredDepartments.map((dept) => {
                  const selected = draft.selectedDepartments.includes(dept);
                  return (
                    <CommandItem
                      key={dept}
                      value={dept}
                      onSelect={() => toggleDepartment(dept)}
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

      {/* Campus picker overlay (keeps custom UI for search + list) */}
      {campusPickerOpen && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/25 backdrop-blur-sm"
            onClick={() => setCampusPickerOpen(false)}
          />
          <div className="fixed inset-x-4 bottom-4 z-[90] max-h-[70vh] rounded-3xl bg-popover border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b">
              <div className="text-sm font-semibold">选择校区</div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setCampusPickerOpen(false)}
                aria-label="关闭"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-4">
              <Input
                placeholder="搜索校区..."
                value={campusSearch}
                onChange={(e) => setCampusSearch(e.target.value)}
              />
            </div>
            <div className="px-2 pb-3 max-h-[calc(70vh-132px)] overflow-y-auto">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft((p) => ({ ...p, campus: "" }));
                    setCampusPickerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium border transition-colors ${
                    !draft.campus
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  不限
                  {!draft.campus && (
                    <span className="text-cyan-600 font-bold">✓</span>
                  )}
                </button>
                {(campusSearch.trim()
                  ? campusOptions.filter((c) =>
                      String(c.campusName || "")
                        .toLowerCase()
                        .includes(campusSearch.trim().toLowerCase()),
                    )
                  : campusOptions
                ).map((c) => {
                  const selected = draft.campus === c.campusId;
                  return (
                    <button
                      key={c.campusId || c.campusName}
                      type="button"
                      onClick={() => {
                        setDraft((p) => ({ ...p, campus: c.campusId }));
                        setCampusPickerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm border transition-colors ${
                        selected
                          ? "border-cyan-500 bg-cyan-50 text-cyan-700 font-semibold"
                          : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{c.campusName}</span>
                      {selected && (
                        <span className="text-cyan-600 font-bold">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: right floating draggable panel */}
      <div className="hidden md:block fixed right-6 top-24 z-40">
        <div
          className={`bg-popover/90 backdrop-blur-xl border shadow-xl rounded-2xl transition-all duration-300 ${
            isOpen ? "w-[380px]" : "w-14"
          }`}
          style={drag.style}
        >
          <button
            type="button"
            data-tour="tour-filter-floating"
            {...drag.dragHandleProps}
            onClick={() => {
              if (drag.consumeDragFlag()) return;
              if (isOpen) setIsOpen(false);
              else openPanel();
            }}
            className="relative h-14 w-full flex items-center justify-center hover:bg-muted/50 rounded-2xl transition-colors"
            title={isOpen ? "收起筛选" : "展开筛选"}
          >
            <SlidersHorizontal className="size-6 text-muted-foreground" />
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-600 font-brand">
              筛选
            </span>
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
          {isOpen && <div className="border-t">{content}</div>}
        </div>
      </div>

      {/* Mobile: floating button + bottom Sheet */}
      <div className="md:hidden fixed right-4 bottom-24 z-50">
        <Button
          type="button"
          data-tour="tour-filter-floating"
          onClick={openPanel}
          variant="outline"
          className="relative h-14 w-14 rounded-2xl bg-popover/90 backdrop-blur-xl shadow-xl active:scale-95 transition-transform p-0"
          aria-label="打开筛选"
        >
          <SlidersHorizontal className="size-6 text-muted-foreground" />
          <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-600 font-brand">
            筛选
          </span>
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </Button>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>高级筛选</SheetTitle>
            </SheetHeader>
            {content}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
