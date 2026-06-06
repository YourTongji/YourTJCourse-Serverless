import { useState, useEffect } from "react";
import { Coins } from "lucide-react";
import { API_BASE } from "~/lib/api";
import { getClientId } from "~/lib/clientId";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

interface WalletBalance {
  credits: number;
}

export function WalletSheet() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setBalance(null);
    const clientId = getClientId();
    fetch(
      `${API_BASE}/api/wallet/balance?clientId=${encodeURIComponent(clientId)}`,
    )
      .then((res) => res.json() as Promise<WalletBalance>)
      .then((data) => setBalance(data.credits))
      .catch(() => setBalance(null))
      .finally(() => setLoading(false));
  }, [open]);

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
