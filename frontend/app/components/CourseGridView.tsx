import { useMemo } from "react";
import { Link } from "react-router";
import {
  Star,
  ChevronRight,
  RefreshCw,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { formatRating, formatCredit, formatSemesterLabel, semesterLabelScore } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { Course } from "~/lib/queries";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CourseGridViewProps {
  courses: Course[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  hasMore: boolean;
  viewMode: "grid" | "marquee";
  onRetry: () => void;
  onLoadMore: () => void;
  hasFilters: boolean;
  total?: number;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

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

// ─── Empty state ──────────────────────────────────────────────────────────────

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

// ─── Error state ──────────────────────────────────────────────────────────────

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

// ─── Course card ──────────────────────────────────────────────────────────────

function CourseCard({ course }: { course: Course }) {
  const semesters = useMemo(() => {
    if (!course.semesters || course.semesters.length === 0) return [];
    const formatted = course.semesters
      .map(formatSemesterLabel)
      .filter(Boolean);
    const unique = Array.from(new Set(formatted));
    return unique.sort((a, b) => semesterLabelScore(b) - semesterLabelScore(a));
  }, [course.semesters]);

  const displayedSemesters = semesters.slice(0, 3);
  const hiddenCount = Math.max(0, semesters.length - 3);

  return (
    <Link
      to={`/course/${course.id}`}
      className="group block h-full"
    >
      <Card className="flex h-full flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={course.is_legacy ? "outline" : "outline"}
                className={cn(
                  "font-mono text-[10px]",
                  course.is_legacy
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-cyan-200 bg-cyan-50 text-cyan-700",
                )}
              >
                {course.code}
              </Badge>
              {course.is_legacy ? (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                >
                  旧版
                </Badge>
              ) : null}
            </div>
            {/* Rating */}
            <div className="flex items-center gap-1 shrink-0">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm font-bold text-amber-600">
                {course.rating > 0 ? formatRating(course.rating) : "暂无"}
              </span>
              <span className="text-xs text-muted-foreground">
                ({course.review_count ?? 0})
              </span>
            </div>
          </div>
          <CardTitle className="mt-2 line-clamp-1 group-hover:text-cyan-600 transition-colors">
            {course.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3">
          {/* Meta row */}
          <div className="space-y-1 text-sm text-muted-foreground">
            {course.teacher_name && (
              <p className="truncate font-medium">👤 {course.teacher_name}</p>
            )}
            {course.department && (
              <p className="truncate text-xs">{course.department}</p>
            )}
            {course.credit != null && course.credit > 0 && (
              <p className="text-xs text-muted-foreground/70">
                {formatCredit(course.credit)}
              </p>
            )}
          </div>

          {/* Semester badges */}
          {semesters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {displayedSemesters.map((s) => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="text-[10px] font-medium"
                >
                  {s}
                </Badge>
              ))}
              {hiddenCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-muted-foreground cursor-default"
                >
                  +{hiddenCount}
                </Badge>
              )}
            </div>
          )}

          <div className="mt-auto pt-3">
            <Separator className="mb-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{course.review_count ?? 0} 条评价</span>
              <span className="inline-flex items-center gap-0.5 text-cyan-600 transition-colors group-hover:text-cyan-500">
                详情{" "}
                <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Marquee view ─────────────────────────────────────────────────────────────

function CourseMarqueeView({ courses }: { courses: Course[] }) {
  return (
    <div className="space-y-4">
      <style>{`
        @keyframes marqueeRow {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .marquee-row {
          display: flex;
          gap: 1rem;
          width: fit-content;
          animation: marqueeRow var(--speed, 60s) linear infinite;
        }
        .marquee-row:hover {
          animation-play-state: paused;
        }
        .marquee-set {
          display: flex;
          gap: 1rem;
        }
        .marquee-card {
          width: 16rem;
          flex-shrink: 0;
        }
        .marquee-card .card-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        @media (max-width: 640px) {
          .marquee-card {
            width: 14rem;
          }
        }
      `}</style>

      {[0, 1, 2].map((rowIndex) => {
        const slice = courses.filter((_, i) => i % 3 === rowIndex);
        // Hide row 3 on mobile
        if (rowIndex === 2) {
          return (
            <div
              key={rowIndex}
              className="hidden sm:block overflow-x-hidden rounded-xl py-2"
            >
              <div
                className="marquee-row"
                style={{ "--speed": "85s" } as React.CSSProperties}
              >
                <div className="marquee-set">
                  {slice.map((course) => (
                    <Link
                      key={`${course.id}-m1`}
                      to={`/course/${course.id}`}
                      className="marquee-card group block h-full"
                    >
                      <Card className="card-inner transition-all duration-200 hover:scale-[1.03] hover:shadow-md">
                        <CardHeader>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px]"
                            >
                              {course.code}
                            </Badge>
                            <Badge className="flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200">
                              <Star className="size-3 fill-amber-400 text-amber-400" />
                              {course.rating > 0
                                ? formatRating(course.rating)
                                : "N/A"}
                            </Badge>
                          </div>
                          <CardTitle className="mt-2 line-clamp-1 group-hover:text-cyan-600 transition-colors">
                            {course.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <div className="space-y-1 text-sm text-muted-foreground">
                            {course.teacher_name && (
                              <p className="truncate">
                                {course.teacher_name}
                              </p>
                            )}
                          </div>
                          <Separator className="my-2" />
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{course.review_count ?? 0} 条评价</span>
                            <span className="inline-flex items-center gap-0.5 text-cyan-600 transition-colors group-hover:text-cyan-500">
                              详情{" "}
                              <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
                {/* Duplicate for seamless loop */}
                <div className="marquee-set">
                  {slice.map((course) => (
                    <Link
                      key={`${course.id}-m2`}
                      to={`/course/${course.id}`}
                      className="marquee-card group block h-full"
                    >
                      <Card className="card-inner transition-all duration-200 hover:scale-[1.03] hover:shadow-md">
                        <CardHeader>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px]"
                            >
                              {course.code}
                            </Badge>
                            <Badge className="flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200">
                              <Star className="size-3 fill-amber-400 text-amber-400" />
                              {course.rating > 0
                                ? formatRating(course.rating)
                                : "N/A"}
                            </Badge>
                          </div>
                          <CardTitle className="mt-2 line-clamp-1 group-hover:text-cyan-600 transition-colors">
                            {course.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <div className="space-y-1 text-sm text-muted-foreground">
                            {course.teacher_name && (
                              <p className="truncate">
                                {course.teacher_name}
                              </p>
                            )}
                          </div>
                          <Separator className="my-2" />
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{course.review_count ?? 0} 条评价</span>
                            <span className="inline-flex items-center gap-0.5 text-cyan-600 transition-colors group-hover:text-cyan-500">
                              详情{" "}
                              <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        const rowSpeed = rowIndex === 0 ? "70s" : "55s";
        return (
          <div
            key={rowIndex}
            className="overflow-x-hidden rounded-xl py-2"
          >
            <div
              className="marquee-row"
              style={{ "--speed": rowSpeed } as React.CSSProperties}
            >
              <div className="marquee-set">
                {slice.map((course) => (
                  <Link
                    key={`${course.id}-m1`}
                    to={`/course/${course.id}`}
                    className="marquee-card group block h-full"
                  >
                    <Card className="card-inner transition-all duration-200 hover:scale-[1.03] hover:shadow-md">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {course.code}
                          </Badge>
                          <Badge className="flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {course.rating > 0
                              ? formatRating(course.rating)
                              : "N/A"}
                          </Badge>
                        </div>
                        <CardTitle className="mt-2 line-clamp-1 group-hover:text-cyan-600 transition-colors">
                          {course.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {course.teacher_name && (
                            <p className="truncate">{course.teacher_name}</p>
                          )}
                        </div>
                        <Separator className="my-2" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{course.review_count ?? 0} 条评价</span>
                          <span className="inline-flex items-center gap-0.5 text-cyan-600 transition-colors group-hover:text-cyan-500">
                            详情{" "}
                            <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              <div className="marquee-set">
                {slice.map((course) => (
                  <Link
                    key={`${course.id}-m2`}
                    to={`/course/${course.id}`}
                    className="marquee-card group block h-full"
                  >
                    <Card className="card-inner transition-all duration-200 hover:scale-[1.03] hover:shadow-md">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {course.code}
                          </Badge>
                          <Badge className="flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {course.rating > 0
                              ? formatRating(course.rating)
                              : "N/A"}
                          </Badge>
                        </div>
                        <CardTitle className="mt-2 line-clamp-1 group-hover:text-cyan-600 transition-colors">
                          {course.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {course.teacher_name && (
                            <p className="truncate">{course.teacher_name}</p>
                          )}
                        </div>
                        <Separator className="my-2" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{course.review_count ?? 0} 条评价</span>
                          <span className="inline-flex items-center gap-0.5 text-cyan-600 transition-colors group-hover:text-cyan-500">
                            详情{" "}
                            <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CourseGridView({
  courses,
  isLoading,
  isError,
  error,
  hasMore,
  viewMode,
  onRetry,
  onLoadMore,
  hasFilters,
  total,
}: CourseGridViewProps) {
  if (viewMode === "marquee") {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-4 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-64 shrink-0">
                  <SkeletonCard />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    if (isError) {
      return <ErrorState error={error!} onRetry={onRetry} />;
    }

    if (courses.length === 0) {
      return <EmptyState hasFilters={hasFilters} />;
    }

    return <CourseMarqueeView courses={courses} />;
  }

  // Grid view
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState error={error!} onRetry={onRetry} />;
  }

  if (courses.length === 0) {
    return <EmptyState hasFilters={hasFilters} />;
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>

      {/* Load More button */}
      {hasMore && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={onLoadMore}
            className="gap-2"
          >
            <ChevronDown className="size-4" />
            加载更多
            {total ? (
              <span className="text-xs text-muted-foreground">
                ({courses.length} / {total})
              </span>
            ) : null}
          </Button>
        </div>
      )}
    </div>
  );
}
