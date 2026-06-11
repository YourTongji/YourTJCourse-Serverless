import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useRelatedCourses } from "~/lib/queries";
import { formatRating } from "~/lib/format";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";

interface RelatedCoursesProps {
  courseId: number;
}

interface RelatedCourseItem {
  id: number;
  code: string;
  name: string;
  teacher_name: string;
  review_avg: number;
  review_count: number;
}

interface RelatedCourseGroup {
  teacher_other_courses: RelatedCourseItem[];
  same_course_other_teachers: RelatedCourseItem[];
}

function isRelatedGroup(data: unknown): data is RelatedCourseGroup {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.teacher_other_courses) ||
    Array.isArray(d.same_course_other_teachers);
}

const MOBILE_BREAKPOINT = 1024;

export default function RelatedCourses({ courseId }: RelatedCoursesProps) {
  const queryOptions = useRelatedCourses(courseId);
  const { data: rawData, isLoading, isError } = useQuery(queryOptions);

  const related: RelatedCourseGroup = isRelatedGroup(rawData)
    ? (rawData as unknown as RelatedCourseGroup)
    : { teacher_other_courses: [], same_course_other_teachers: [] };

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined"
      ? window.innerWidth < MOBILE_BREAKPOINT
      : false,
  );
  const [collapsed, setCollapsed] = useState(isMobile);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      setCollapsed((prev) => (mobile ? prev : false));
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (isError) return null;

  const { teacher_other_courses, same_course_other_teachers } = related;
  const itemCount =
    teacher_other_courses.length + same_course_other_teachers.length;

  if (itemCount === 0) return null;

  const renderList = (
    items: RelatedCourseItem[],
    type: "course" | "teacher",
  ) => {
    if (!items.length) {
      return <p className="text-sm text-muted-foreground">暂无相关内容</p>;
    }

    return (
      <div className="space-y-2">
        {items.slice(0, 5).map((item) => (
          <Link
            key={`${type}-${item.id}`}
            to={`/course/${item.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 px-3 py-2 transition hover:border-cyan-200 hover:bg-cyan-50/60"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-700">
                {type === "course"
                  ? item.name
                  : item.teacher_name || "未知教师"}
              </p>
              <p className="truncate text-xs text-slate-400">
                {type === "course"
                  ? item.code || "无课程代码"
                  : item.name || item.code || "未命名课程"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-amber-500">
                {formatRating(item.review_avg)}
              </p>
              <p className="text-[10px] text-slate-400">
                {item.review_count || 0} 评
              </p>
            </div>
          </Link>
        ))}
      </div>
    );
  };

  // Mobile: collapsible
  if (isMobile && collapsed) {
    return (
      <Card>
        <CardContent className="p-0">
          <Button
            variant="ghost"
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left h-auto"
            onClick={() => setCollapsed(false)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
              <p className="truncate text-sm font-medium text-slate-700">
                相关课程
                <span className="ml-2 text-xs text-muted-foreground">
                  共 {itemCount} 项
                </span>
              </p>
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-5">
        {isMobile && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
              <p className="truncate text-sm font-medium text-slate-700">
                相关课程
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(true)}
            >
              收起
              <ChevronUp className="size-3.5 ml-1" />
            </Button>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-cyan-500" />
            <h3 className="text-sm font-semibold text-slate-700">
              该老师的其他课程
            </h3>
          </div>
          {renderList(teacher_other_courses, "course")}
        </div>

        {same_course_other_teachers.length > 0 && (
          <div className="border-t border-slate-100 pt-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              <h3 className="text-sm font-semibold text-slate-700">
                该课程其他老师
              </h3>
            </div>
            {renderList(same_course_other_teachers, "teacher")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
