import { useEffect, useState, useCallback } from "react";
import { useTourStore } from "~/lib/stores";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import { HelpCircle, ChevronLeft, ChevronRight } from "lucide-react";

// ─── Tour Steps ──────────────────────────────────────────────────────────────

interface TourStep {
  title: string;
  description: string;
  targetSelector?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "欢迎来到 YOURTJ",
    description:
      "YOURTJ 选课社区是一个不记名、自由、简洁、高效的选课交流平台。花一分钟快速了解主要功能吧！",
  },
  {
    title: "搜索与课程列表",
    description:
      "在课程目录页面，你可以搜索并浏览所有课程。每门课程显示评分、点评数量等关键信息。",
    targetSelector: '[data-tour="tour-course-list"]',
  },
  {
    title: "筛选课程",
    description:
      "使用筛选功能，按学院、是否已有评价等条件快速找到你感兴趣的课程。",
    targetSelector: '[data-tour="tour-filters"]',
  },
  {
    title: "课程详情页",
    description:
      "点击课程进入详情页，查看评分、同学点评和 AI 智能总结，全面了解课程情况。",
    targetSelector: '[data-tour="tour-course-detail"]',
  },
  {
    title: "写点评",
    description:
      "分享你的上课体验！为课程打分、写下评价，帮助同学们做出更好的选课决策。",
    targetSelector: '[data-tour="tour-write-review"]',
  },
  {
    title: "排课模拟",
    description:
      "使用排课模拟器轻松规划课表。添加必修课和选修课，直观查看时间冲突。",
    targetSelector: '[data-tour="tour-schedule"]',
  },
  {
    title: "反馈",
    description:
      "有任何建议或问题？欢迎通过反馈页面告诉我们，帮助 YOURTJ 不断改进！",
    targetSelector: '[data-tour="tour-feedback"]',
  },
];

// ─── Spotlight helper ────────────────────────────────────────────────────────

function parseSpotlightRect(
  selector: string | undefined,
): DOMRect | null {
  if (!selector) return null;
  const target = document.querySelector(selector);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top - 4,
    left: rect.left - 4,
    width: rect.width + 8,
    height: rect.height + 8,
  } as DOMRect;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TourGuide() {
  const { isActive, currentStep, isCompleted, startTour, nextStep, prevStep, skipTour } =
    useTourStore();
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const totalSteps = TOUR_STEPS.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;

  // Check prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Update spotlight position
  const updateSpotlight = useCallback(() => {
    setSpotlightRect(parseSpotlightRect(TOUR_STEPS[currentStep]?.targetSelector));
  }, [currentStep]);

  useEffect(() => {
    if (!isActive) return;
    // Let DOM settle after potential route changes
    const timer = setTimeout(updateSpotlight, 120);
    window.addEventListener("scroll", updateSpotlight, { passive: true });
    window.addEventListener("resize", updateSpotlight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", updateSpotlight);
      window.removeEventListener("resize", updateSpotlight);
    };
  }, [isActive, updateSpotlight]);

  // Complete the tour
  const finishTour = useCallback(() => {
    useTourStore.setState({ isActive: false, currentStep: 0, isCompleted: true });
  }, []);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      finishTour();
    } else {
      nextStep();
    }
  }, [isLastStep, finishTour, nextStep]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      else if (e.key === "ArrowLeft") prevStep();
      else if (e.key === "Escape") skipTour();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, handleNext, prevStep, skipTour]);

  // ── Floating help button ─────────────────────────────────────────────────
  if (!isActive && !isCompleted) {
    return (
      <Button
        onClick={startTour}
        className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg"
        aria-label="打开功能导览"
      >
        <HelpCircle className="size-4" />
        <span className="hidden sm:inline">功能导览</span>
      </Button>
    );
  }

  if (!isActive) return null;

  const transitionClass = prefersReducedMotion ? "" : "transition-all duration-300 ease-out";

  return (
    <>
      {/* Spotlight ring around target element */}
      {spotlightRect && (
        <div
          className={cn(
            "pointer-events-none fixed z-[51] rounded-lg ring-[3px] ring-primary/70",
            transitionClass,
          )}
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}

      <Dialog open={isActive} onOpenChange={(open) => { if (!open) skipTour(); }} modal>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  prefersReducedMotion ? "" : "duration-200",
                  i === currentStep
                    ? "w-5 bg-primary"
                    : i < currentStep
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-muted-foreground/20",
                )}
              />
            ))}
          </div>

          <DialogHeader>
            <DialogTitle>{TOUR_STEPS[currentStep].title}</DialogTitle>
            <DialogDescription>
              {TOUR_STEPS[currentStep].description}
            </DialogDescription>
          </DialogHeader>

          {/* Progress counter */}
          <p className="text-xs text-muted-foreground">
            {currentStep + 1} / {totalSteps}
          </p>

          <DialogFooter>
            <div className="flex w-full items-center gap-2">
              <Button variant="outline" size="default" onClick={skipTour}>
                跳过
              </Button>
              <div className="flex flex-1 items-center justify-end gap-2">
                {!isFirstStep && (
                  <Button variant="outline" size="default" onClick={prevStep}>
                    <ChevronLeft className="size-4" />
                    上一步
                  </Button>
                )}
                <Button onClick={handleNext} size="default">
                  <span>{isLastStep ? "完成" : "下一步"}</span>
                  {!isLastStep && <ChevronRight className="size-4" />}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
