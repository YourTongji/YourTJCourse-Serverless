import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ChevronRight } from "lucide-react";
import { useAiSummary } from "~/lib/queries";
import type { AiSummaryResult } from "~/lib/api";
import { cn } from "~/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "~/components/ui/collapsible";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

export default function AISummaryCard({ courseId }: { courseId: number }) {
  const [collapsed, setCollapsed] = useState(true);
  const queryOptions = useAiSummary(courseId, !collapsed);
  const { data: response, isLoading, isFetching, isError, refetch } =
    useQuery(queryOptions);

  const data: AiSummaryResult | null = response?.data ?? null;
  const hasData = !!(data && data.keywords?.length);
  const isHit = response?.cache === "hit" || response?.cache === "db";
  const isRefreshing = isFetching && !!response;
  const hasRefreshError = isError && !!response && !isFetching;

  const consensusColors: Record<string, string> = {
    "一致好评": "text-emerald-600 bg-emerald-50 border-emerald-200",
    "好评居多": "text-green-600 bg-green-50 border-green-200",
    "褒贬不一": "text-amber-600 bg-amber-50 border-amber-200",
    "差评居多": "text-orange-600 bg-orange-50 border-orange-200",
    "数据不足": "text-slate-400 bg-slate-50 border-slate-200",
  };

  const sentimentIcons: Record<string, string> = {
    "👍": "bg-emerald-50 text-emerald-600",
    "😐": "bg-amber-50 text-amber-600",
    "👎": "bg-red-50 text-red-500",
  };

  const handleOpenChange = useCallback((open: boolean) => {
    setCollapsed(!open);
  }, []);

  return (
    <Collapsible open={!collapsed} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            className="flex w-full items-center justify-between gap-3 h-auto rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5 text-left hover:border-cyan-200 hover:bg-cyan-50/60"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-5 w-5 shrink-0 flex items-center justify-center">
                <img
                  src="https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/qwen.svg"
                  alt="Qwen"
                  className="h-5 w-5"
                />
              </div>
              <p className="truncate text-sm font-semibold text-slate-700">
                AI 评课总结
              </p>
            </div>
            {hasData && data && (
              <Badge
                variant="outline"
                className={
                  consensusColors[data.rating_consensus] ||
                  "text-slate-400 bg-slate-50 border-slate-200"
                }
              >
                {data.rating_consensus}
              </Badge>
            )}
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-slate-400 transition-transform",
                !collapsed && "rotate-90",
              )}
            />
          </Button>
        }
      />
      <CollapsibleContent>
        {/* Loading state (first fetch, no data yet) */}
        {isLoading && (
          <Card className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/30 to-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-0.5 mb-4">
                <span className="text-xs text-cyan-500 font-medium">
                  正在思考
                </span>
                <span className="flex items-center gap-0.5">
                  <span
                    className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot"
                    style={{ animationDelay: "200ms" }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot"
                    style={{ animationDelay: "400ms" }}
                  />
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex gap-1.5">
                  <div className="h-6 w-14 rounded-full bg-gradient-to-r from-cyan-100/40 via-cyan-200/40 to-cyan-100/40 animate-summary-shimmer" />
                  <div
                    className="h-6 w-20 rounded-full bg-gradient-to-r from-cyan-100/40 via-cyan-200/40 to-cyan-100/40 animate-summary-shimmer"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <div
                    className="h-6 w-16 rounded-full bg-gradient-to-r from-cyan-100/40 via-cyan-200/40 to-cyan-100/40 animate-summary-shimmer"
                    style={{ animationDelay: "0.3s" }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white/50 rounded-xl p-3 border border-emerald-100/50 space-y-2">
                    <div className="h-3 w-10 rounded bg-gradient-to-r from-emerald-100/40 via-emerald-200/40 to-emerald-100/40 animate-summary-shimmer" />
                    <div className="h-3 w-full rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" />
                    <div
                      className="h-3 w-5/6 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="h-3 w-4/6 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                  <div className="bg-white/50 rounded-xl p-3 border border-red-100/50 space-y-2">
                    <div className="h-3 w-10 rounded bg-gradient-to-r from-red-100/40 via-red-200/40 to-red-100/40 animate-summary-shimmer" />
                    <div className="h-3 w-full rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" />
                    <div
                      className="h-3 w-4/5 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer"
                      style={{ animationDelay: "0.15s" }}
                    />
                    <div
                      className="h-3 w-3/5 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer"
                      style={{ animationDelay: "0.25s" }}
                    />
                  </div>
                </div>
                <div className="bg-white/40 rounded-xl p-3 border border-slate-100/50 space-y-2">
                  <div className="h-3 w-20 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer" />
                  <div
                    className="h-3 w-full rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="h-3 w-11/12 rounded bg-gradient-to-r from-slate-100/40 via-slate-200/40 to-slate-100/40 animate-summary-shimmer"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
              <p className="mt-3 text-[10px] text-slate-300 text-center animate-pulse">
                AI 正在分析学生评价，请稍候...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error state (first fetch failed, no data yet) */}
        {isError && !response && (
          <Card className="rounded-xl border border-red-100 bg-red-50/50">
            <CardContent className="p-5 text-center">
              <p className="text-xs text-red-400 mb-2">AI 总结生成失败</p>
              <Button
                variant="link"
                size="xs"
                className="text-red-500 hover:text-red-600"
                onClick={() => refetch()}
              >
                重新尝试
              </Button>
            </CardContent>
          </Card>
        )}

        {/* No reviews / no data — shouldn't happen normally */}
        {!isLoading && response && !hasData && (
          <Card className="rounded-xl border border-slate-100 bg-white/80">
            <CardContent className="p-5 text-center">
              <Button
                variant="link"
                size="xs"
                className="text-slate-500 hover:text-slate-600"
                onClick={() => refetch()}
              >
                重新尝试
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Done: full content */}
        {hasData && data && (
          <Card className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/30 to-white">
            <CardContent className="p-5">
              {/* Refresh error banner */}
              {hasRefreshError && (
                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-[11px] text-amber-600 font-medium">
                    刷新失败，已显示上一次结果
                  </p>
                  <Button
                    variant="link"
                    size="xs"
                    className="text-amber-700 hover:text-amber-800"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    重试
                  </Button>
                </div>
              )}

              {/* Content header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {isRefreshing ? (
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-cyan-500 font-medium">
                        正在思考
                      </span>
                      <span className="flex items-center gap-0.5">
                        <span
                          className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot"
                          style={{ animationDelay: "200ms" }}
                        />
                        <span
                          className="w-1 h-1 rounded-full bg-cyan-400 animate-summary-dot"
                          style={{ animationDelay: "400ms" }}
                        />
                      </span>
                    </div>
                  ) : (
                    <>
                      {isHit && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          已缓存
                        </span>
                      )}
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-cyan-600 hover:text-cyan-700"
                  onClick={() => refetch()}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  {isRefreshing ? "生成中" : "刷新"}
                </Button>
              </div>

              {/* Keywords */}
              {data.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {data.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-cyan-200 text-cyan-700"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              )}

              {/* Pros & Cons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {data.pros.length > 0 && (
                  <div className="bg-white/70 rounded-xl p-3 border border-emerald-100">
                    <p className="text-[11px] font-semibold text-emerald-600 mb-1.5 flex items-center gap-1">
                      <span>👍</span> 优点
                    </p>
                    <ul className="space-y-1">
                      {data.pros.map((p, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-600 leading-relaxed"
                        >
                          • {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.cons.length > 0 && (
                  <div className="bg-white/70 rounded-xl p-3 border border-red-100">
                    <p className="text-[11px] font-semibold text-red-500 mb-1.5 flex items-center gap-1">
                      <span>👎</span> 缺点
                    </p>
                    <ul className="space-y-1">
                      {data.cons.map((c, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-600 leading-relaxed"
                        >
                          • {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Representative quotes */}
              {data.representative.length > 0 && (
                <div className="bg-white/50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center gap-1">
                    <span>💬</span> 代表性评价
                  </p>
                  <div className="space-y-2">
                    {data.representative.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sentimentIcons[r.sentiment] || "bg-slate-50 text-slate-400"}`}
                        >
                          {r.sentiment}
                        </span>
                        <span className="text-xs text-slate-600 leading-relaxed">
                          &ldquo;{r.text}&rdquo;
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer disclaimer */}
              <p className="mt-3 text-[10px] text-slate-400 text-center">
                AI 生成，仅供参考 · 评价有变化后请刷新
              </p>
            </CardContent>
          </Card>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
