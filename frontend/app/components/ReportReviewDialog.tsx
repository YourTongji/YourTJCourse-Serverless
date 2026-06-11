import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "~/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import { getClientId } from "~/lib/clientId";
import { reportReview } from "~/lib/api";
import { Flag } from "lucide-react";

const REPORT_REASONS = [
  { value: "spam", label: "垃圾广告" },
  { value: "misleading", label: "误导信息" },
  { value: "harassment", label: "人身攻击" },
  { value: "low_quality", label: "质量过低" },
  { value: "other", label: "其他" },
];

interface ReportReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewId: number;
}

export default function ReportReviewDialog({ open, onOpenChange, reviewId }: ReportReviewDialogProps) {
  const [reason, setReason] = useState("spam");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const finalReason = reason === "other" ? customReason || "other" : reason;
      await reportReview(reviewId, getClientId(), finalReason);
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
        setReason("spam");
        setCustomReason("");
      }, 1500);
    } catch {
      setError("举报失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setError("");
      setSuccess(false);
      setReason("spam");
      setCustomReason("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="size-4" />
            举报评价
          </DialogTitle>
          <DialogDescription>请选择举报原因，我们会尽快处理</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center text-sm font-medium text-green-600">
            举报已提交，感谢你的反馈！
          </div>
        ) : (
          <>
            <RadioGroup value={reason} onValueChange={setReason}>
              {REPORT_REASONS.map((r) => (
                <div key={r.value} className="flex items-center gap-3">
                  <RadioGroupItem value={r.value} id={`report-${r.value}`} />
                  <Label htmlFor={`report-${r.value}`}>{r.label}</Label>
                </div>
              ))}
            </RadioGroup>

            {reason === "other" && (
              <Textarea
                placeholder="请描述举报原因..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={3}
              />
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "提交中..." : "提交举报"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
