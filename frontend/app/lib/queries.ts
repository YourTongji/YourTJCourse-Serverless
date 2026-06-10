import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import { API_BASE, AiSummaryResult, AiSummaryResponse } from "./api";
import { getClientId } from "./clientId";

// ─── Types ───────────────────────────────────────────────────────────────────
// TODO: Migrate to api.ts types once the API layer is ready

export interface Course {
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

export interface CourseDetail {
  id: number;
  code: string;
  name: string;
  credit: number;
  department: string;
  teacher_name: string;
  review_count: number;
  review_avg: number;
  semesters: string[];
  reviews: Review[];
}

export interface Review {
  sqid: string;
  id: number;
  rating: number;
  comment: string;
  semester: string;
  created_at: number;
  reviewer_name: string;
  reviewer_avatar: string;
  like_count: number;
  liked: boolean;
}

export interface CourseFilters {
  departments?: string[];
  onlyWithReviews?: boolean;
  courseName?: string;
  courseCode?: string;
  teacherName?: string;
  teacherCode?: string;
  campus?: string;
  faculty?: string;
}

export interface CoursesResponse {
  data: Course[];
  hasMore: boolean;
  total?: number;
}

export interface SubmitReviewInput {
  course_id: number;
  rating: number;
  comment: string;
  semester: string;
  reviewer_name?: string;
  walletUserHash?: string;
}

export interface RuntimeState {
  maintenance: boolean;
  maintenanceMessage?: string;
  announcements: Announcement[];
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  severity: "info" | "warning" | "critical";
  created_at: number;
}

export interface Department {
  id: string;
  name: string;
}

// AiSummary types (AiSummaryResult, AiSummaryResponse) are now imported from api.ts

export interface AdminReview {
  id: number;
  course_id: number;
  course_name: string;
  rating: number;
  comment: string;
  reviewer_name: string;
  hidden: boolean;
  created_at: number;
}

export interface AdminCourse {
  id: number;
  code: string;
  name: string;
  rating: number;
  review_count: number;
}

export interface AdminSettings {
  maintenance: boolean;
  maintenanceMessage: string;
}

export interface CreditBalance {
  credits: number;
}

export interface CreditSummary {
  credits: number;
  history: Array<{
    amount: number;
    reason: string;
    created_at: number;
  }>;
}

// ─── Query helpers ───────────────────────────────────────────────────────────

function buildCourseSearchParams(
  keyword: string,
  filters: CourseFilters,
  page?: number,
  limit = 20,
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page ?? 1),
    limit: String(limit),
  });
  if (keyword) params.set("q", keyword);
  if (filters.departments?.length)
    params.set("departments", filters.departments.join(","));
  if (filters.onlyWithReviews) params.set("onlyWithReviews", "true");
  if (filters.courseName) params.set("courseName", filters.courseName);
  if (filters.courseCode) params.set("courseCode", filters.courseCode);
  if (filters.teacherName) params.set("teacherName", filters.teacherName);
  if (filters.teacherCode) params.set("teacherCode", filters.teacherCode);
  if (filters.campus) params.set("campus", filters.campus);
  if (filters.faculty) params.set("faculty", filters.faculty);
  if (page === 1) params.set("includeTotal", "true");
  return params;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    signal: AbortSignal.timeout(15000),
    ...init,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Course Queries ──────────────────────────────────────────────────────────

export function useCourseListQuery(keyword: string, filters: CourseFilters) {
  return useMemo(
    () => ({
      queryKey: ["courses", keyword, filters] as const,
      queryFn: async ({
        queryKey: [, kw, fl],
      }: {
        queryKey: readonly [string, string, CourseFilters];
      }): Promise<CoursesResponse> => {
        const params = buildCourseSearchParams(kw, fl);
        return apiFetch<CoursesResponse>(`/api/courses?${params}`);
      },
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    }),
    [keyword, filters],
  );
}

export function useInfiniteCourseListQuery(
  keyword: string,
  filters: CourseFilters,
) {
  return useMemo(
    () => ({
      queryKey: ["courses", "infinite", keyword, filters] as const,
      queryFn: async ({
        pageParam = 1,
        queryKey: [, , kw, fl],
      }: {
        pageParam?: number;
        queryKey: readonly [string, string, string, CourseFilters];
      }): Promise<CoursesResponse & { page: number }> => {
        const params = buildCourseSearchParams(kw, fl, pageParam);
        const data = await apiFetch<CoursesResponse>(
          `/api/courses?${params}`,
        );
        return { ...data, page: pageParam };
      },
      initialPageParam: 1,
      getNextPageParam: (
        lastPage: CoursesResponse & { page: number },
      ) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    }),
    [keyword, filters],
  );
}

export function useCourseDetail(
  courseId: number,
  initialData?: CourseDetail,
) {
  return useMemo(
    () => ({
      queryKey: ["course", courseId] as const,
      queryFn: async (): Promise<CourseDetail> => {
        return apiFetch<CourseDetail>(`/api/course/${courseId}`);
      },
      staleTime: 30_000,
      ...(initialData !== undefined ? { initialData } : {}),
    }),
    [courseId, initialData],
  );
}

export function useRelatedCourses(courseId: number) {
  return useMemo(
    () => ({
      queryKey: ["courses", "related", courseId] as const,
      queryFn: async (): Promise<Course[]> => {
        const { data } = await apiFetch<{ data: Course[] }>(
          `/api/course/${courseId}/related`,
        );
        return data;
      },
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      enabled: !!courseId,
    }),
    [courseId],
  );
}

// ─── Review Mutations ────────────────────────────────────────────────────────

export function useToggleReviewLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      liked,
    }: {
      reviewId: number;
      liked: boolean;
    }) => {
      const clientId = getClientId();
      const res = await fetch(`${API_BASE}/api/review/${reviewId}/like`, {
        method: liked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error("Failed to toggle like");
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["course"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["course"] });
    },
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitReviewInput) => {
      const res = await fetch(`${API_BASE}/api/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to submit review");
      return res.json();
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["course", variables.course_id],
      });
    },
  });
}

export function useReportReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      reason,
    }: {
      reviewId: number;
      reason: string;
    }) => {
      const clientId = getClientId();
      const res = await fetch(`${API_BASE}/api/review/${reviewId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, clientId }),
      });
      if (!res.ok) throw new Error("Failed to report review");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["course"] });
    },
  });
}

// ─── Settings / Runtime Queries ──────────────────────────────────────────────

export function useRuntimeState() {
  return useMemo(
    () => ({
      queryKey: ["runtime"] as const,
      queryFn: async (): Promise<RuntimeState> => {
        return apiFetch<RuntimeState>("/api/settings/runtime-state");
      },
      refetchInterval: 15_000,
      staleTime: 10_000,
      gcTime: 5 * 60_000,
    }),
    [],
  );
}

export function useAnnouncements() {
  return useMemo(
    () => ({
      queryKey: ["announcements"] as const,
      queryFn: async (): Promise<Announcement[]> => {
        const { announcements } = await apiFetch<{ announcements: Announcement[] }>(
          "/api/settings/announcements",
        );
        return announcements;
      },
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchInterval: 15_000,
    }),
    [],
  );
}

export function useMaintenanceStatus() {
  return useMemo(
    () => ({
      queryKey: ["maintenance"] as const,
      queryFn: async (): Promise<{
        maintenance: boolean;
        maintenanceMessage?: string;
      }> => {
        const { maintenance, maintenanceMessage } =
          await apiFetch<RuntimeState>("/api/settings/runtime-state");
        return { maintenance, maintenanceMessage };
      },
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchInterval: 15_000,
    }),
    [],
  );
}

export function useShowIcu() {
  return useMemo(
    () => ({
      queryKey: ["settings", "showIcu"] as const,
      queryFn: async (): Promise<boolean> => {
        const data = await apiFetch<{ showIcu: boolean }>(
          "/api/settings/show_icu",
        );
        return data.showIcu;
      },
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    }),
    [],
  );
}

// ─── AI Summary ──────────────────────────────────────────────────────────────

export function useAiSummary(courseId: number, enabled = false) {
  return useMemo(
    () => ({
      queryKey: ["course", courseId, "ai-summary"] as const,
      queryFn: async (): Promise<AiSummaryResponse> => {
        return apiFetch<AiSummaryResponse>(`/api/course/${courseId}/summary`);
      },
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      enabled,
    }),
    [courseId, enabled],
  );
}

// ─── Department Queries ──────────────────────────────────────────────────────

export function useDepartments() {
  return useMemo(
    () => ({
      queryKey: ["departments"] as const,
      queryFn: async (): Promise<Department[]> => {
        const payload = await apiFetch<{
          data?: Department[];
          departments?: string[];
        }>("/api/departments");
        if (Array.isArray(payload.data)) return payload.data;
        return (payload.departments ?? []).map((name) => ({ id: name, name }));
      },
      staleTime: 30 * 60_000,
      gcTime: 60 * 60_000,
    }),
    [],
  );
}

export function useAdminReviews(params: {
  page?: number;
  limit?: number;
  hidden?: boolean;
  adminSecret?: string;
}) {
  return useMemo(
    () => ({
      queryKey: ["admin", "reviews", params] as const,
      queryFn: async (): Promise<{
        data: AdminReview[];
        total: number;
      }> => {
        const searchParams = new URLSearchParams();
        if (params.page) searchParams.set("page", String(params.page));
        if (params.limit) searchParams.set("limit", String(params.limit));
        if (params.hidden !== undefined)
          searchParams.set("hidden", String(params.hidden));
        const headers: Record<string, string> = {};
        if (params.adminSecret) headers["x-admin-secret"] = params.adminSecret;
        return apiFetch(`/api/admin/reviews?${searchParams}`);
      },
      staleTime: 0,
      retry: 1,
      gcTime: 5 * 60_000,
    }),
    [params],
  );
}

export function useAdminCourses(params: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  return useMemo(
    () => ({
      queryKey: ["admin", "courses", params] as const,
      queryFn: async (): Promise<{
        data: AdminCourse[];
        total: number;
      }> => {
        const searchParams = new URLSearchParams();
        if (params.page) searchParams.set("page", String(params.page));
        if (params.limit) searchParams.set("limit", String(params.limit));
        if (params.search) searchParams.set("search", params.search);
        return apiFetch(`/api/admin/courses?${searchParams}`);
      },
      staleTime: 0,
      retry: 1,
      gcTime: 5 * 60_000,
    }),
    [params],
  );
}

export function useAdminSettings() {
  return useMemo(
    () => ({
      queryKey: ["admin", "settings"] as const,
      queryFn: async (): Promise<AdminSettings> => {
        return apiFetch<AdminSettings>("/api/admin/settings");
      },
      staleTime: 0,
      retry: 1,
      gcTime: 5 * 60_000,
    }),
    [],
  );
}

// ─── Admin Mutations ─────────────────────────────────────────────────────────

export function useUpdateAdminReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      ...updates
    }: {
      reviewId: number;
      hidden?: boolean;
      rating?: number;
      comment?: string;
    }) => {
      const res = await fetch(`${API_BASE}/api/admin/review/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update review");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });
}

export function useToggleReviewHide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      hidden,
    }: {
      reviewId: number;
      hidden: boolean;
    }) => {
      const res = await fetch(
        `${API_BASE}/api/admin/review/${reviewId}/hide`,
        {
          method: hidden ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (!res.ok) throw new Error("Failed to toggle review hide");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["course"] });
    },
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reviewId: number) => {
      const res = await fetch(`${API_BASE}/api/admin/review/${reviewId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete review");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["course"] });
    },
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      code: string;
      name: string;
      credit?: number;
      department?: string;
      teacher_name?: string;
    }) => {
      const res = await fetch(`${API_BASE}/api/admin/course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create course");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useUpdateCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      courseId,
      ...updates
    }: {
      courseId: number;
      code?: string;
      name?: string;
      credit?: number;
      department?: string;
      teacher_name?: string;
    }) => {
      const res = await fetch(`${API_BASE}/api/admin/course/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update course");
      return res.json();
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      queryClient.invalidateQueries({
        queryKey: ["course", variables.courseId],
      });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (courseId: number) => {
      const res = await fetch(`${API_BASE}/api/admin/course/${courseId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete course");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: AdminSettings) => {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["runtime"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}

// ─── Credit Wallet Queries ───────────────────────────────────────────────────

export function useCreditBalance(userHash?: string) {
  return useMemo(
    () => ({
      queryKey: ["wallet", "balance", userHash] as const,
      queryFn: async (): Promise<CreditBalance> => {
        const params = userHash
          ? `?userHash=${encodeURIComponent(userHash)}`
          : "";
        return apiFetch<CreditBalance>(`/api/wallet/balance${params}`);
      },
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    }),
    [userHash],
  );
}

export function useCreditSummary(userHash?: string) {
  return useMemo(
    () => ({
      queryKey: ["wallet", "summary", userHash] as const,
      queryFn: async (): Promise<CreditSummary> => {
        const params = userHash
          ? `?userHash=${encodeURIComponent(userHash)}`
          : "";
        return apiFetch<CreditSummary>(`/api/wallet/summary${params}`);
      },
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    }),
    [userHash],
  );
}
