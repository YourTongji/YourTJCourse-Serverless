import { useEffect, useMemo, useState } from "react";
import { X, Coins, RefreshCw, LogOut } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { useDraggableDesktop } from "~/hooks/useDraggableDesktop";
import { useIsMobile } from "~/lib/schedule/responsive";
import { loadCreditWallet, saveCreditWallet, clearCreditWallet } from "~/lib/creditWallet";
import { fetchCreditBalance, fetchCreditSummary } from "~/lib/credit";

type SummaryData = {
  balance: number;
  date: string;
  today: {
    reviewReward: number;
    likePendingDelta: number;
    likePendingPositive: number;
    likePendingNegative: number;
  };
};

export default function CreditWalletPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [wallet, setWallet] = useState(() => loadCreditWallet());
  const [balance, setBalance] = useState<number | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [embedOpen, setEmbedOpen] = useState(false);
  const drag = useDraggableDesktop("yourtj_floating_wallet_pos", { x: 0, y: 0 });

  const isMobile = useIsMobile();

  const formatError = (e: unknown) => {
    const msg = String((e as { message?: string })?.message || e || "加载失败");
    if (/Unexpected token\s*['"]?</i.test(msg) || /<!doctype/i.test(msg) || /text\/html/i.test(msg)) {
      return '积分站接口返回了 HTML（疑似 API Base 配置不正确）。请把 VITE_CREDIT_API_BASE 配置为 https://core.credit.yourtj.de';
    }
    return msg;
  };

  const openPanel = () => {
    window.dispatchEvent(new CustomEvent("yourtj-floating-open", { detail: { panel: "wallet" } }));
    setIsOpen(true);
  };

  useEffect(() => {
    const onOpen = () => openPanel();
    window.addEventListener("open-credit-wallet", onOpen);
    return () => window.removeEventListener("open-credit-wallet", onOpen);
  }, []);

  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      const panel = String((e as CustomEvent).detail?.panel || "");
      if (panel === "filter") { setIsOpen(false); setEmbedOpen(false); }
    };
    window.addEventListener("yourtj-floating-open", onOtherOpen);
    return () => window.removeEventListener("yourtj-floating-open", onOtherOpen);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes("credit.yourtj.de")) return;
      if (event.data?.type !== "yourtj-credit-wallet") return;
      const w = event.data.wallet;
      if (!w || typeof w.userHash !== "string" || !w.userHash) return;
      if (typeof w.userSecret !== "string" || !w.userSecret) return;
      saveCreditWallet(w);
      setWallet(w);
      refresh(w.userHash);
      setEmbedOpen(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async (userHash?: string) => {
    const hash = String(userHash || wallet?.userHash || "").trim();
    if (!hash) return;
    try {
      setError("");
      const [bal, sum] = await Promise.all([fetchCreditBalance(hash), fetchCreditSummary(hash)]);
      const b = Number(bal.balance ?? ((bal as Record<string, unknown>)?.data as Record<string, unknown> | undefined)?.balance ?? 0);
      const s = sum?.data as SummaryData | undefined;
      setBalance(Number.isFinite(b) ? b : 0);
      setSummary(s || null);
    } catch (e: unknown) {
      setError(formatError(e));
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!wallet?.userHash) return;
    refresh(wallet.userHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, wallet?.userHash]);

  const handleBind = async () => {
    setLoading(true);
    setError("");
    try { setEmbedOpen(true); } finally { setLoading(false); }
  };

  const todayEstimated = useMemo(() => {
    const review = Number(summary?.today?.reviewReward || 0);
    const likeCount = Number(summary?.today?.likePendingDelta || 0);
    return review + likeCount * 3;
  }, [summary]);

  const likePendingPoints = useMemo(() => {
    const likeCount = Number(summary?.today?.likePendingDelta || 0);
    return likeCount * 3;
  }, [summary]);

  const logout = () => {
    clearCreditWallet();
    setWallet(null);
    setBalance(null);
    setSummary(null);
    setError("");
    setEmbedOpen(false);
    setIsOpen(true);
  };

  const content = (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 max-h-[calc(100vh-190px)]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">积分钱包</p>
            <CardTitle className="text-sm">YOURTJ Credit</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!wallet ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">请绑定YOURTJ积分站以获取评课激励积分</p>
              <Button type="button" onClick={handleBind} disabled={loading} className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                {loading ? "处理中..." : "打开积分站注册 / 绑定钱包"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="w-full" render={<a href="https://credit.yourtj.de" target="_blank" rel="noopener noreferrer" />} nativeButton={false}>访问积分站</Button>
                <Button variant="outline" size="sm" className="w-full" render={<a href="https://credit.yourtj.de/#/dashboard/history" target="_blank" rel="noopener noreferrer" />} nativeButton={false}>查看流水</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-muted/40 border"><CardContent className="p-3"><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">当前余额</p><p className="mt-1 text-lg font-bold">{balance ?? "-"}</p></CardContent></Card>
              <Card className="bg-amber-50/50 border-amber-200"><CardContent className="p-3"><p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">今日预计</p><p className="mt-1 text-lg font-bold text-amber-900">{todayEstimated >= 0 ? `+${todayEstimated}` : todayEstimated}</p></CardContent></Card>
            </div>
          )}
          {wallet && summary && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Card className="bg-white border"><CardContent className="p-2"><p className="text-[10px] font-semibold text-muted-foreground">点评</p><p className="text-sm font-bold text-foreground">+{summary.today.reviewReward}</p></CardContent></Card>
              <Card className="bg-white border"><CardContent className="p-2"><p className="text-[10px] font-semibold text-muted-foreground">点赞</p><p className="text-sm font-bold text-foreground">{likePendingPoints >= 0 ? `+${likePendingPoints}` : likePendingPoints}<span className="ml-1 text-[10px] font-semibold text-muted-foreground">({summary.today.likePendingDelta} 赞)</span></p></CardContent></Card>
              <Button type="button" variant="outline" size="sm" onClick={() => refresh(wallet.userHash)} className="h-auto py-2"><RefreshCw className="mr-1 size-3" />刷新</Button>
            </div>
          )}
          {wallet && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="w-full" render={<a href="https://credit.yourtj.de/#/dashboard/marketplace" target="_blank" rel="noopener noreferrer" />} nativeButton={false}>广场交易积分</Button>
                <Button variant="outline" size="sm" className="w-full" render={<a href="https://credit.yourtj.de/#/dashboard/history" target="_blank" rel="noopener noreferrer" />} nativeButton={false}>查看流水</Button>
              </div>
              <Button type="button" variant="outline" onClick={logout} className="w-full border-rose-200 text-rose-700 hover:bg-rose-50" size="sm"><LogOut className="mr-1 size-3" />退出登录</Button>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-destructive font-semibold">{error}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">积分规则</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 border p-3"><p className="text-sm font-medium">1 条 50 字以上点评</p><p className="text-sm font-bold text-foreground">+10（立即获得）</p></div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50/50 border border-amber-200 p-3"><p className="text-sm font-medium text-amber-800">收到 1 个点赞</p><p className="text-sm font-bold text-amber-900">+3（每日结算）</p></div>
          </div>
          {wallet && <p className="mt-3 text-[11px] text-muted-foreground break-all">钱包 ID：<span className="font-mono">{wallet.userHash}</span></p>}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <>
      {/* ── Embed iframe (wallet binding overlay) ── */}
      {embedOpen && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-sm" onClick={() => setEmbedOpen(false)} />
          <div className="fixed inset-x-4 top-10 bottom-10 z-[100] rounded-3xl bg-popover shadow-2xl border overflow-hidden">
            <div className="flex h-12 items-center justify-between border-b px-4">
              <p className="text-sm font-semibold">YOURTJ 社区积分站 - 注册/绑定</p>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEmbedOpen(false)} aria-label="关闭"><X className="size-4" /></Button>
            </div>
            <iframe src="https://credit.yourtj.de/#/" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" className="h-full w-full bg-white" title="YOURTJ Credit" />
          </div>
        </>
      )}
      {/* ── Single floating trigger button ── */}
      <div className="fixed right-4 bottom-40 md:right-6 md:top-44 z-50">
        {isMobile ? (
          /* Mobile: floating button → opens Sheet */
          <>
            <Button type="button" data-tour="tour-wallet-floating" onClick={openPanel} variant="outline" className="relative h-14 w-14 rounded-2xl bg-popover/90 backdrop-blur-xl shadow-xl active:scale-95 transition-transform p-0" aria-label="打开积分钱包">
              <Coins className="size-6 text-muted-foreground" />
              <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-600 font-brand">积分</span>
              {summary && todayEstimated !== 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">{todayEstimated > 0 ? `+${todayEstimated}` : todayEstimated}</span>}
            </Button>
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetContent side="bottom">
                <SheetHeader><SheetTitle>积分钱包</SheetTitle></SheetHeader>
                {content}
              </SheetContent>
            </Sheet>
          </>
        ) : (
          /* Desktop: draggable panel with inline content */
          <div className={`bg-popover/90 backdrop-blur-xl border shadow-xl rounded-2xl transition-all duration-300 ${isOpen ? "w-[380px]" : "w-14"}`} style={drag.style}>
            <button type="button" data-tour="tour-wallet-floating" {...drag.dragHandleProps}
              onClick={() => { if (drag.consumeDragFlag()) return; if (isOpen) setIsOpen(false); else openPanel(); }}
              className="relative h-14 w-full flex items-center justify-center hover:bg-muted/50 rounded-2xl transition-colors"
              title={isOpen ? "收起钱包" : "打开钱包"}
            >
              <Coins className="size-6 text-muted-foreground" />
              <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-600 font-brand">积分</span>
              {summary && todayEstimated !== 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">{todayEstimated > 0 ? `+${todayEstimated}` : todayEstimated}</span>}
            </button>
            {isOpen && <div className="border-t">{content}</div>}
          </div>
        )}
      </div>
    </>
  );
}
