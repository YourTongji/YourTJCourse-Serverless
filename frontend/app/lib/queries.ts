import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { API_BASE } from "./api";

interface Course {
  id: number;
  code: string;
  name: string;
  rating: number;
  review_count: number;
  teacher_name: string;
  semesters?: string[];
  department?: string;
  credit?: number;
  is_legacy?: number;
}

interface CourseFilters {
  departments?: string[];
  onlyWithReviews?: boolean;
  courseName?: string;
  courseCode?: string;
  teacherName?: string;
  teacherCode?: string;
  campus?: string;
  faculty?: string;
}

interface CoursesResponse {
  data: Course[];
  hasMore: boolean;
  total?: number;
}

export function useCourseListQuery(keyword: string, filters: CourseFilters) {
  return useMemo(() => ({
    queryKey: ["courses", keyword, filters] as const,
    queryFn: async ({ queryKey: [, kw, fl] }: { queryKey: readonly [string, string, CourseFilters] }): Promise<CoursesResponse> => {
      const params = new URLSearchParams({ page: "1", limit: "20" });
      if (kw) params.set("q", kw);
      if (fl.departments?.length) params.set("departments", fl.departments.join(","));
      if (fl.onlyWithReviews) params.set("onlyWithReviews", "true");
      if (fl.courseName) params.set("courseName", fl.courseName);
      if (fl.courseCode) params.set("courseCode", fl.courseCode);
      if (fl.teacherName) params.set("teacherName", fl.teacherName);
      if (fl.teacherCode) params.set("teacherCode", fl.teacherCode);
      if (fl.campus) params.set("campus", fl.campus);
      if (fl.faculty) params.set("faculty", fl.faculty);
      params.set("includeTotal", "true");

      const res = await fetch(`${API_BASE}/api/courses?${params}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Failed to fetch courses");
      return res.json();
    },
    staleTime: 30_000,
  }), [keyword, filters]);
}

export function useInfiniteCourseListQuery(keyword: string, filters: CourseFilters) {
  return useMemo(() => ({
    queryKey: ["courses", "infinite", keyword, filters] as const,
    queryFn: async ({ pageParam = 1, queryKey: [, , kw, fl] }: { pageParam?: number; queryKey: readonly [string, string, string, CourseFilters] }): Promise<CoursesResponse & { page: number }> => {
      const params = new URLSearchParams({ page: String(pageParam), limit: "20" });
      if (kw) params.set("q", kw);
      if (fl.departments?.length) params.set("departments", fl.departments.join(","));
      if (fl.onlyWithReviews) params.set("onlyWithReviews", "true");
      if (fl.courseName) params.set("courseName", fl.courseName);
      if (fl.courseCode) params.set("courseCode", fl.courseCode);
      if (fl.teacherName) params.set("teacherName", fl.teacherName);
      if (fl.teacherCode) params.set("teacherCode", fl.teacherCode);
      if (fl.campus) params.set("campus", fl.campus);
      if (fl.faculty) params.set("faculty", fl.faculty);

      const res = await fetch(`${API_BASE}/api/courses?${params}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Failed to fetch courses");
      return { ...(await res.json()), page: pageParam };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: CoursesResponse & { page: number }) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: 30_000,
  }), [keyword, filters]);
}

export type { Course, CourseFilters, CoursesResponse };

export function useCourseDetail(courseId: number) {
  return useMemo(() => ({
    queryKey: ["course", courseId] as const,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/course/${courseId}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Failed to fetch course");
      return res.json() as Promise<{ data: Course }>;
    },
    staleTime: 60_000,
  }), [courseId]);
}

export function useToggleReviewLike(queryClient: ReturnType<typeof useQueryClient>) {
  return {
    mutationFn: async ({ reviewId, clientId, liked }: { reviewId: number; clientId: string; liked: boolean }) => {
      const res = await fetch(`${API_BASE}/api/review/${reviewId}/like`, {
        method: liked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error("Failed to toggle like");
      return res.json();
    },
    onMutate: async ({ reviewId }: { reviewId: number }) => {
      await queryClient.cancelQueries({ queryKey: ["course"] });
    },
  };
}
