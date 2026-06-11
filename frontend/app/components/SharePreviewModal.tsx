import { useState, useRef, useCallback } from "react";
import { toPng, toJpeg } from "html-to-image";
import BoringAvatar from "boring-avatars";
import { renderToStaticMarkup } from "react-dom/server";
import { formatSemesterLabel } from "~/lib/format";
import { renderMarkdownHtml, markdownContentClassName } from "~/components/CollapsibleMarkdown";
import {
  Dialog,
  DialogContent,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

interface Review {
  id: number;
  sqid: string;
  rating: number;
  comment: string;
  semester: string;
  created_at: number;
  reviewer_name: string;
  reviewer_avatar: string;
}

interface SharePreviewModalProps {
  courseName: string;
  courseCode: string;
  courseReviewAvg: number;
  courseReviewCount: number;
  courseTeacherName: string;
  review: Review;
  onClose: () => void;
}

const AVATAR_COLORS = [
  "#0f172a",
  "#38bdf8",
  "#f8fafc",
  "#f59e0b",
  "#22c55e",
];

function buildBeamAvatarDataUri(seedText: string, size = 88): string {
  const svg = renderToStaticMarkup(
    <BoringAvatar
      size={size}
      name={seedText || "匿名用户"}
      variant="beam"
      colors={AVATAR_COLORS}
    />,
  );
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getReviewAvatarUrl(review: Review, size = 88): string {
  const reviewerName = String(review.reviewer_name || "").trim();
  const avatarUrl = String(review.reviewer_avatar || "").trim();
  const isBrokenInlineAvatar =
    avatarUrl.startsWith("data:") && !avatarUrl.includes("</svg");

  if (avatarUrl && !isBrokenInlineAvatar) return avatarUrl;
  if (reviewerName) return buildBeamAvatarDataUri(reviewerName, size);
  return "";
}

async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }
          const timer = window.setTimeout(resolve, 4000);
          image.addEventListener("load", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
          image.addEventListener("error", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        }),
    ),
  );
}

export default function SharePreviewModal({
  courseName,
  courseCode,
  courseReviewAvg,
  courseReviewCount,
  courseTeacherName,
  review,
  onClose,
}: SharePreviewModalProps) {
  const [busySave, setBusySave] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const avatarUrl = getReviewAvatarUrl(review, 88);
  const markdownHtml = renderMarkdownHtml(review.comment);
  const reviewDate = new Date(review.created_at * 1000).toLocaleDateString(
    "zh-CN",
  );
  const displayName = review.reviewer_name || "匿名用户";
  const semesterLabel = formatSemesterLabel(review.semester);

  const handleSave = useCallback(async () => {
    if (!exportRef.current) return;
    setBusySave(true);
    try {
      await waitForImages(exportRef.current);
      let dataUrl = "";
      let extension: "png" | "jpg" = "png";
      try {
        dataUrl = await toPng(exportRef.current, {
          cacheBust: true,
          backgroundColor: "#ffffff",
          pixelRatio: 2.5,
        });
      } catch {
        dataUrl = await toJpeg(exportRef.current, {
          cacheBust: true,
          backgroundColor: "#ffffff",
          pixelRatio: 2.2,
          quality: 0.96,
        });
        extension = "jpg";
      }
      if (!dataUrl) throw new Error("export_failed");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${courseCode || "yourtj"}-${review.sqid || review.id}.${extension}`;
      link.click();
    } catch (error) {
      console.error("Share preview export failed", error);
      window.alert("导出图片失败，请稍后重试。");
    } finally {
      setBusySave(false);
    }
  }, [review, courseCode, exportRef]);

  const renderPaper = (exportMode: boolean) => {
    const paperClassName = exportMode
      ? "yourtj-share-paper w-[760px] overflow-hidden rounded-[26px] bg-white shadow-[0_28px_60px_rgba(14,165,233,0.16)]"
      : "yourtj-share-paper w-full max-w-[760px] overflow-hidden rounded-[26px] bg-white shadow-[0_28px_60px_rgba(14,165,233,0.16)]";

    return (
      <div
        ref={exportMode ? exportRef : undefined}
        className={paperClassName}
      >
        <div className="bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
          {/* Course info + rating box */}
          <div
            className={`grid gap-4 border-b border-slate-100 pb-5 ${exportMode ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]"}`}
          >
            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-[0.18em] text-slate-400">
                YOURTJ 选课社区
              </div>
              <div
                className={`mt-2 font-bold leading-tight text-slate-900 ${exportMode ? "text-[28px]" : "text-[20px] sm:text-[28px]"}`}
              >
                {courseName}
              </div>
              <div className="mt-2 inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                {courseCode}
              </div>
            </div>
            <div
              className={`rounded-3xl bg-white/90 px-4 py-3 text-right shadow-sm ring-1 ring-slate-100 ${exportMode ? "min-w-[150px]" : "min-w-[138px] sm:min-w-[150px]"}`}
            >
              <div className="text-[11px] font-semibold text-slate-400">
                课程评分
              </div>
              <div
                className={`mt-1 font-bold text-amber-500 ${exportMode ? "text-xl" : "text-lg sm:text-xl"}`}
              >
                {courseReviewAvg?.toFixed(1) || "-"} / 5.0
              </div>
              <div className="mt-2 text-[11px] font-semibold text-slate-400">
                评价数量
              </div>
              <div
                className={`mt-1 font-bold text-slate-800 ${exportMode ? "text-lg" : "text-base sm:text-lg"}`}
              >
                {courseReviewCount} 条
              </div>
            </div>
          </div>

          {/* Reviewer info */}
          <div
            className={`mt-5 flex gap-4 ${exportMode ? "items-center justify-between" : "flex-col sm:flex-row sm:items-center sm:justify-between"}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="头像"
                  className={`${exportMode ? "h-14 w-14" : "h-12 w-12 sm:h-14 sm:w-14"} rounded-2xl object-cover ring-1 ring-slate-100`}
                />
              ) : (
                <div
                  className={`${exportMode ? "h-14 w-14" : "h-12 w-12 sm:h-14 sm:w-14"} rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center text-cyan-700 font-bold ring-1 ring-slate-100`}
                >
                  匿
                </div>
              )}
              <div className="min-w-0">
                <div
                  className={`truncate font-bold text-slate-900 ${exportMode ? "text-lg" : "text-base sm:text-lg"}`}
                >
                  {displayName}
                </div>
                <div className="mt-1 text-xs font-medium text-slate-400">
                  {semesterLabel} · {reviewDate}
                </div>
              </div>
            </div>
            <div
              className={`shrink-0 rounded-full bg-amber-50 font-bold text-amber-600 ring-1 ring-amber-100 ${exportMode ? "px-4 py-2 text-sm" : "px-3.5 py-1.5 text-[13px] sm:px-4 sm:py-2 sm:text-sm"}`}
            >
              {Number(review.rating).toFixed(1)} / 5
            </div>
          </div>

          {/* Tags */}
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 ring-1 ring-cyan-100">
              教师：{courseTeacherName || "未知教师"}
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-100">
              学期：{semesterLabel}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
              编号：{review.sqid || review.id}
            </span>
          </div>

          {/* Comment */}
          <div
            className={`mt-6 rounded-[24px] border border-sky-100 bg-white text-slate-700 ${exportMode ? "px-6 py-5 text-[15px] leading-8" : "px-4 py-4 text-[14px] leading-7 sm:px-6 sm:py-5 sm:text-[15px] sm:leading-8"}`}
          >
            <div
              className={markdownContentClassName}
              dangerouslySetInnerHTML={{ __html: markdownHtml }}
            />
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between text-xs font-medium text-slate-400">
            <span>内容来自 YOURTJ 选课社区</span>
            <span>xk.yourtj.de</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-full w-full max-w-[960px] overflow-auto rounded-[32px] bg-white/95 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.32)] sm:max-w-[960px] [&>[data-slot=dialog-overlay]]:bg-slate-950/55 [&>[data-slot=dialog-overlay]]:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 text-center sm:text-left">
            <div className="text-xs font-bold tracking-[0.28em] text-slate-400">
              分享评论预览
            </div>
            <div className="mt-2 flex justify-center sm:justify-start">
              <span className="inline-block whitespace-nowrap bg-gradient-to-r from-sky-400 via-slate-300 to-cyan-500 bg-clip-text text-[11px] font-semibold text-transparent sm:text-xs">
                不记名、自由、简洁、高效的选课社区
              </span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={handleSave}
              disabled={busySave}
            >
              {busySave ? "导出中..." : "保存图片"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
            >
              关闭
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] bg-gradient-to-b from-slate-900 to-slate-700 p-4 shadow-inner">
          <div className="yourtj-printer-bar mx-auto h-4 w-48 rounded-full bg-slate-950/60" />
        </div>

        <div className="yourtj-share-paper-wrapper mt-[-10px] flex justify-center px-0 pb-2 pt-0 sm:px-2">
          {renderPaper(false)}
        </div>

        {/* Hidden export version */}
        <div className="pointer-events-none fixed -left-[10000px] top-0 opacity-0">
          {renderPaper(true)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
