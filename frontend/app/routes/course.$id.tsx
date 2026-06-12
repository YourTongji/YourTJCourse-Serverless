import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useLoaderData,
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
  useNavigate,
} from "react-router";
import {
  Star,
  Heart,
  User,
  BookOpen,
  ChevronDown,
  Archive,
  Flag,
  Share2,
  Pencil,
} from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Skeleton } from "~/components/ui/skeleton";
import { Separator } from "~/components/ui/separator";
import { getClientId } from "~/lib/clientId";
import { loadCreditWallet, computeReviewEditToken } from "~/lib/creditWallet";
import CollapsibleMarkdown from "~/components/CollapsibleMarkdown";
import { formatSemesterLabel, formatRating } from "~/lib/format";
import RelatedCourses from "~/components/RelatedCourses";
import AISummaryCard from "~/components/AISummaryCard";
import SharePreviewModal from "~/components/SharePreviewModal";
import ReportReviewDialog from "~/components/ReportReviewDialog";

/* ─── Types ─── */

interface Review {
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
  can_edit?: boolean;
}

interface CourseDetail {
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

/* ─── Meta ─── */

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "课程详情 - YOURTJ选课社区" }];
  }
  return [
    { title: `${data.name} (${data.code}) - YOURTJ选课社区` },
    {
      name: "description",
      content: `${data.name} - ${data.teacher_name} · 评分 ${data.review_avg} · ${data.review_count} 条评价`,
    },
  ];
};

/* ─── Loader ─── */

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) throw new Response("Not Found", { status: 404 });

  const apiUrl = new URL(`/api/course/${id}`, request.url);

  // Forward clientId from request URL if present (user navigated with clientId in URL)
  const reqUrl = new URL(request.url);
  const clientId = reqUrl.searchParams.get("clientId");
  if (clientId) apiUrl.searchParams.set("clientId", clientId);
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Response("Course not found", { status: 404 });

  return res.json() as Promise<CourseDetail>;
}

/* ─── Helpers ─── */


function RatingStars({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "md";
}) {
  const starClass = size === "md" ? "size-4" : "size-3.5";
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`${starClass} ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

const AVATAR_COLORS = [
  "bg-red-400",
  "bg-emerald-400",
  "bg-sky-400",
  "bg-teal-400",
  "bg-amber-400",
  "bg-violet-400",
  "bg-rose-400",
  "bg-cyan-400",
];

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

function getInitial(name: string): string {
  return (name || "匿").charAt(0);
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

/* ─── Review Card ─── */

function ReviewCard({
  review,
  onShare,
  onReport,
  onEdit,
}: {
  review: Review;
  onShare: (review: Review) => void;
  onReport: (review: Review) => void;
  onEdit: (review: Review) => void;
}) {
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(review.liked);
  const [likeCount, setLikeCount] = useState(review.like_count);

  const likeMutation = useMutation({
    mutationFn: async ({ liked: wasLiked }: { liked: boolean }) => {
      const clientId = getClientId();
      const res = await fetch(`/api/review/${review.id}/like`, {
        method: wasLiked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error("Failed to toggle like");
      return res.json();
    },
    onMutate: async ({ liked: wasLiked }) => {
      await queryClient.cancelQueries({ queryKey: ["course"] });
      setLiked((prev) => !prev);
      setLikeCount((c) => (wasLiked ? c - 1 : c + 1));
    },
    onError: (_err, { liked: wasLiked }) => {
      setLiked(wasLiked);
      setLikeCount((c) => (wasLiked ? c + 1 : c - 1));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["course"] });
    },
  });

  const displayName = review.reviewer_name || "匿名";
  const semesterLabel = formatSemesterLabel(review.semester);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header: Avatar + Name + Semester + SQID */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback className={getAvatarColor(review.id)}>
                <span className="text-xs font-medium text-white">
                  {getInitial(review.reviewer_name)}
                </span>
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium leading-tight">{displayName}</p>
              <span className="text-[11px] text-muted-foreground">
                {semesterLabel} · {formatDate(review.created_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {semesterLabel}
            </Badge>
            <span className="text-[10px] font-mono text-muted-foreground/50">
              {review.sqid}
            </span>
          </div>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2">
          <RatingStars rating={review.rating} />
          <span className="text-xs font-medium text-amber-600">
            {formatRating(review.rating)}
          </span>
        </div>

        {/* Comment — Markdown rendered, collapsible */}
        <CollapsibleMarkdown content={review.comment} maxLength={300} />

        {/* Actions */}
        <div className="flex items-center justify-end gap-1 pt-1 flex-wrap">
          {/* Like */}
          <Button
            variant="ghost"
            size="xs"
            className={`gap-1 text-xs h-6 px-2 ${
              liked
                ? "text-red-500 hover:text-red-600"
                : "text-muted-foreground"
            }`}
            onClick={() => likeMutation.mutate({ liked })}
            disabled={likeMutation.isPending}
          >
            <Heart
              className={`size-3.5 ${liked ? "fill-red-500 text-red-500" : ""}`}
            />
            {likeCount > 0 && <span>{likeCount}</span>}
          </Button>

          {/* Share */}
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 text-xs h-6 px-2 text-muted-foreground"
            onClick={() => onShare(review)}
          >
            <Share2 className="size-3.5" />
            分享
          </Button>

          {/* Edit (only for wallet-bound reviews) */}
          {review.can_edit && (
            <Button
              variant="ghost"
              size="xs"
              className="gap-1 text-xs h-6 px-2 text-muted-foreground"
              onClick={() => onEdit(review)}
            >
              <Pencil className="size-3.5" />
              编辑
            </Button>
          )}

          {/* Report */}
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 text-xs h-6 px-2 text-muted-foreground"
            onClick={() => onReport(review)}
          >
            <Flag className="size-3.5" />
            举报
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Loading Skeleton ─── */

function CourseDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
      {/* Left skeleton */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
            <Separator />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>

      {/* Right skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


/* ─── Main Page ─── */

export default function CourseDetail() {
  const initialCourse = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [shareReview, setShareReview] = useState<Review | null>(null);

  // Refetch course data with clientId after SSR hydration to get personalized fields (liked, can_edit)
  // Also sends editReviewProofs from wallet so the backend can determine can_edit
  const { data: course } = useQuery({
    queryKey: ["course", initialCourse.id] as const,
    queryFn: async () => {
      const cid = getClientId();
      if (cid === "ssr") {
        const res = await fetch(`/api/course/${initialCourse.id}`);
        if (!res.ok) throw new Response("Course not found", { status: 404 });
        return res.json() as Promise<CourseDetail>;
      }
      const wallet = loadCreditWallet();
      const params = new URLSearchParams({ clientId: cid });
      const proofTargets = initialCourse.reviews.filter(r => r.can_edit);
      if (wallet?.userSecret && proofTargets.length > 0) {
        const proofs = await Promise.all(
          proofTargets.map(r => computeReviewEditToken(wallet.userSecret, r.id))
        );
        const proofParam = proofTargets.map((r, i) => `${r.id}:${proofs[i]}`).join(",");
        if (proofParam) params.set("editReviewProofs", proofParam);
      }
      const res = await fetch(`/api/course/${initialCourse.id}?${params.toString()}`);
      if (!res.ok) throw new Response("Course not found", { status: 404 });
      return res.json() as Promise<CourseDetail>;
    },
    initialData: initialCourse,
    staleTime: 0,
    gcTime: 30_000,
  });

  const [reportReviewId, setReportReviewId] = useState<number | null>(null);


  if (!course) {
    return <CourseDetailSkeleton />;
  }

  const INITIAL_REVIEW_COUNT = 5;
  const visibleReviews = showAllReviews
    ? course.reviews
    : course.reviews.slice(0, INITIAL_REVIEW_COUNT);
  const hasMoreReviews = course.reviews.length > INITIAL_REVIEW_COUNT;

  return (
    <>
      <div className="mb-4">
        <Link
          to="/courses"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-cyan-600 transition-colors"
        >
          <Archive className="size-4" />
          返回课程列表
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
        {/* ─── Left Panel ─── */}
        <div className="space-y-4">
          {/* Course Info Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100">
                {course.code}
              </Badge>

              <h1 className="text-xl font-bold tracking-tight text-slate-800">
                {course.name}
              </h1>

              {course.department && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BookOpen className="size-3.5 shrink-0" />
                  <span>{course.department}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="size-3.5 shrink-0" />
                <span>{course.teacher_name}</span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <RatingStars rating={Math.round(course.review_avg)} size="md" />
                <span className="font-medium text-amber-600">
                  {formatRating(course.review_avg)}
                </span>
                <span className="text-muted-foreground">
                  ({course.review_count} 条评价)
                </span>
              </div>

              {/* Semester badges */}
              {Array.isArray(course.semesters) && course.semesters.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {course.semesters.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="text-[10px] h-5"
                    >
                      {formatSemesterLabel(s)}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpen className="size-3.5 shrink-0" />
                <span>{course.credit} 学分</span>
              </div>

              <Separator />

              <Button
                className="w-full gap-2"
                render={<Link to={`/course/${course.id}/write`} />}
                nativeButton={false}
              >
                <Star className="size-4" />
                撰写评价
              </Button>

            </CardContent>
          </Card>

          {/* AI Summary Card */}
          <AISummaryCard courseId={course.id} />

          {/* Related Courses Sidebar */}
          <RelatedCourses courseId={course.id} />
        </div>

        {/* ─── Right Panel: Reviews ─── */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-700">
            课程评价
            {course.review_count > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal">
                ({course.review_count})
              </span>
            )}
          </h2>

          {course.reviews.length === 0 ? (
            /* Empty state */
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">暂无评价</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  成为第一个评价该课程的人
                </p>
                <Button
                  className="mt-4 gap-2"
                  size="sm"
                  render={<Link to={`/course/${course.id}/write`} />}
                  nativeButton={false}
                >
                  <Star className="size-3.5" />
                  撰写评价
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-3">
                {visibleReviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    onShare={() => setShareReview(review)}
                    onReport={(review) => setReportReviewId(review.id)}
                    onEdit={(review) => {
                      sessionStorage.setItem(`edit-review-${course.id}`, JSON.stringify(review));
                      navigate(`/course/${course.id}/write?edit=1`, {
                        state: { editReview: review },
                      });
                    }}
                  />
                ))}
              </div>

              {/* TASK: If a course has 200+ reviews and "show all" is clicked,
                   consider virtualizing this list with @tanstack/react-virtual */}

              {hasMoreReviews && !showAllReviews && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => setShowAllReviews(true)}
                  >
                    <ChevronDown className="size-4" />
                    查看更多评价 ({course.reviews.length - INITIAL_REVIEW_COUNT})
                  </Button>
                </div>
              )}

              {showAllReviews &&
                course.reviews.length > INITIAL_REVIEW_COUNT && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => setShowAllReviews(false)}
                    >
                      收起
                    </Button>
                  </div>
                )}
            </>
          )}
        </div>
      </div>

      {/* Share Preview Modal */}
      {shareReview && (
        <SharePreviewModal
          courseName={course.name}
          courseCode={course.code}
          courseReviewAvg={course.review_avg}
          courseReviewCount={course.review_count}
          courseTeacherName={course.teacher_name}
          review={shareReview}
          onClose={() => setShareReview(null)}
        />
      )}
      {/* Report Review Dialog */}
      <ReportReviewDialog
        open={reportReviewId !== null}
        onOpenChange={(open) => { if (!open) setReportReviewId(null); }}
        reviewId={reportReviewId ?? 0}
      />
    </>
  );
}
