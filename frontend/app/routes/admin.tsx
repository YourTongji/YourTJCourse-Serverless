import { useCallback, useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import {
  Lock,
  Search,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Plus,
  Settings,
  MessageSquareText,
  GraduationCap,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AdminReview,
  type AdminCourse,
  fetchAdminReviews,
  fetchAdminCourses,
  fetchAdminSettings,
  updateAdminReview,
  toggleReviewHide,
  deleteReview,
  createCourse,
  updateCourse,
  deleteCourse,
  updateSetting,
} from "~/lib/api";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => [
  { title: "管理后台 — YOURTJ选课社区" },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function getStoredSecret(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("adminSecret") ?? "";
}

function setStoredSecret(secret: string) {
  sessionStorage.setItem("adminSecret", secret);
}

function clearStoredSecret() {
  sessionStorage.removeItem("adminSecret");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string | null | undefined, maxLen: number): string {
  if (!str) return "—";
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

function formatDate(ts: string | number): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableReview {
  id: number;
  rating: number;
  comment: string;
  reviewer_name: string;
  reviewer_avatar: string;
}

interface EditableCourse {
  id: number;
  code: string;
  name: string;
  credit: number;
  department: string;
  teacher_name: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Admin() {
  const [secret, setSecret] = useState<string>(getStoredSecret);
  const [secretInput, setSecretInput] = useState("");
  const [secretError, setSecretError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState("reviews");

  const isAuthed = secret.length > 0;

  // ─── Auth handlers ────────────────────────────────────────────────────────

  const handleVerify = useCallback(async () => {
    if (!secretInput.trim()) {
      setSecretError("请输入管理密钥");
      return;
    }
    setVerifying(true);
    setSecretError("");

    try {
      // Verify by attempting to fetch settings — if 401, secret is wrong
      await fetchAdminSettings(secretInput.trim());
      const token = secretInput.trim();
      setStoredSecret(token);
      setSecret(token);
      setSecretInput("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "验证失败";
      setSecretError(msg === "管理密钥错误" ? "密钥错误" : msg);
    } finally {
      setVerifying(false);
    }
  }, [secretInput]);

  const handleLogout = useCallback(() => {
    clearStoredSecret();
    setSecret("");
    setSecretInput("");
    setSecretError("");
  }, []);

  // ─── Data state (page/search for query keys) ──────────────────────────────

  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsSearch, setReviewsSearch] = useState("");
  const [coursesPage, setCoursesPage] = useState(1);
  const [coursesSearch, setCoursesSearch] = useState("");

  // ─── Queries ──────────────────────────────────────────────────────────────

  const {
    data: reviewsData,
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useQuery({
    queryKey: ["admin", "reviews", reviewsPage, reviewsSearch, secret],
    queryFn: () =>
      fetchAdminReviews({
        q: reviewsSearch || undefined,
        page: reviewsPage,
        limit: PAGE_SIZE,
        adminSecret: secret,
      }),
    enabled: isAuthed && activeTab === "reviews",
    staleTime: 15_000,
  });

  const {
    data: coursesData,
    isLoading: coursesLoading,
    error: coursesError,
  } = useQuery({
    queryKey: ["admin", "courses", coursesPage, coursesSearch, secret],
    queryFn: () =>
      fetchAdminCourses({
        q: coursesSearch || undefined,
        page: coursesPage,
        limit: PAGE_SIZE,
        adminSecret: secret,
      }),
    enabled: isAuthed && activeTab === "courses",
    staleTime: 15_000,
  });

  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useQuery({
    queryKey: ["admin", "settings", secret],
    queryFn: () => fetchAdminSettings(secret),
  });

  // ─── 401 detection — clear secret if any query returns auth error ─────────

  useEffect(() => {
    const keyError = "管理密钥错误";
    if (
      (reviewsError instanceof Error && reviewsError.message === keyError) ||
      (coursesError instanceof Error && coursesError.message === keyError) ||
      (settingsError instanceof Error && settingsError.message === keyError)
    ) {
      clearStoredSecret();
      setSecret("");
    }
  }, [reviewsError, coursesError, settingsError]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const reviews = reviewsData?.data ?? [];
  const reviewsTotal = reviewsData?.total ?? 0;
  const courses = coursesData?.data ?? [];
  const coursesTotal = coursesData?.total ?? 0;

  const totalPages = (tab: string) => {
    const total = tab === "reviews" ? reviewsTotal : coursesTotal;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  };

  const tp = totalPages(activeTab);

  // ─── Render error message for query errors ────────────────────────────────

  const reviewsErrorMessage =
    reviewsError instanceof Error ? reviewsError.message : "";
  const coursesErrorMessage =
    coursesError instanceof Error ? coursesError.message : "";
  const settingsErrorMessage =
    settingsError instanceof Error ? settingsError.message : "";

  // ─── Auth gate ────────────────────────────────────────────────────────────

  if (!isAuthed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Lock className="size-5 text-primary" />
            </div>
            <CardTitle>管理员验证</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-secret">管理密钥</Label>
              <Input
                id="admin-secret"
                type="password"
                placeholder="请输入管理密钥"
                value={secretInput}
                onChange={(e) => {
                  setSecretInput(e.target.value);
                  setSecretError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleVerify();
                }}
              />
              {secretError && (
                <p className="text-xs text-destructive">{secretError}</p>
              )}
            </div>
            <Button
              className="w-full"
              onClick={handleVerify}
              disabled={verifying}
            >
              {verifying && <Loader2 className="mr-2 size-4 animate-spin" />}
              验证
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main layout ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          管理后台
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">已认证</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            退出
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="reviews">
            <MessageSquareText className="mr-1.5 size-4" />
            评价管理
          </TabsTrigger>
          <TabsTrigger value="courses">
            <GraduationCap className="mr-1.5 size-4" />
            课程管理
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-1.5 size-4" />
            站点设置
          </TabsTrigger>
        </TabsList>

        {/* ── Reviews Tab ────────────────────────────────────────────────── */}
        <TabsContent value="reviews">
          <ReviewTab
            reviews={reviews}
            loading={reviewsLoading}
            error={reviewsErrorMessage}
            search={reviewsSearch}
            onSearchChange={setReviewsSearch}
            page={reviewsPage}
            totalPages={tp}
            onPageChange={setReviewsPage}
            secret={secret}
          />
        </TabsContent>

        {/* ── Courses Tab ────────────────────────────────────────────────── */}
        <TabsContent value="courses">
          <CourseTab
            courses={courses}
            loading={coursesLoading}
            error={coursesErrorMessage}
            search={coursesSearch}
            onSearchChange={setCoursesSearch}
            page={coursesPage}
            totalPages={tp}
            onPageChange={setCoursesPage}
            secret={secret}
          />
        </TabsContent>

        {/* ── Settings Tab ───────────────────────────────────────────────── */}
        <TabsContent value="settings">
          <SettingsTab
            settings={settings ?? {}}
            loading={settingsLoading}
            error={settingsErrorMessage}
            secret={secret}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Review Tab ─────────────────────────────────────────────────────────────────

function ReviewTab({
  reviews,
  loading,
  error,
  search,
  onSearchChange,
  page,
  totalPages,
  onPageChange,
  secret,
}: {
  reviews: AdminReview[];
  loading: boolean;
  error: string;
  search: string;
  onSearchChange: (s: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  secret: string;
}) {
  const queryClient = useQueryClient();

  const [editingReview, setEditingReview] = useState<EditableReview | null>(
    null,
  );
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ─── Mutations ───────────────────────────────────────────────────────────

  const editMutation = useMutation({
    mutationFn: (data: EditableReview) =>
      updateAdminReview(data.id, {
        rating: data.rating,
        comment: data.comment,
        reviewer_name: data.reviewer_name,
        reviewer_avatar: data.reviewer_avatar,
      }, secret),
    onSuccess: () => {
      setEditDialogOpen(false);
      setEditingReview(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => toggleReviewHide(id, secret),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteReview(id, secret),
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleEdit = (review: AdminReview) => {
    setEditingReview({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      reviewer_name: review.reviewer_name ?? "",
      reviewer_avatar: review.reviewer_avatar ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingReview) return;
    editMutation.mutate(editingReview);
  };

  const handleToggleHide = (review: AdminReview) => {
    toggleMutation.mutate(review.id);
  };

  const handleDelete = () => {
    if (deletingId === null) return;
    deleteMutation.mutate(deletingId);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="搜索评价 (课程名 / 评论内容 / 评价者)..."
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
            onPageChange(1);
          }}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["admin", "reviews"],
                  })
                }
              >
                重试
              </Button>
            </div>
          ) : reviews.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              暂无评价数据
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">SQID</TableHead>
                  <TableHead>课程</TableHead>
                  <TableHead className="w-[60px]">评分</TableHead>
                  <TableHead className="max-w-[200px]">评论</TableHead>
                  <TableHead>评价者</TableHead>
                  <TableHead className="w-[70px]">隐藏</TableHead>
                  <TableHead className="w-[90px]">创建时间</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {truncate(r.sqid, 8)}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {r.course_name || `#${r.course_id}`}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.rating >= 4
                            ? "default"
                            : r.rating >= 2
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {r.rating}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {truncate(r.comment, 40)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.reviewer_name || "—"}
                    </TableCell>
                    <TableCell>
                      {r.is_hidden ? (
                        <Badge variant="destructive">已藏</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          可见
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleEdit(r)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleToggleHide(r)}
                        >
                          {r.is_hidden ? (
                            <Eye className="size-3" />
                          ) : (
                            <EyeOff className="size-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeletingId(r.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {reviews.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            第 {page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Review Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑评价</DialogTitle>
            <DialogDescription>修改评价内容和评分</DialogDescription>
          </DialogHeader>
          {editingReview && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rating">评分 (1-5)</Label>
                <Input
                  id="edit-rating"
                  type="number"
                  min={1}
                  max={5}
                  value={editingReview.rating}
                  onChange={(e) =>
                    setEditingReview({
                      ...editingReview,
                      rating: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reviewer">评价者</Label>
                <Input
                  id="edit-reviewer"
                  value={editingReview.reviewer_name}
                  onChange={(e) =>
                    setEditingReview({
                      ...editingReview,
                      reviewer_name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-comment">评论内容</Label>
                <Textarea
                  id="edit-comment"
                  rows={4}
                  value={editingReview.comment}
                  onChange={(e) =>
                    setEditingReview({
                      ...editingReview,
                      comment: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={editMutation.isPending} />
              }
            >
              取消
            </DialogClose>
            <Button onClick={handleSaveEdit} disabled={editMutation.isPending}>
              {editMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              此操作不可撤销。确定要删除该评价吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={deleteMutation.isPending} />
              }
            >
              取消
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Course Tab ─────────────────────────────────────────────────────────────────

function CourseTab({
  courses,
  loading,
  error,
  search,
  onSearchChange,
  page,
  totalPages,
  onPageChange,
  secret,
}: {
  courses: AdminCourse[];
  loading: boolean;
  error: string;
  search: string;
  onSearchChange: (s: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  secret: string;
}) {
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({
    code: "",
    name: "",
    credit: 0,
    department: "",
    teacher_name: "",
  });

  const [editingCourse, setEditingCourse] = useState<EditableCourse | null>(
    null,
  );
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ─── Mutations ───────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () =>
      createCourse(
        {
          code: newCourse.code,
          name: newCourse.name,
          credit: newCourse.credit || undefined,
          department: newCourse.department || undefined,
          teacher_name: newCourse.teacher_name || undefined,
        },
        secret,
      ),
    onSuccess: () => {
      setCreateDialogOpen(false);
      setNewCourse({
        code: "",
        name: "",
        credit: 0,
        department: "",
        teacher_name: "",
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: EditableCourse) =>
      updateCourse(data.id, {
        code: data.code,
        name: data.name,
        credit: data.credit,
        department: data.department,
        teacher_name: data.teacher_name,
      }, secret),
    onSuccess: () => {
      setEditDialogOpen(false);
      setEditingCourse(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCourse(id, secret),
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleCreate = () => {
    if (!newCourse.code.trim() || !newCourse.name.trim()) return;
    createMutation.mutate();
  };

  const handleEdit = (course: AdminCourse) => {
    setEditingCourse({
      id: course.id,
      code: course.code,
      name: course.name,
      credit: course.credit ?? 0,
      department: course.department ?? "",
      teacher_name: course.teacher_name ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingCourse) return;
    editMutation.mutate(editingCourse);
  };

  const handleDelete = () => {
    if (deletingId === null) return;
    deleteMutation.mutate(deletingId);
  };

  return (
    <div className="space-y-4">
      {/* Search + Create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索课程 (代码 / 名称 / 教师)..."
            value={search}
            onChange={(e) => {
              onSearchChange(e.target.value);
              onPageChange(1);
            }}
          />
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          添加课程
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["admin", "courses"],
                  })
                }
              >
                重试
              </Button>
            </div>
          ) : courses.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              暂无课程数据
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">代码</TableHead>
                  <TableHead>课程名称</TableHead>
                  <TableHead>院系</TableHead>
                  <TableHead className="w-[60px]">学分</TableHead>
                  <TableHead>教师</TableHead>
                  <TableHead className="w-[80px]">评价数</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      {c.code}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {c.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.department || "—"}
                    </TableCell>
                    <TableCell>{c.credit ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.teacher_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.review_count ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleEdit(c)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeletingId(c.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {courses.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            第 {page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Course Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加课程</DialogTitle>
            <DialogDescription>填写课程基本信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-code">课程代码 *</Label>
              <Input
                id="new-code"
                placeholder="例如: COMP1001"
                value={newCourse.code}
                onChange={(e) =>
                  setNewCourse({ ...newCourse, code: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">课程名称 *</Label>
              <Input
                id="new-name"
                placeholder="例如: 计算机科学导论"
                value={newCourse.name}
                onChange={(e) =>
                  setNewCourse({ ...newCourse, name: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-credit">学分</Label>
                <Input
                  id="new-credit"
                  type="number"
                  min={0}
                  value={newCourse.credit || ""}
                  onChange={(e) =>
                    setNewCourse({
                      ...newCourse,
                      credit: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-department">院系</Label>
                <Input
                  id="new-department"
                  placeholder="例如: 计算机系"
                  value={newCourse.department}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, department: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-teacher">授课教师</Label>
              <Input
                id="new-teacher"
                placeholder="教师姓名"
                value={newCourse.teacher_name}
                onChange={(e) =>
                  setNewCourse({ ...newCourse, teacher_name: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  variant="outline"
                  disabled={createMutation.isPending}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                !newCourse.code.trim() ||
                !newCourse.name.trim()
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑课程</DialogTitle>
            <DialogDescription>修改课程信息</DialogDescription>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-course-code">课程代码</Label>
                <Input
                  id="edit-course-code"
                  value={editingCourse.code}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, code: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-course-name">课程名称</Label>
                <Input
                  id="edit-course-name"
                  value={editingCourse.name}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-course-credit">学分</Label>
                  <Input
                    id="edit-course-credit"
                    type="number"
                    min={0}
                    value={editingCourse.credit || ""}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        credit: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-course-dept">院系</Label>
                  <Input
                    id="edit-course-dept"
                    value={editingCourse.department}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        department: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-course-teacher">授课教师</Label>
                <Input
                  id="edit-course-teacher"
                  value={editingCourse.teacher_name}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      teacher_name: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  variant="outline"
                  disabled={editMutation.isPending}
                />
              }
            >
              取消
            </DialogClose>
            <Button onClick={handleSaveEdit} disabled={editMutation.isPending}>
              {editMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              此操作不可撤销。确定要删除该课程吗？（关联评价也会被删除）
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  variant="outline"
                  disabled={deleteMutation.isPending}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────────────────────────

function SettingsTab({
  settings,
  loading,
  error,
  secret,
}: {
  settings: Record<string, string>;
  loading: boolean;
  error: string;
  secret: string;
}) {
  const queryClient = useQueryClient();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // ─── Mutation ────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateSetting(key, value, secret),
    onSuccess: () => {
      setEditingKey(null);
      setEditValue("");
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleStartEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditValue(value);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const handleSaveSetting = () => {
    if (!editingKey) return;
    saveMutation.mutate({ key: editingKey, value: editValue });
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["admin", "settings"],
                })
              }
            >
              重试
            </Button>
          </CardContent>
        </Card>
      ) : Object.keys(settings).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Settings className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              暂无站点设置数据
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["admin", "settings"],
                })
              }
            >
              刷新
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {Object.entries(settings).map(([key, value]) => (
            <Card key={key}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label className="text-xs font-mono text-muted-foreground">
                      {key}
                    </Label>
                    {editingKey === key ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={value.includes("\n") ? 3 : 1}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={handleSaveSetting}
                            disabled={saveMutation.isPending}
                          >
                            {saveMutation.isPending && (
                              <Loader2 className="mr-1.5 size-3 animate-spin" />
                            )}
                            保存
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEdit}
                            disabled={saveMutation.isPending}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <p
                          className={cn(
                            "flex-1 text-sm whitespace-pre-wrap break-words",
                            value.length > 100
                              ? ""
                              : "text-foreground",
                          )}
                        >
                          {value || (
                            <span className="italic text-muted-foreground">
                              (空)
                            </span>
                          )}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0"
                          onClick={() => handleStartEdit(key, value)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
