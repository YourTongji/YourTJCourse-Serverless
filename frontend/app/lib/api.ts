export const API_BASE = import.meta.env.VITE_API_BASE || "";

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const json = JSON.parse(text);
      const message = String(json?.error || json?.message || "").trim();
      if (message) return message;
    } catch {
      // fall through to raw text
    }
  }
  return text || fallback;
}

async function safeJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text().catch(() => "");
  if (!text) return {} as T;
  if (/^\s*<!doctype\s+html/i.test(text) || /^\s*<html/i.test(text)) {
    throw new Error("Expected JSON but got HTML — check API base URL");
  }
  if (!/application\/json/i.test(contentType) && text.trim().length > 0) {
    // Best-effort: try parsing anyway; many CF Workers omit content-type
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse JSON response: ${text.slice(0, 200)}`);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CourseSearchParams {
  q?: string;
  departments?: string;
  onlyWithReviews?: boolean;
  courseName?: string;
  courseCode?: string;
  teacherName?: string;
  teacherCode?: string;
  campus?: string;
  faculty?: string;
  includeTotal?: boolean;
  page?: number;
  limit?: number;
}

export interface CourseRow {
  id: number;
  code: string;
  name: string;
  rating: number;
  review_count: number;
  is_legacy: number;
  teacher_name: string;
  department: string;
  credit: number;
  semesters: string[];
}

export interface CourseListResponse {
  data: CourseRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  total?: number;
  totalPages?: number;
}

export interface ReviewObject {
  id: number;
  sqid: string;
  course_id: number;
  semester: string;
  rating: number;
  comment: string;
  score: number | null;
  created_at: string;
  approve_count: number;
  disapprove_count: number;
  is_hidden: number;
  is_legacy: number;
  is_icu: number;
  reviewer_name: string | null;
  reviewer_avatar: string | null;
  like_count: number;
  liked?: boolean;
  can_edit?: boolean;
}

export interface CourseDetail {
  id: number;
  code: string;
  name: string;
  credit: number;
  department: string;
  // Normalized fields from course detail response
  review_count: number;
  review_avg: number;
  semesters: string[];
  reviews: ReviewObject[];
  // Other raw course columns (sparse)
  [key: string]: unknown;
}

export interface CourseRelatedResponse {
  teacher_other_courses: RelatedCourse[];
  same_course_other_teachers: RelatedCourse[];
}

export interface RelatedCourse {
  id: number;
  code: string;
  name: string;
  teacher_name: string;
  review_avg: number;
  review_count: number;
}

export interface ReviewSubmission {
  course_id: number;
  rating: number;
  comment: string;
  semester: string;
  turnstile_token: string;
  reviewer_name?: string;
  reviewer_avatar?: string;
  walletUserHash?: string;
}

export interface ReviewUpdateData {
  rating: number;
  comment: string;
  semester: string;
  turnstile_token: string;
  reviewer_name?: string;
  reviewer_avatar?: string;
  walletUserHash?: string;
}

export interface Announcement {
  id: string;
  type: "info" | "warning" | "error" | "success";
  title?: string;
  content: string;
  enabled?: boolean;
  createdAt?: string;
}

export interface SiteRuntimeState {
  maintenance: {
    enabled: boolean;
    config?: unknown;
  };
  announcements: Announcement[];
  updatedAt: number;
}

export interface AiSummaryResult {
  rating_consensus: string;
  keywords: string[];
  pros: string[];
  cons: string[];
  representative: Array<{ text: string; sentiment: string }>;
}

export interface AiSummaryResponse {
  data: AiSummaryResult;
  generatedAt: number;
  cache: string;
}

// Admin types
export interface AdminReview {
  id: number;
  sqid: string;
  course_id: number;
  semester: string;
  rating: number;
  comment: string;
  score: number | null;
  created_at: string;
  approve_count: number;
  disapprove_count: number;
  is_hidden: number;
  is_legacy: number;
  is_icu: number;
  reviewer_name: string | null;
  reviewer_avatar: string | null;
  course_name: string;
  code: string;
  wallet_user_hash?: string | null;
  edit_token?: string | null;
}

export interface AdminCourse {
  id: number;
  code: string;
  name: string;
  credit: number;
  department: string;
  teacher_name?: string;
  teacher_id?: number | null;
  search_keywords?: string;
  review_count?: number;
  review_avg?: number;
  is_legacy?: number;
  is_icu?: number;
  [key: string]: unknown;
}

export interface AdminPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminCourseCreateData {
  code: string;
  name: string;
  credit?: number;
  department?: string;
  teacher_name?: string;
  search_keywords?: string;
}

export interface AdminCourseUpdateData {
  code?: string;
  name?: string;
  credit?: number;
  department?: string;
  teacher_name?: string;
  search_keywords?: string;
}

export interface AdminReviewUpdateData {
  comment?: string;
  rating?: number;
  reviewer_name?: string;
  reviewer_avatar?: string;
}

export interface CampusOption {
  campusId: string;
  campusName: string;
}

// ─── Public: Startup ─────────────────────────────────────────────────────────

export async function postStartupVerify(token: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/startup/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await safeJson<{ success?: boolean; error?: string }>(res);
  if (!res.ok) {
    return { success: false, error: data?.error || "network_error" };
  }
  return { success: data?.success === true, error: data?.success !== true ? (data?.error || "verify_failed") : undefined };
}

// ─── Public: Departments ─────────────────────────────────────────────────────

export async function fetchDepartments(): Promise<string[]> {
  const res = await fetchWithTimeout(`${API_BASE}/api/departments`, undefined, 15000);
  if (!res.ok) throw new Error("Failed to fetch departments");
  const data = await safeJson<{ departments: string[] }>(res);
  return data.departments || [];
}

// ─── Public: Courses ─────────────────────────────────────────────────────────

export async function fetchCourses(params: CourseSearchParams = {}): Promise<CourseListResponse> {
  const qp = new URLSearchParams();
  qp.set("page", String(params.page ?? 1));
  qp.set("limit", String(params.limit ?? 20));
  if (params.q) qp.set("q", params.q);
  if (params.departments) qp.set("departments", params.departments);
  if (params.onlyWithReviews) qp.set("onlyWithReviews", "true");
  if (params.courseName) qp.set("courseName", params.courseName);
  if (params.courseCode) qp.set("courseCode", params.courseCode);
  if (params.teacherName) qp.set("teacherName", params.teacherName);
  if (params.teacherCode) qp.set("teacherCode", params.teacherCode);
  if (params.campus) qp.set("campus", params.campus);
  if (params.faculty) qp.set("faculty", params.faculty);
  if (params.includeTotal) qp.set("includeTotal", "true");

  const needHeavyFilter = Boolean(
    params.courseName || params.teacherName || params.teacherCode || params.campus || params.faculty,
  );
  const res = await fetchWithTimeout(`${API_BASE}/api/courses?${qp}`, undefined, needHeavyFilter ? 25000 : 15000);
  if (!res.ok) throw new Error("Failed to fetch courses");
  return safeJson<CourseListResponse>(res);
}

export async function fetchCourse(
  id: number,
  clientId?: string,
  walletUserHash?: string,
  cacheBust?: string,
): Promise<CourseDetail> {
  const qp = new URLSearchParams();
  if (clientId) qp.set("clientId", clientId);
  if (walletUserHash) qp.set("walletUserHash", walletUserHash);
  if (cacheBust) qp.set("_", cacheBust);
  const suffix = qp.toString() ? `?${qp.toString()}` : "";
  const res = await fetchWithTimeout(
    `${API_BASE}/api/course/${id}${suffix}`,
    cacheBust ? { cache: "no-store", headers: { "Cache-Control": "no-cache" } } : undefined,
    15000,
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Course not found");
    throw new Error("Failed to fetch course");
  }
  return safeJson<CourseDetail>(res);
}

export async function fetchCourseRelated(id: number): Promise<CourseRelatedResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/api/course/${id}/related`, undefined, 15000);
  if (!res.ok) throw new Error("Failed to fetch related course data");
  return safeJson<CourseRelatedResponse>(res);
}

export async function fetchCourseByCode(
  code: string,
  params?: { teacherName?: string; teacherCode?: string; clientId?: string },
): Promise<CourseDetail> {
  const qp = new URLSearchParams();
  if (params?.teacherName) qp.set("teacherName", params.teacherName);
  if (params?.teacherCode) qp.set("teacherCode", params.teacherCode);
  if (params?.clientId) qp.set("clientId", params.clientId);
  const suffix = qp.toString() ? `?${qp.toString()}` : "";
  const res = await fetchWithTimeout(`${API_BASE}/api/course/by-code/${encodeURIComponent(code)}${suffix}`, undefined, 15000);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Course not found");
    throw new Error("Failed to fetch course by code");
  }
  return safeJson<CourseDetail>(res);
}

// ─── Public: Reviews ─────────────────────────────────────────────────────────

export async function submitReview(data: ReviewSubmission): Promise<{ success: boolean; reviewId: number }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }, 15000);
  if (!res.ok) {
    const msg = await readApiError(res, `提交失败 (HTTP ${res.status})`);
    throw new Error(msg);
  }
  return safeJson<{ success: boolean; reviewId: number }>(res);
}

export async function likeReview(reviewId: number, clientId: string): Promise<{ liked: boolean; like_count: number }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  }, 15000);
  if (!res.ok) throw new Error("Failed to like review");
  return safeJson<{ liked: boolean; like_count: number }>(res);
}

export async function unlikeReview(reviewId: number, clientId: string): Promise<{ liked: boolean; like_count: number }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}/like`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  }, 15000);
  if (!res.ok) throw new Error("Failed to unlike review");
  return safeJson<{ liked: boolean; like_count: number }>(res);
}

export async function patchReviewEditToken(
  reviewId: number,
  data: { edit_token: string; walletUserHash: string },
): Promise<{ success: boolean; creditReward?: unknown }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}/edit-token`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return safeJson<{ success: boolean; creditReward?: unknown }>(res);
}

export async function updateReview(reviewId: number, data: ReviewUpdateData): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }, 15000);
  if (!res.ok) {
    const msg = await readApiError(res, `提交失败 (HTTP ${res.status})`);
    throw new Error(msg);
  }
  return safeJson<{ success: boolean }>(res);
}

export async function reportReview(
  reviewId: number,
  clientId: string,
  reason: string,
): Promise<{ success: boolean; reportId: number | null }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/review/${reviewId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, reason }),
  }, 15000);
  if (!res.ok) throw new Error("Failed to report review");
  return safeJson<{ success: boolean; reportId: number | null }>(res);
}

// ─── Public: Settings ────────────────────────────────────────────────────────

export async function fetchSiteRuntimeState(): Promise<SiteRuntimeState> {
  const res = await fetchWithTimeout(`${API_BASE}/api/settings/runtime-state`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  }, 15000);
  if (!res.ok) throw new Error("Failed to fetch runtime state");
  return safeJson<SiteRuntimeState>(res);
}

export async function fetchAnnouncements(): Promise<{ announcements: Announcement[] }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/settings/announcements`, undefined, 15000);
  if (!res.ok) throw new Error("Failed to fetch announcements");
  return safeJson<{ announcements: Announcement[] }>(res);
}

export async function fetchMaintenanceStatus(): Promise<{ enabled: boolean; config?: unknown }> {
  const res = await fetchWithTimeout(`${API_BASE}/api/settings/maintenance`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  }, 15000);
  if (!res.ok) throw new Error("Failed to fetch maintenance status");
  return safeJson<{ enabled: boolean; config?: unknown }>(res);
}

// ─── Public: AI Summary ──────────────────────────────────────────────────────

export async function fetchAiSummary(
  courseId: number,
  refresh?: boolean,
): Promise<AiSummaryResponse> {
  const qp = refresh ? "?refresh=true" : "";
  const res = await fetchWithTimeout(`${API_BASE}/api/course/${courseId}/summary${qp}`, undefined, 15000);
  if (!res.ok) {
    if (res.status === 429) throw new Error("AI summary rate limited — please try later");
    throw new Error("Failed to fetch AI summary");
  }
  return safeJson<AiSummaryResponse>(res);
}

// ─── Admin: Reviews ──────────────────────────────────────────────────────────

export async function fetchAdminReviews(params?: {
  q?: string;
  page?: number;
  limit?: number;
  adminSecret?: string;
}): Promise<AdminPaginatedResponse<AdminReview>> {
  const qp = new URLSearchParams();
  qp.set("page", String(params?.page ?? 1));
  qp.set("limit", String(params?.limit ?? 50));
  if (params?.q) qp.set("q", params.q);

  const headers: Record<string, string> = {};
  if (params?.adminSecret) headers["x-admin-secret"] = params.adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/reviews?${qp}`, { headers }, 15000);
  if (res.status === 401) throw new Error("管理密钥错误");
  if (!res.ok) throw new Error("Failed to fetch admin reviews");
  return safeJson<AdminPaginatedResponse<AdminReview>>(res);
}

export async function updateAdminReview(
  id: number,
  data: AdminReviewUpdateData,
  adminSecret?: string,
): Promise<{ success: boolean }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/review/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  }, 15000);
  if (!res.ok) throw new Error("Failed to update admin review");
  return safeJson<{ success: boolean }>(res);
}

export async function toggleReviewHide(
  id: number,
  adminSecret?: string,
): Promise<{ success: boolean }> {
  const headers: Record<string, string> = {};
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/review/${id}/toggle`, {
    method: "POST",
    headers,
  }, 15000);
  if (!res.ok) throw new Error("Failed to toggle review visibility");
  return safeJson<{ success: boolean }>(res);
}

export async function deleteReview(
  id: number,
  adminSecret?: string,
): Promise<{ success: boolean }> {
  const headers: Record<string, string> = {};
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/review/${id}`, {
    method: "DELETE",
    headers,
  }, 15000);
  if (!res.ok) throw new Error("Failed to delete review");
  return safeJson<{ success: boolean }>(res);
}

// ─── Admin: Courses ──────────────────────────────────────────────────────────

export async function fetchAdminCourses(params?: {
  q?: string;
  page?: number;
  limit?: number;
  adminSecret?: string;
}): Promise<AdminPaginatedResponse<AdminCourse>> {
  const qp = new URLSearchParams();
  qp.set("page", String(params?.page ?? 1));
  qp.set("limit", String(params?.limit ?? 20));
  if (params?.q) qp.set("q", params.q);

  const headers: Record<string, string> = {};
  if (params?.adminSecret) headers["x-admin-secret"] = params.adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/courses?${qp}`, { headers }, 15000);
  if (res.status === 401) throw new Error("管理密钥错误");
  if (!res.ok) throw new Error("Failed to fetch admin courses");
  return safeJson<AdminPaginatedResponse<AdminCourse>>(res);
}

export async function createCourse(
  data: AdminCourseCreateData,
  adminSecret?: string,
): Promise<{ success: boolean; id: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/course`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  }, 15000);
  if (!res.ok) throw new Error("Failed to create course");
  return safeJson<{ success: boolean; id: number }>(res);
}

export async function updateCourse(
  id: number,
  data: AdminCourseUpdateData,
  adminSecret?: string,
): Promise<{ success: boolean }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/course/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  }, 15000);
  if (!res.ok) throw new Error("Failed to update course");
  return safeJson<{ success: boolean }>(res);
}

export async function deleteCourse(
  id: number,
  adminSecret?: string,
): Promise<{ success: boolean }> {
  const headers: Record<string, string> = {};
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/course/${id}`, {
    method: "DELETE",
    headers,
  }, 15000);
  if (!res.ok) throw new Error("Failed to delete course");
  return safeJson<{ success: boolean }>(res);
}

// ─── Admin: Settings ─────────────────────────────────────────────────────────

export async function fetchAdminSettings(
  adminSecret?: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/settings`, { headers }, 15000);
  if (res.status === 401) throw new Error("管理密钥错误");
  if (!res.ok) throw new Error("Failed to fetch admin settings");
  return safeJson<Record<string, string>>(res);
}

export async function updateSetting(
  key: string,
  value: string,
  adminSecret?: string,
): Promise<{ success: boolean }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminSecret) headers["x-admin-secret"] = adminSecret;

  const res = await fetchWithTimeout(`${API_BASE}/api/admin/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ value }),
  }, 15000);
  if (!res.ok) throw new Error("Failed to update setting");
  return safeJson<{ success: boolean }>(res);
}

// ─── PK / Campus ─────────────────────────────────────────────────────────────

export async function fetchAllCampus(): Promise<CampusOption[]> {
  const res = await fetchWithTimeout(`${API_BASE}/api/getAllCampus`, undefined, 15000);
  if (!res.ok) throw new Error("Failed to fetch campus data");
  const data = await safeJson<{ data: CampusOption[] }>(res);
  return Array.isArray(data?.data) ? data.data : [];
}
