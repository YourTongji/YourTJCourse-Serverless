import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link, type MetaFunction } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Filter,
  RefreshCw,
  X,
  Star,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "~/components/ui/sheet";
import { Separator } from "~/components/ui/separator";
import { Checkbox } from "~/components/ui/checkbox";
import { useInfiniteCourseListQuery } from "~/lib/queries";
import type { Course, CourseFilters } from "~/lib/queries";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => [
  { title: "课程列表 — YOURTJ选课社区" },
];

const PLACEHOLDER_CYCLE = [
  "搜索课程名、代码或教师...",
  "试试高等数学、线性代数...",
  "从真实评价里找到更适合你的课程...",
] as const;

const DEPARTMENTS = [
  "数学科学学院",
  "物理科学与工程学院",
  "化学科学与工程学院",
  "医学院",
  "土木工程学院",
  "建筑与城市规划学院",
  "电子与信息工程学院",
  "机械与能源工程学院",
  "经济与管理学院",
  "交通运输工程学院",
  "材料科学与工程学院",
  "环境科学与工程学院",
  "外国语学院",
  "人文学院",
  "法学院",
  "艺术与传媒学院",
  "设计创意学院",
  "软件学院",
  "测绘与地理信息学院",
  "中德工程学院",
];

/* ─── Skeleton card ─── */
function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 rounded-full bg-muted" />
          <div className="h-5 w-14 rounded-full bg-muted" />
        </div>
        <div className="mt-2 h-5 w-3/4 rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-4 w-1/2 rounded bg-muted" />
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="mt-4 h-4 w-2/5 rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Course card ─── */
function CourseCard({ course, index }: { course: Course; index: number }) {
  return (
    <Link
      to={`/course/${course.id}`}
      className="group block"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Card className="transition-all duration-200 hover:scale-[1.02] hover:shadow-md animate-in fade-in slide-in-from-bottom-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {course.code}
            </Badge>
            <Badge
              className={cn(
                "flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200",
              )}
            >
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {course.rating ? course.rating.toFixed(1) : "N/A"}
            </Badge>
          </div>
          <CardTitle className="mt-2 line-clamp-1 group-hover:text-cyan-600 transition-colors">
            {course.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm text-muted-foreground">
            {course.teacher_name && (
              <p className="truncate">{course.teacher_name}</p>
            )}
            {course.semesters && course.semesters.length > 0 && (
              <p className="truncate text-xs text-muted-foreground/70">
                {course.semesters.join("、")}
              </p>
            )}
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {course.review_count ?? 0} 条评价
            </span>
            <span className="inline-flex items-center gap-0.5 text-cyan-600 transition-colors group-hover:text-cyan-500">
              详细信息 <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ─── Empty state ─── */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg text-muted-foreground">
        没有找到相关课程，换个关键词试试吧
      </p>
      {hasFilters && (
        <p className="mt-1 text-sm text-muted-foreground/60">
          试试调整筛选条件或清除搜索词
        </p>
      )}
    </div>
  );
}

/* ─── Error state ─── */
function ErrorState({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg text-destructive">加载失败</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error.message || "请检查网络连接后重试"}
      </p>
      <Button
        variant="outline"
        className="mt-4"
        onClick={onRetry}
      >
        <RefreshCw className="mr-1.5 size-3.5" />
        重试
      </Button>
    </div>
  );
}

/* ─── Typing placeholder hook ─── */
function useTypingPlaceholder() {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const charIndexRef = useRef(0);

  useEffect(() => {
    const currentPhrase = PLACEHOLDER_CYCLE[placeholderIndex];

    if (isTyping) {
      if (charIndexRef.current < currentPhrase.length) {
        const timer = setTimeout(() => {
          charIndexRef.current++;
          setDisplayText(currentPhrase.slice(0, charIndexRef.current));
        }, 60);
        return () => clearTimeout(timer);
      }
      // pause after typing, then start deleting
      const pause = setTimeout(() => setIsTyping(false), 2000);
      return () => clearTimeout(pause);
    } else {
      if (charIndexRef.current > 0) {
        const timer = setTimeout(() => {
          charIndexRef.current--;
          setDisplayText(currentPhrase.slice(0, charIndexRef.current));
        }, 30);
        return () => clearTimeout(timer);
      }
      // move to next phrase
      const pause = setTimeout(() => {
        setPlaceholderIndex(
          (prev) => (prev + 1) % PLACEHOLDER_CYCLE.length,
        );
        setIsTyping(true);
      }, 500);
      return () => clearTimeout(pause);
    }
  }, [placeholderIndex, isTyping, displayText]);

  return displayText;
}

/* ─── Main page ─── */
export default function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filters from URL
  const q = searchParams.get("q") || "";
  const departmentsRaw = searchParams.get("departments") || "";
  const departments = departmentsRaw ? departmentsRaw.split(",").filter(Boolean) : [];
  const onlyWithReviews = searchParams.get("onlyWithReviews") === "true";
  const courseName = searchParams.get("courseName") || "";
  const courseCode = searchParams.get("courseCode") || "";
  const teacherName = searchParams.get("teacherName") || "";
  const campus = searchParams.get("campus") || "";

  const hasFilters = !!(
    q ||
    departments.length > 0 ||
    onlyWithReviews ||
    courseName ||
    courseCode ||
    teacherName ||
    campus
  );

  const filters: CourseFilters = {
    departments,
    onlyWithReviews: onlyWithReviews || undefined,
    courseName: courseName || undefined,
    courseCode: courseCode || undefined,
    teacherName: teacherName || undefined,
    campus: campus || undefined,
  };

  const queryOptions = useInfiniteCourseListQuery(q, filters);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery(queryOptions);

  const courses = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total;

  // Local state for search input
  const [searchValue, setSearchValue] = useState(q);

  // Local state for filter sheet
  const [localDepartments, setLocalDepartments] = useState<string[]>(departments);
  const [localOnlyWithReviews, setLocalOnlyWithReviews] = useState(onlyWithReviews);
  const [localCourseName, setLocalCourseName] = useState(courseName);
  const [localCourseCode, setLocalCourseCode] = useState(courseCode);
  const [localTeacherName, setLocalTeacherName] = useState(teacherName);
  const [localCampus, setLocalCampus] = useState(campus);

  // Sync local filter state when sheet opens
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open);
    if (open) {
      setLocalDepartments(departments);
      setLocalOnlyWithReviews(onlyWithReviews);
      setLocalCourseName(courseName);
      setLocalCourseCode(courseCode);
      setLocalTeacherName(teacherName);
      setLocalCampus(campus);
    }
  };

  const applyFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    // Preserve q
    // Update filter params
    if (localDepartments.length > 0) {
      next.set("departments", localDepartments.join(","));
    } else {
      next.delete("departments");
    }
    if (localOnlyWithReviews) {
      next.set("onlyWithReviews", "true");
    } else {
      next.delete("onlyWithReviews");
    }
    if (localCourseName) {
      next.set("courseName", localCourseName);
    } else {
      next.delete("courseName");
    }
    if (localCourseCode) {
      next.set("courseCode", localCourseCode);
    } else {
      next.delete("courseCode");
    }
    if (localTeacherName) {
      next.set("teacherName", localTeacherName);
    } else {
      next.delete("teacherName");
    }
    if (localCampus) {
      next.set("campus", localCampus);
    } else {
      next.delete("campus");
    }
    setSearchParams(next, { replace: true });
    setSheetOpen(false);
  }, [
    searchParams,
    setSearchParams,
    localDepartments,
    localOnlyWithReviews,
    localCourseName,
    localCourseCode,
    localTeacherName,
    localCampus,
  ]);

  const resetFilters = useCallback(() => {
    setLocalDepartments([]);
    setLocalOnlyWithReviews(false);
    setLocalCourseName("");
    setLocalCourseCode("");
    setLocalTeacherName("");
    setLocalCampus("");
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const next = new URLSearchParams(searchParams);
      if (searchValue) {
        next.set("q", searchValue);
      } else {
        next.delete("q");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, searchParams, searchValue],
  );

  const toggleDepartment = (dept: string) => {
    setLocalDepartments((prev) =>
      prev.includes(dept)
        ? prev.filter((d) => d !== dept)
        : [...prev, dept],
    );
  };

  const typingPlaceholder = useTypingPlaceholder();

  return (
    <div className="space-y-6">
      {/* ─── Hero + Search ─── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/10 via-sky-400/5 to-blue-500/10 px-6 py-10 sm:px-10 sm:py-14">
        {/* Background decorative blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 size-80 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative">
          <h1 className="font-brand text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">
            探索同济大学精彩课程
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            基于真实评价，发现最适合你的课程
          </p>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            className="mt-6 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 p-2 shadow-sm backdrop-blur-xl"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder={typingPlaceholder}
                className="border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
              />
            </div>
            <Button type="submit" size="sm">
              搜索
            </Button>
            <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
              <SheetTrigger render={<Button variant="outline" size="sm" />}>
                <Filter className="size-3.5" />
                <span className="hidden sm:inline">筛选</span>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 sm:max-w-sm">
                <SheetHeader>
                  <SheetTitle>筛选课程</SheetTitle>
                </SheetHeader>
                <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
                  {/* Department filter */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-foreground">
                      开课学院
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {DEPARTMENTS.map((dept) => (
                        <label
                          key={dept}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                            localDepartments.includes(dept)
                              ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                              : "border-border text-muted-foreground hover:bg-muted",
                          )}
                        >
                          <Checkbox
                            checked={localDepartments.includes(dept)}
                            onChange={() => toggleDepartment(dept)}
                            className="sr-only"
                          />
                          {dept}
                        </label>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Only with reviews */}
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={localOnlyWithReviews}
                      onChange={() =>
                        setLocalOnlyWithReviews((prev) => !prev)
                      }
                    />
                    <span>仅显示有评价的课程</span>
                  </label>

                  <Separator />

                  {/* Advanced filters */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">
                      高级筛选
                    </h4>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        课程名
                      </label>
                      <Input
                        value={localCourseName}
                        onChange={(e) =>
                          setLocalCourseName(e.target.value)
                        }
                        placeholder="输入课程名"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        授课教师
                      </label>
                      <Input
                        value={localTeacherName}
                        onChange={(e) =>
                          setLocalTeacherName(e.target.value)
                        }
                        placeholder="输入教师名"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        课程代码
                      </label>
                      <Input
                        value={localCourseCode}
                        onChange={(e) =>
                          setLocalCourseCode(e.target.value)
                        }
                        placeholder="如 123456"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        校区
                      </label>
                      <Input
                        value={localCampus}
                        onChange={(e) => setLocalCampus(e.target.value)}
                        placeholder="四平路 / 嘉定 / 沪西"
                      />
                    </div>
                  </div>
                </div>

                {/* Filter actions */}
                <div className="flex items-center justify-between border-t p-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                  >
                    <X className="mr-1 size-3.5" />
                    重置
                  </Button>
                  <Button size="sm" onClick={applyFilters}>
                    应用筛选
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </form>

          {/* Active filter tags */}
          {hasFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {q && (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  搜索: {q}
                  <button
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete("q");
                      setSearchParams(next, { replace: true });
                      setSearchValue("");
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
              {departments.map((d) => (
                <Badge
                  key={d}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {d}
                  <button
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      const updated = departments.filter((dd) => dd !== d);
                      if (updated.length > 0) {
                        next.set("departments", updated.join(","));
                      } else {
                        next.delete("departments");
                      }
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {onlyWithReviews && (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  仅显示有评价
                  <button
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete("onlyWithReviews");
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── Results info ─── */}
      {!isLoading && !isError && courses.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total ? `共 ${total} 门课程` : `${courses.length} 门课程`}
          </span>
          <span className="text-xs text-muted-foreground/60">
            点击卡片查看详情
          </span>
        </div>
      )}

      {/* ─── Course grid ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : isError ? (
          <ErrorState
            error={error as Error}
            onRetry={() => refetch()}
          />
        ) : courses.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          courses.map((course, i) => (
            <CourseCard key={course.id} course={course} index={i} />
          ))
        )}
      </div>

      {/* ─── Load more ─── */}
      {!isLoading && !isError && courses.length > 0 && (
        <div className="flex justify-center py-6">
          {hasNextPage ? (
            <Button
              variant="outline"
              size="lg"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
              className="min-w-48"
            >
              {isFetchingNextPage ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  加载中...
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 size-4" />
                  加载更多课程
                </>
              )}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              已显示全部课程
            </p>
          )}
        </div>
      )}
    </div>
  );
}
