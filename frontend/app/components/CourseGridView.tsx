import { useMemo } from "react";
import { Link } from "react-router";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  RefreshCw,
  UserRound,
} from "lucide-react";

import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
  formatCredit,
  formatSemesterLabel,
  semesterLabelScore,
} from "~/lib/format";
import { cn } from "~/lib/utils";
import type { Course } from "~/lib/queries";
import StarRating from "~/components/StarRating";

interface CourseGridViewProps {
  courses: Course[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onRetry: () => void;
  onLoadMore?: () => void;
  hasFilters: boolean;
  total?: number;
}

function SkeletonCard() {
  return (
    <Card className="h-[218px] border-slate-200 bg-white">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-5 w-4/5" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-5 h-8 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <BookOpen className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">
        没有找到相关课程
      </p>
      {hasFilters && (
        <p className="mt-1 text-sm text-slate-500">
          调整筛选条件或换个关键词再试
        </p>
      )}
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-red-700">课程加载失败</p>
      <p className="mt-1 text-sm text-red-600/80">
        {error.message || "请检查网络连接后重试"}
      </p>
      <Button variant="outline" className="mt-4 bg-white" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        重试
      </Button>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  const semesters = useMemo(() => {
    if (!course.semesters || course.semesters.length === 0) return [];
    const formatted = course.semesters.map(formatSemesterLabel).filter(Boolean);
    const unique = Array.from(new Set(formatted));
    return unique.sort((a, b) => semesterLabelScore(b) - semesterLabelScore(a));
  }, [course.semesters]);

  const displayedSemesters = semesters.slice(0, 3);
  const hiddenCount = Math.max(0, semesters.length - displayedSemesters.length);
  const hasRating = course.rating > 0;

  return (
    <Link
      to={`/course/${course.id}`}
      className="group block h-full"
      onClick={() => {
        try { sessionStorage.setItem("course-list-scroll", String(window.scrollY)); } catch {}
      }}
    >
      <Card className="flex h-full min-h-[218px] flex-col overflow-hidden border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  "max-w-full truncate border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-600",
                  course.is_legacy &&
                    "border-amber-200 bg-amber-50 text-amber-700",
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
            <div
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                hasRating
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              <StarRating rating={hasRating ? course.rating : 0} size={14} showValue={hasRating} />
              {!hasRating && <span>暂无</span>}
            </div>
          </div>
          <CardTitle className="mt-3 line-clamp-2 text-base leading-snug text-slate-900 transition-colors group-hover:text-teal-700">
            {course.name}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 text-sm">
          <div className="space-y-1.5 text-slate-600">
            {course.teacher_name && (
              <div className="flex min-w-0 items-center gap-2">
                <UserRound className="size-3.5 shrink-0 text-teal-600" />
                <span className="truncate font-medium">{course.teacher_name}</span>
              </div>
            )}
            {course.department && (
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Building2 className="size-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{course.department}</span>
              </div>
            )}
            {course.credit != null && course.credit > 0 && (
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <BookOpen className="size-3.5 shrink-0 text-slate-400" />
                <span>{formatCredit(course.credit)}</span>
              </div>
            )}
          </div>

          {semesters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <CalendarDays className="mr-0.5 size-3.5 text-slate-400" />
              {displayedSemesters.map((semester) => (
                <Badge
                  key={semester}
                  variant="secondary"
                  className="bg-slate-100 text-[10px] font-medium text-slate-600"
                >
                  {semester}
                </Badge>
              ))}
              {hiddenCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-slate-500"
                >
                  +{hiddenCount}
                </Badge>
              )}
            </div>
          )}

          <div className="mt-auto pt-2">
            <Separator className="mb-3" />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3.5" />
                {course.review_count ?? 0} 条评价
              </span>
              <span className="inline-flex items-center gap-0.5 font-medium text-teal-700 transition-colors group-hover:text-teal-600">
                查看
                <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function CourseGridView({
  courses,
  isLoading,
  isError,
  error,
  hasMore,
  loadingMore,
  onRetry,
  onLoadMore,
  hasFilters,
  total,
}: CourseGridViewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <SkeletonCard key={index} />
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>

      {hasMore && onLoadMore && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="bg-white"
          >
            {loadingMore ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            {loadingMore ? "加载中" : "加载更多"}
            {total ? (
              <span className="text-xs text-slate-500">
                ({courses.length} / {total})
              </span>
            ) : null}
          </Button>
        </div>
      )}
    </div>
  );
}
