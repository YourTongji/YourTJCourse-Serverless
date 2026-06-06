import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSubmit,
  Link,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Star, ArrowLeft, Loader2 } from "lucide-react";
import { Turnstile } from "react-turnstile";

import { reviewSchema } from "~/lib/schemas";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";

/* ─── Types ─── */

interface CourseInfo {
  id: number;
  code: string;
  name: string;
  department: string;
}

/* ─── Form Schema ─── */

const formSchema = z.object({
  rating: z.number().min(1, "请选择评分").max(5),
  comment: z.string().min(1, "评价内容不能为空").max(5000),
  semester: z.string().min(1, "请选择学期"),
  reviewer_name: z.string().optional(),
  turnstile_token: z.string().min(1, "请完成人机验证"),
});

type FormValues = z.infer<typeof formSchema>;

/* ─── Semester Options ─── */

const SEMESTERS = [
  "2025-2026-1",
  "2025-2026-2",
  "2024-2025-1",
  "2024-2025-2",
  "2023-2024-1",
  "2023-2024-2",
  "2022-2023-1",
  "2022-2023-2",
  "2021-2022-1",
  "2021-2022-2",
  "2020-2021-1",
  "2020-2021-2",
];

/* ─── Loader ─── */

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) throw new Response("Not Found", { status: 404 });

  const apiUrl = new URL(`/api/course/${id}`, request.url);
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Response("Course not found", { status: 404 });

  const course: CourseInfo = await res.json();
  return course;
}

/* ─── Action ─── */

export async function action({ request, params }: ActionFunctionArgs) {
  const courseId = Number(params.id);
  if (!courseId) throw new Response("Not Found", { status: 404 });

  const formData = await request.formData();
  const raw = Object.fromEntries(formData);

  // Validate form data with Zod
  const result = reviewSchema.safeParse({
    course_id: courseId,
    rating: Number(raw.rating),
    comment: raw.comment,
    semester: raw.semester,
    reviewer_name: raw.reviewer_name || undefined,
  });

  if (!result.success) {
    const firstError = result.error.issues[0];
    return { error: firstError?.message || "表单数据无效" };
  }

  // Check Turnstile token
  const turnstile_token = raw.turnstile_token as string;
  if (!turnstile_token) {
    return { error: "请完成人机验证" };
  }

  const apiUrl = new URL("/api/review", request.url);
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...result.data, turnstile_token }),
  });

  if (!res.ok) {
    const errBody: unknown = await res.json().catch(() => ({}));
    const err = errBody as Record<string, unknown>;
    return { error: String(err.error ?? err.message ?? "提交失败，请稍后重试") };
  }

  throw redirect(`/course/${courseId}`);
}

/* ─── Component ─── */

export default function WriteReview() {
  const course = useLoaderData<typeof loader>();
  const actionData = useActionData() as { error?: string } | undefined;
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      rating: 0,
      comment: "",
      semester: "",
      reviewer_name: "",
      turnstile_token: "",
    },
  });

  const onValid = (data: FormValues) => {
    submit(data, { method: "post" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        to={`/course/${course.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        返回课程详情
      </Link>

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200">
            {course.code}
          </Badge>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-800">
          撰写评价
        </h1>
        <p className="text-sm text-muted-foreground">{course.name}</p>
      </div>

      <Separator />

      {/* Error display */}
      {actionData?.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionData.error}
        </div>
      )}

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onValid)} className="space-y-6">
          {/* Rating */}
          <FormField
            control={form.control}
            name="rating"
            render={({ field }) => (
              <FormItem>
                <FormLabel>评分</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => field.onChange(star)}
                        className="transition-colors hover:scale-110 cursor-pointer"
                        aria-label={`${star} 星`}
                      >
                        <Star
                          className={cn(
                            "size-7 transition-all",
                            star <= field.value
                              ? "fill-amber-400 text-amber-400 drop-shadow-sm"
                              : "fill-transparent text-muted-foreground/30"
                          )}
                        />
                      </button>
                    ))}
                    {field.value > 0 && (
                      <span className="ml-2 text-sm font-medium text-amber-600">
                        {field.value} 分
                      </span>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Comment */}
          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>评价内容</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="分享你的课程体验..."
                    className="min-h-32 resize-y"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Semester */}
          <FormField
            control={form.control}
            name="semester"
            render={({ field }) => (
              <FormItem>
                <FormLabel>学期</FormLabel>
                <FormControl>
                  <select
                    className={cn(
                      "flex h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                      !field.value && "text-muted-foreground"
                    )}
                    {...field}
                  >
                    <option value="" disabled>
                      请选择学期
                    </option>
                    {SEMESTERS.map((sem) => (
                      <option key={sem} value={sem}>
                        {sem}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Reviewer Name (optional) */}
          <FormField
            control={form.control}
            name="reviewer_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  昵称{" "}
                  <span className="text-muted-foreground font-normal">
                    (选填)
                  </span>
                </FormLabel>
                <FormControl>
                  <input
                    className="flex h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="匿名"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Turnstile */}
          <FormField
            control={form.control}
            name="turnstile_token"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Turnstile
                    sitekey="1x00000000000000000000AA"
                    onVerify={(token) => {
                      field.onChange(token);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {isSubmitting ? "提交中..." : "提交评价"}
            </Button>
            <Button
              type="button"
              variant="outline"
              render={<Link to={`/course/${course.id}`} />}
            >
              取消
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
