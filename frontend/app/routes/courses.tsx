import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, type MetaFunction } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Filter,
  X,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { useCourseListQuery, useDepartments } from "~/lib/queries";
import type { CourseFilters, Course, Department } from "~/lib/queries";
import CourseFilterSheet, {
  type FilterDraft,
} from "~/components/CourseFilterSheet";
import CourseGridView from "~/components/CourseGridView";


export const meta: MetaFunction = () => [
  { title: "课程列表 — YOURTJ选课社区" },
];

function filterDraftCount(draft: FilterDraft): number {
  return (
    draft.departments.length +
    (draft.onlyWithReviews ? 1 : 0) +
    (draft.courseName.trim() ? 1 : 0) +
    (draft.courseCode.trim() ? 1 : 0) +
    (draft.teacherName.trim() ? 1 : 0) +
    (draft.teacherCode.trim() ? 1 : 0) +
    (draft.faculty.trim() ? 1 : 0) +
    (draft.campus.trim() ? 1 : 0)
  );
}

/* ─── Helpers: build URL params for load-more fetch ─── */
function buildLoadMoreUrl(
  q: string,
  filters: CourseFilters,
  page: number,
): string {
  const qp = new URLSearchParams();
  qp.set("page", String(page));
  qp.set("limit", "20");
  if (q.trim()) qp.set("q", q.trim());
  if (filters.departments?.length)
    qp.set("departments", filters.departments.join(","));
  if (filters.courseName) qp.set("courseName", filters.courseName);
  if (filters.courseCode) qp.set("courseCode", filters.courseCode);
  if (filters.teacherName) qp.set("teacherName", filters.teacherName);
  if (filters.teacherCode) qp.set("teacherCode", filters.teacherCode);
  if (filters.faculty) qp.set("faculty", filters.faculty);
  if (filters.campus) qp.set("campus", filters.campus);
  return `/api/courses?${qp}`;
}

/* ─── Main page ─── */
export default function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Read state from URL ────────────────────────────────────────────────
  const q = searchParams.get("q") || "";
  const departmentsRaw = searchParams.get("departments") || "";
  const departments = departmentsRaw
    ? departmentsRaw.split(",").filter(Boolean)
    : [];
  const onlyWithReviews = searchParams.get("onlyWithReviews") === "true";
  const courseName = searchParams.get("courseName") || "";
  const courseCode = searchParams.get("courseCode") || "";
  const teacherName = searchParams.get("teacherName") || "";
  const teacherCode = searchParams.get("teacherCode") || "";
  const faculty = searchParams.get("faculty") || "";
  const campus = searchParams.get("campus") || "";

  const filters: CourseFilters = {
    departments,
    onlyWithReviews: onlyWithReviews || undefined,
    courseName: courseName || undefined,
    courseCode: courseCode || undefined,
    teacherName: teacherName || undefined,
    teacherCode: teacherCode || undefined,
    faculty: faculty || undefined,
    campus: campus || undefined,
  };


  const hasFilters = !!(
    q ||
    departments.length > 0 ||
    onlyWithReviews ||
    courseName ||
    courseCode ||
    teacherName ||
    teacherCode ||
    faculty ||
    campus
  );

  // ── Department list ─────────────────────────────────────────────────────
  const { data: departmentsData } = useQuery(useDepartments());
  const departmentNames: string[] = (departmentsData ?? []).map(
    (d: Department) => d.name,
  );

  // ── Course query (page 1) ───────────────────────────────────────────────
  const queryOptions = useCourseListQuery(q, filters);
  const {
    data: page1Data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(queryOptions);

  // ── Pagination state ────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter identity for reset detection
  const filterIdentity = JSON.stringify({ q, ...filters });
  const prevFilterRef = useRef(filterIdentity);

  // Reset pagination when filters change
  useEffect(() => {
    if (prevFilterRef.current !== filterIdentity) {
      prevFilterRef.current = filterIdentity;
      setPage(1);
      setAllCourses([]);
      setHasMore(false);
    }
  }, [filterIdentity]);

  // Accumulate page 1 results
  useEffect(() => {
    if (page1Data) {
      setAllCourses(page1Data.data);
      setHasMore(page1Data.hasMore);
    }
  }, [page1Data]);

  const total = page1Data?.total;

  // ── Local search input ──────────────────────────────────────────────────
  const [searchValue, setSearchValue] = useState(q);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>({
    departments,
    onlyWithReviews,
    courseName,
    courseCode,
    teacherName,
    teacherCode,
    faculty,
    campus,
  });

  const activeFilterCount = filterDraftCount(filterDraft);

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open);
    if (open) {
      setFilterDraft({
        departments,
        onlyWithReviews,
        courseName,
        courseCode,
        teacherName,
        teacherCode,
        faculty,
        campus,
      });
    }
  };

  // ── Apply / Reset filters ───────────────────────────────────────────────
  const applyFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (q) next.set("q", q);
    else next.delete("q");

    if (filterDraft.departments.length > 0) {
      next.set("departments", filterDraft.departments.join(","));
    } else {
      next.delete("departments");
    }
    if (filterDraft.onlyWithReviews) {
      next.set("onlyWithReviews", "true");
    } else {
      next.delete("onlyWithReviews");
    }
    if (filterDraft.courseName) {
      next.set("courseName", filterDraft.courseName);
    } else {
      next.delete("courseName");
    }
    if (filterDraft.courseCode) {
      next.set("courseCode", filterDraft.courseCode);
    } else {
      next.delete("courseCode");
    }
    if (filterDraft.teacherName) {
      next.set("teacherName", filterDraft.teacherName);
    } else {
      next.delete("teacherName");
    }
    if (filterDraft.teacherCode) {
      next.set("teacherCode", filterDraft.teacherCode);
    } else {
      next.delete("teacherCode");
    }
    if (filterDraft.faculty) {
      next.set("faculty", filterDraft.faculty);
    } else {
      next.delete("faculty");
    }
    if (filterDraft.campus) {
      next.set("campus", filterDraft.campus);
    } else {
      next.delete("campus");
    }

    setSearchParams(next, { replace: true });
    setSheetOpen(false);
  }, [searchParams, setSearchParams, q, filterDraft]);

  const resetFilters = useCallback(() => {
    setFilterDraft({
      departments: [],
      onlyWithReviews: false,
      courseName: "",
      courseCode: "",
      teacherName: "",
      teacherCode: "",
      faculty: "",
      campus: "",
    });
  }, []);

  // ── Search ──────────────────────────────────────────────────────────────
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const next = new URLSearchParams(searchParams);
      if (searchValue.trim()) {
        next.set("q", searchValue.trim());
      } else {
        next.delete("q");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, searchValue],
  );

  // ── Remove individual filter badge ──────────────────────────────────────
  const removeFilter = useCallback(
    (key: string, value?: string) => {
      const next = new URLSearchParams(searchParams);
      if (key === "q") {
        next.delete("q");
        setSearchValue("");
      } else if (key === "departments" && value) {
        const updated = departments.filter((d) => d !== value);
        if (updated.length > 0) {
          next.set("departments", updated.join(","));
        } else {
          next.delete("departments");
        }
      } else {
        next.delete(key);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, departments],
  );

  // ── Load More ───────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const url = buildLoadMoreUrl(q, filters, nextPage);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Load more failed");
      const json = (await res.json()) as {
        data?: Course[];
        hasMore?: boolean;
      };
      const newCourses: Course[] = Array.isArray(json.data) ? json.data : [];
      setAllCourses((prev) => [...prev, ...newCourses]);
      setPage(nextPage);
      setHasMore(json.hasMore ?? false);
    } catch (e) {
      console.error("Load more error:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [page, q, filters]);

  // ── Active filter badges ────────────────────────────────────────────────
  const activeBadges: { key: string; label: string; value?: string }[] = [];
  if (q) {
    activeBadges.push({ key: "q", label: `搜索: ${q}` });
  }
  for (const dep of departments) {
    activeBadges.push({ key: "departments", label: dep, value: dep });
  }
  if (onlyWithReviews) {
    activeBadges.push({
      key: "onlyWithReviews",
      label: "仅显示有评价",
    });
  }
  if (courseName) {
    activeBadges.push({ key: "courseName", label: `课程名: ${courseName}` });
  }
  if (courseCode) {
    activeBadges.push({ key: "courseCode", label: `代码: ${courseCode}` });
  }
  if (teacherName) {
    activeBadges.push({
      key: "teacherName",
      label: `教师: ${teacherName}`,
    });
  }
  if (teacherCode) {
    activeBadges.push({
      key: "teacherCode",
      label: `工号: ${teacherCode}`,
    });
  }
  if (faculty) {
    activeBadges.push({ key: "faculty", label: `院系: ${faculty}` });
  }
  if (campus) {
    activeBadges.push({ key: "campus", label: `校区: ${campus}` });
  }

  return (
    <div className="space-y-6">
      {/* ─── Search ─── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                课程目录
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                搜索课程、课号或教师，按评价与开课信息筛选
              </p>
            </div>
            {!isLoading && !isError && (
              <div className="text-sm text-slate-500">
                {total ? `共 ${total} 门课程` : `${allCourses.length} 门课程`}
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="mt-4 flex items-center gap-2">
            <form
              onSubmit={handleSearch}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="搜索课程名、课号或教师"
                  className="border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
                />
              </div>
              <Button type="submit" size="sm">
                搜索
              </Button>
            </form>

            {/* Filter button */}
            <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
              <SheetTrigger render={<Button variant="outline" size="sm" />}>
                <Filter className="size-3.5" />
                <span className="hidden sm:inline">筛选</span>
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 size-5 rounded-full p-0 text-[10px]"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </SheetTrigger>
              <SheetContent side="left" className="w-80 sm:max-w-sm">
                <SheetHeader>
                  <SheetTitle>筛选课程</SheetTitle>
                </SheetHeader>
                <CourseFilterSheet
                  departments={departmentNames}
                  draft={filterDraft}
                  onDraftChange={setFilterDraft}
                  onApply={applyFilters}
                  onReset={resetFilters}
                  activeCount={activeFilterCount}
                />
              </SheetContent>
            </Sheet>

          </div>

          {/* Active filter badges */}
          {hasFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeBadges.map((badge) => (
                <Badge
                  key={`${badge.key}-${badge.value ?? ""}`}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {badge.label}
                  <button
                    onClick={() => removeFilter(badge.key, badge.value)}
                    className="ml-0.5"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {activeBadges.length > 0 && (
                <button
                  onClick={() => {
                    const next = new URLSearchParams();
                    setSearchParams(next, { replace: true });
                    setSearchValue("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  清除全部
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── Course grid ─── */}
      <CourseGridView
        courses={allCourses}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onRetry={() => refetch()}
        onLoadMore={handleLoadMore}
        hasFilters={hasFilters}
        total={total}
      />
    </div>
  );
}
