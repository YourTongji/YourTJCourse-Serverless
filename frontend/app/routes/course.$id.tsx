import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useLoaderData,
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "react-router";
import { Star, Heart, User, BookOpen, Sparkles, ChevronDown } from "lucide-react";
import {
  Card,
  CardContent,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Skeleton } from "~/components/ui/skeleton";
import { Separator } from "~/components/ui/separator";
import { getClientId } from "~/lib/clientId";
import { WalletSheet } from "~/lib/credit";

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

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) throw new Response("Not Found", { status: 404 });

  const res = await fetch(`http://127.0.0.1:8787/api/course/${id}`);
  if (!res.ok) throw new Response("Course not found", { status: 404 });

  return res.json() as Promise<CourseDetail>;
}

/* ─── Helpers ─── */

function formatRelativeTime(unix: number): string {
  const now = Date.now();
  const diff = now - unix * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return new Date(unix * 1000).toLocaleDateString("zh-CN");
}

function RatingStars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
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

/* ─── Review Card ─── */

function ReviewCard({ review }: { review: Review }) {
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
                {formatRelativeTime(review.created_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {review.semester}
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
            {review.rating}.0
          </span>
        </div>

        {/* Comment */}
        <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
          {review.comment}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end pt-1">
          <Button
            variant="ghost"
            size="xs"
            className={`gap-1 text-xs h-6 px-2 ${
              liked ? "text-red-500 hover:text-red-600" : "text-muted-foreground"
            }`}
            onClick={() => likeMutation.mutate({ liked })}
            disabled={likeMutation.isPending}
          >
            <Heart
              className={`size-3.5 ${liked ? "fill-red-500 text-red-500" : ""}`}
            />
            {likeCount > 0 && <span>{likeCount}</span>}
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

/* ─── Error State ─── */

function CourseDetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

/* ─── Main Page ─── */

export default function CourseDetail() {
  const course = useLoaderData<typeof loader>();
  const [showAllReviews, setShowAllReviews] = useState(false);

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
                {course.review_avg.toFixed(1)}
              </span>
              <span className="text-muted-foreground">
                ({course.review_count} 条评价)
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="size-3.5 shrink-0" />
              <span>{course.credit} 学分</span>
            </div>

            <Separator />

            <Button
              className="w-full gap-2"
              render={<Link to={`/course/${course.id}/write`} />}
            >
              <Star className="size-4" />
              撰写评价
            </Button>
          </CardContent>
        </Card>

        {/* AI Summary Card Placeholder */}
        <Card>
          <CardContent className="p-4">
            <Button
              variant="outline"
              className="w-full gap-2 text-muted-foreground"
              disabled
            >
              <Sparkles className="size-4 text-cyan-500" />
              AI课程总结
              <Badge
                variant="secondary"
                className="ml-auto text-[10px] h-4 px-1.5"
              >
                即将上线
              </Badge>
            </Button>
          </CardContent>
        </Card>
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
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>

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

            {showAllReviews && course.reviews.length > INITIAL_REVIEW_COUNT && (
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

    {/* Wallet floating button */}
    <div className="fixed bottom-6 right-6 z-40">
      <WalletSheet />
    </div>
    </>
  );
}
