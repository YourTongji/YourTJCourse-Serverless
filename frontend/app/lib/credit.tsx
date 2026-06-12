import { useState, useEffect } from "react";
import { Coins } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";


export function WalletSheet({ userHash }: { userHash?: string }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!userHash) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setBalance(null);
    fetchCreditBalance(userHash)
      .then((data) => setBalance(data.balance))
      .catch(() => setBalance(null))
      .finally(() => setLoading(false));
  }, [open, userHash]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Coins className="size-3.5" />
        学分钱包
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>学分钱包</SheetTitle>
            <SheetDescription>你的评价学分余额</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <Coins className="size-8 mx-auto text-amber-500" />
                <div className="text-3xl font-bold">
                  {loading ? "…" : balance !== null ? balance : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  写评价获得学分
                </p>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ============ Credit Wallet API ============
// Talks to the external credit service (core.credit.yourtj.de).

const DEFAULT_CORE_BASE = "https://core.credit.yourtj.de";

function normalizeBase(input: string, fallback: string): string {
  const raw = String(input || fallback).trim();
  if (!raw) return String(fallback).trim().replace(/\/+$/, "");
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

function resolveCreditApiBase(): string {
  const envBase = normalizeBase(
    String((import.meta as any).env?.VITE_CREDIT_API_BASE || ""),
    DEFAULT_CORE_BASE,
  );
  return envBase;
}

function resolveCreditIntegrationBase(): string {
  const explicit = normalizeBase(
    String((import.meta as any).env?.VITE_CREDIT_CORE_API_BASE || ""),
    "",
  );
  if (explicit) return explicit;
  const apiBase = resolveCreditApiBase();
  const looksLikeFrontend =
    /^https?:\/\/credit\.yourtj\.de$/i.test(apiBase) || apiBase.includes("credit.yourtj.de/");
  return looksLikeFrontend ? DEFAULT_CORE_BASE : apiBase;
}

const CREDIT_API_BASE = resolveCreditApiBase();
const CREDIT_INTEGRATION_BASE = resolveCreditIntegrationBase();

async function readJson(res: Response, hint: string) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `${hint} failed`);
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("<")) {
    throw new Error(
      `${hint}：积分站返回了 HTML（疑似把前端页面当成接口返回了）。请检查积分站 API Base 配置是否正确。`,
    );
  }
  if (!/application\/json/i.test(contentType)) {
    throw new Error(
      `${hint}：积分站返回的不是 JSON（content-type=${contentType || "unknown"}）。` +
        `请检查 VITE_CREDIT_API_BASE 是否指向 ${DEFAULT_CORE_BASE}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${hint}：解析 JSON 失败，请检查积分站接口是否可用`);
  }
}

export interface CreditWalletData {
  userHash: string;
  userSecret: string;
  [key: string]: unknown;
}

export interface CreditBalanceData {
  balance: number;
  [key: string]: unknown;
}

export interface CreditSummaryData {
  [key: string]: unknown;
}

export async function registerCreditWallet(params: {
  userHash: string;
  userSecret: string;
}): Promise<CreditWalletData> {
  const res = await fetch(`${CREDIT_API_BASE}/api/wallet/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userHash: params.userHash, userSecret: params.userSecret }),
  });
  return readJson(res, "register wallet");
}

export async function fetchCreditBalance(userHash: string): Promise<CreditBalanceData> {
  const res = await fetch(
    `${CREDIT_API_BASE}/api/wallet/${encodeURIComponent(userHash)}/balance`,
    { signal: AbortSignal.timeout(15000) },
  );
  return readJson(res, "fetch balance");
}

export async function fetchCreditSummary(
  userHash: string,
  date?: string,
): Promise<CreditSummaryData> {
  const q = new URLSearchParams({ userHash });
  if (date) q.set("date", date);
  const primaryUrl = `${CREDIT_INTEGRATION_BASE}/api/integration/jcourse/summary?${q.toString()}`;
  try {
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(15000) });
    return readJson(res, "fetch summary");
  } catch (e: any) {
    if (CREDIT_INTEGRATION_BASE !== DEFAULT_CORE_BASE) {
      const fallbackUrl = `${DEFAULT_CORE_BASE}/api/integration/jcourse/summary?${q.toString()}`;
      const res = await fetch(fallbackUrl, { signal: AbortSignal.timeout(15000) });
      return readJson(res, "fetch summary");
    }
    throw e;
  }
}
