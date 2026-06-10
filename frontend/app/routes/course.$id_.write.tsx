import { useEffect, useMemo, useState } from "react";
import type { MetaFunction } from "react-router";
export const meta: MetaFunction = () => [
  { title: "写评价 — YOURTJ选课社区" },
  { name: "description", content: "撰写课程评价" },
];
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useParams,
  Link,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Turnstile } from "react-turnstile";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

import { Button } from "~/components/ui/button";
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
import MarkdownEditor, {
  type TemplateHints,
} from "~/components/MarkdownEditor";
import MarkdownToolbar from "~/components/MarkdownToolbar";
import TemplateSelector, {
  TEMPLATE_HINTS,
} from "~/components/TemplateSelector";
import ReviewerIdentity, {
  type ReviewerIdentityValue,
} from "~/components/ReviewerIdentity";
import TongjiCaptchaWidget from "~/components/TongjiCaptchaWidget";
import {
  submitReview,
  updateReview,
  patchReviewEditToken,
} from "~/lib/api";
import {
  loadCreditWallet,
  computeReviewEditToken,
} from "~/lib/creditWallet";
import { formatSemesterLabel, semesterLabelScore } from "~/lib/format";

/* ─── Types ─── */

interface CourseInfo {
  id: number;
  code: string;
  name: string;
  department: string;
  semesters?: string[];
}

/* ─── Default Template ─── */

const DEFAULT_TEMPLATE = `## 考核方式：

## 授课质量与给分：

## 上课学期：
`;

const DEFAULT_HINTS: TemplateHints = {
  "## 考核方式：": "描述考试形式、作业要求等",
  "## 授课质量与给分：": "描述老师的教学质量和给分情况",
  "## 上课学期：": "填写你上这门课的学期，如 2024春",
};

/* ─── Form Schema ─── */

const formSchema = z.object({
  rating: z.number().min(1, "请选择评分").max(5),
  semester: z.string().min(1, "请选择学期"),
});

type FormValues = z.infer<typeof formSchema>;

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
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") || "").trim();
  const semester = String(formData.get("semester") || "").trim();
  const turnstile_token = String(formData.get("turnstile_token") || "").trim();
  const captcha_token = String(formData.get("captcha_token") || "").trim();

  if (!comment) return { error: "评价内容不能为空" };
  if (!semester) return { error: "请选择学期" };
  if (!turnstile_token && !captcha_token)
    return { error: "请完成人机验证" };

  const token = turnstile_token || captcha_token;
  const reviewer_name = String(formData.get("reviewer_name") || "").trim();
  const reviewer_avatar = String(formData.get("reviewer_avatar") || "").trim();
  const walletUserHash = String(formData.get("walletUserHash") || "").trim();

  const apiUrl = new URL("/api/review", request.url);
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      course_id: courseId,
      rating,
      comment,
      semester,
      turnstile_token: token,
      reviewer_name: reviewer_name || undefined,
      reviewer_avatar: reviewer_avatar || undefined,
      walletUserHash: walletUserHash || undefined,
    }),
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
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  /* ── Form (react-hook-form for rating + semester) ── */
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { rating: 0, semester: "" },
  });

  /* ── Comment / Editor state ── */
  const [comment, setComment] = useState(DEFAULT_TEMPLATE);
  const [currentHints, setCurrentHints] =
    useState<TemplateHints>(DEFAULT_HINTS);

  /* ── Template selector ── */
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  /* ── Reviewer identity ── */
  const [reviewer, setReviewer] = useState<ReviewerIdentityValue>({
    name: "",
    avatar: "",
    avatarType: "random",
    qqNumber: "",
  });

  /* ── Captcha tokens ── */
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

  /* ── Submission state ── */
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  /* ── Edit mode ── */
  const editReview = (location.state as Record<string, unknown>)
    ?.editReview as Record<string, unknown> | undefined;
  const isEdit =
    Boolean(editReview && editReview.id) &&
    new URLSearchParams(location.search || "").get("edit") === "1";

  const buildCourseRefreshUrl = () =>
    `/course/${id}?reviewRefresh=${Date.now()}`;

  /* ── Semester options ── */
  const semesterValue = form.watch("semester");

  const semesterOptions = useMemo(() => {
    const raw = Array.isArray(course?.semesters)
      ? course?.semesters || []
      : [];
    const unique = Array.from(
      new Set(raw.map((s) => String(s || "").trim()).filter(Boolean)),
    );

    const mapped = unique
      .map((value) => ({ value, label: formatSemesterLabel(value) }))
      .sort(
        (left, right) =>
          semesterLabelScore(right.label) - semesterLabelScore(left.label),
      );

    const result = [...mapped];

    const current = String(semesterValue || "").trim();
    if (
      current &&
      current !== "其他" &&
      !result.some((item) => item.value === current)
    ) {
      result.unshift({ value: current, label: formatSemesterLabel(current) });
    }

    result.push({ value: "其他", label: "其他" });
    return result;
  }, [course?.semesters, semesterValue]);

  /* ── Draft auto-save ── */
  useEffect(() => {
    if (!id || isEdit) return;

    const draftKey = `review_draft_${id}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft) as Record<string, unknown>;
        if (typeof draft.comment === "string") setComment(draft.comment);
        if (typeof draft.rating === "number") form.setValue("rating", draft.rating);
        if (typeof draft.semester === "string") form.setValue("semester", draft.semester);
        if (draft.reviewer) setReviewer(draft.reviewer as ReviewerIdentityValue);
      } catch {
        // Ignore corrupt draft
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  useEffect(() => {
    if (!id || isEdit) return;

    const draftKey = `review_draft_${id}`;
    const timer = setTimeout(() => {
      const draft = {
        comment,
        rating: form.getValues("rating"),
        semester: form.getValues("semester"),
        reviewer,
        timestamp: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 1000);

    return () => clearTimeout(timer);
  }, [id, isEdit, comment, form.watch("rating"), form.watch("semester"), reviewer]);

  /* ── Edit mode pre-fill ── */
  useEffect(() => {
    if (!isEdit || !editReview) return;
    setComment(String(editReview.comment || ""));
    form.setValue("rating", Number(editReview.rating ?? 5));
    form.setValue("semester", String(editReview.semester || "其他") || "其他");
    const rName = String(editReview.reviewer_name || "");
    const rAvatar = String(editReview.reviewer_avatar || "");
    if (rAvatar.includes("qlogo.cn")) {
      const m = rAvatar.match(/nk=(\d+)/);
      setReviewer({
        name: rName,
        avatar: rAvatar,
        avatarType: "qq",
        qqNumber: m?.[1] || "",
      });
    } else if (rName || rAvatar) {
      setReviewer({ name: rName, avatar: rAvatar, avatarType: "random", qqNumber: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  /* ── Template selection ── */
  const handleTemplateSelect = (template: string, templateId?: string) => {
    setComment(template || DEFAULT_TEMPLATE);
    if (templateId && TEMPLATE_HINTS[templateId]) {
      setCurrentHints(TEMPLATE_HINTS[templateId]);
    } else if (!template) {
      setCurrentHints(DEFAULT_HINTS);
    } else {
      setCurrentHints({});
    }
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    const rating = form.getValues("rating");
    const semester = form.getValues("semester");

    if (rating <= 0) {
      setErrorMessage("请选择评分");
      return;
    }
    if (!comment.trim()) {
      setErrorMessage("请填写点评内容");
      return;
    }
    if (!semester) {
      setErrorMessage("请选择学期");
      return;
    }

    const captchaOk = turnstileToken || captchaToken;
    if (!captchaOk) {
      setErrorMessage("请完成人机验证");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const wallet = loadCreditWallet();
      const payload = {
        rating,
        comment,
        semester: String(semester || "").trim() || "其他",
        turnstile_token: turnstileToken || captchaToken,
        reviewer_name: reviewer.name || undefined,
        reviewer_avatar: reviewer.avatar || undefined,
        walletUserHash: wallet?.userHash || "",
      };

      if (isEdit && editReview?.id) {
        const extraPayload: Record<string, string> = {};
        if (wallet?.userSecret && editReview.id) {
          extraPayload.edit_token = await computeReviewEditToken(
            wallet.userSecret,
            Number(editReview.id),
          );
        }
        const res = await updateReview(Number(editReview.id), {
          ...payload,
          ...extraPayload,
        } as Parameters<typeof updateReview>[1]);
        if (res?.success) {
          window.dispatchEvent(
            new CustomEvent("yourtj-tour-review-submitted"),
          );
          if (id) localStorage.removeItem(`review_draft_${id}`);
          navigate(buildCourseRefreshUrl());
        } else {
          setErrorMessage("编辑失败");
        }
      } else {
        const res = await submitReview({
          course_id: Number(id),
          ...payload,
        });
        if (res.success) {
          if (wallet?.userSecret && wallet?.userHash && res.reviewId) {
            const token = await computeReviewEditToken(
              wallet.userSecret,
              res.reviewId,
            );
            const tokenRes = await patchReviewEditToken(res.reviewId, {
              edit_token: token,
              walletUserHash: wallet.userHash,
            });
            const credit = tokenRes?.creditReward as
              | { ok?: boolean; skipped?: boolean; error?: string }
              | undefined;
            if (credit && credit.ok) {
              alert("点评提交成功！评课激励 +10 已发放到积分钱包。");
            } else if (credit && credit.skipped !== true) {
              const reason = credit.error
                ? `（${String(credit.error).slice(0, 120)}）`
                : "";
              alert(`点评提交成功，但评课激励发放失败${reason}`);
            } else {
              alert("点评提交成功！");
            }
          } else {
            alert("点评提交成功！");
          }
          window.dispatchEvent(
            new CustomEvent("yourtj-tour-review-submitted"),
          );
          if (id) localStorage.removeItem(`review_draft_${id}`);
          navigate(buildCourseRefreshUrl());
        } else {
          setErrorMessage("提交失败");
        }
      }
    } catch (e: unknown) {
      const msg = String(
        (e as { message?: string }).message || e || "提交失败",
      );
      setErrorMessage(msg);
      if (msg.includes("人机验证") || msg.toLowerCase().includes("captcha")) {
        setTurnstileToken("");
        setCaptchaToken("");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Wallet ── */
  const wallet = loadCreditWallet();
  const walletBound = !!wallet?.userHash;
  const reviewEligible = String(comment || "").trim().length >= 50;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24 md:pb-6">
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
        {isEdit && (
          <p className="text-sm text-slate-500">
            编辑我的评价（需要完成一次人机验证）
          </p>
        )}
      </div>

      <Separator />

      {/* Error display */}
      {errorMessage && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Credit wallet incentive */}
      <div
        className={`mb-6 p-4 rounded-2xl border ${walletBound ? "bg-emerald-50/70 border-emerald-100" : "bg-amber-50/70 border-amber-100"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700 leading-relaxed">
            {walletBound
              ? reviewEligible
                ? "已绑定积分钱包：本次点评满足 50 字，将自动获得 +10 积分。"
                : "已绑定积分钱包：点评达到 50 字可获得 +10 积分。"
              : "未绑定积分钱包：绑定后 50 字以上点评可立即获得 +10，收到 1 个点赞 +3（每日结算）。"}
          </div>
          {!walletBound && (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                window.dispatchEvent(new Event("open-credit-wallet"))
              }
              className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-extrabold hover:bg-slate-700 h-auto"
            >
              绑定钱包
            </Button>
          )}
        </div>
      </div>

      <Form {...form}>
        <div className="space-y-6">
          {/* Rating */}
          <FormField
            control={form.control}
            name="rating"
            render={({ field }) => (
              <FormItem data-tour="tour-rating-section">
                <FormLabel>评分</FormLabel>
                <FormControl>
                  <div className="p-4 bg-white/60 backdrop-blur rounded-2xl border border-white">
                    {/* Desktop: single row */}
                    <div className="hidden md:flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => field.onChange(star)}
                          className="text-3xl p-1 transition-transform hover:scale-110 active:scale-95"
                          aria-label={`${star} 分`}
                        >
                          <svg
                            className={`w-8 h-8 ${star <= field.value ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        </button>
                      ))}
                      <span className="ml-3 text-sm font-semibold text-slate-600">
                        {field.value > 0 ? `${field.value} 分` : ""}
                      </span>
                    </div>

                    {/* Mobile: two-row centered */}
                    <div className="md:hidden space-y-2">
                      <div className="flex items-center justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => field.onChange(star)}
                            className="p-1 transition-transform active:scale-95"
                            aria-label={`${star} 分`}
                          >
                            <svg
                              className={`w-7 h-7 ${star <= field.value ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          </button>
                        ))}
                      </div>
                      <div className="text-center text-lg font-bold text-slate-700">
                        {field.value > 0 ? `${field.value} 分` : ""}
                      </div>
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Semester */}
          <div data-tour="tour-semester-section">
            <label className="block mb-3 text-sm font-semibold text-slate-600">
              学期
            </label>
            <Select value={semesterValue || ""} onValueChange={(v) => { if (v) form.setValue("semester", v); }}>
              <SelectTrigger className="w-full rounded-2xl border border-white bg-white/60 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur h-auto data-[placeholder]:text-muted-foreground">
                <SelectValue placeholder="选择学期" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-100 bg-white/95 shadow-[0_18px_48px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl z-30">
                {semesterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {opt.value !== "其他" && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          系统
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage>{form.formState.errors.semester?.message}</FormMessage>
          </div>

          {/* Comment / Editor */}
          <div data-tour="tour-editor-section">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-600">
                点评内容{" "}
                <span className="text-slate-400 font-normal text-xs">
                  (支持 Markdown 格式)
                </span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplateSelector(true)}
                className="hidden md:flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg h-auto"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                选择模板
              </Button>
            </div>

            {/* Desktop markdown hints */}
            <div className="hidden md:flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 mb-3 text-[11px] text-slate-500">
              <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">
                **粗体**
              </span>
              <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">
                *斜体*
              </span>
              <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">
                [链接](url)
              </span>
              <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">
                ![图片](url)
              </span>
              <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">
                `代码`
              </span>
              <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">
                ## 标题
              </span>
            </div>

            <MarkdownEditor
              value={comment}
              onChange={setComment}
              placeholder="请按照模板填写课程点评..."
              hints={currentHints}
            />
          </div>

          {/* Reviewer identity */}
          <ReviewerIdentity value={reviewer} onChange={setReviewer} />

          {/* Captcha */}
          <div data-tour="tour-captcha-section">
            <label className="block mb-3 text-sm font-semibold text-slate-600">
              人机验证
            </label>
            <div className="space-y-3">
              <TongjiCaptchaWidget
                value={captchaToken}
                onVerify={setCaptchaToken}
              />
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-xs text-slate-400">或者</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>
              <Turnstile
                sitekey={import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                onVerify={(token) => {
                  setTurnstileToken(token);
                }}
              />
            </div>
          </div>

          {/* Submit button */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="gap-2"
              data-tour="tour-submit-button"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "提交中..." : isEdit ? "保存修改" : "提交评价"}
            </Button>
            <Button
              type="button"
              variant="outline"
              render={<Link to={`/course/${course.id}`} />}
            >
              取消
            </Button>
          </div>
        </div>
      </Form>

      {/* Mobile: bottom toolbar */}
      <div className="md:hidden">
        <MarkdownToolbar
          onInsert={(before, after) => {
            const textarea = document.querySelector(
              "textarea",
            ) as HTMLTextAreaElement | null;
            if (!textarea) return;

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = comment.substring(start, end);
            const newText =
              comment.substring(0, start) +
              before +
              selectedText +
              (after || "") +
              comment.substring(end);

            setComment(newText);

            setTimeout(() => {
              textarea.focus();
              const newCursorPos = start + before.length + selectedText.length;
              textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
          }}
          onShowMore={() => setShowTemplateSelector(true)}
        />
      </div>

      {/* Template selector */}
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}
