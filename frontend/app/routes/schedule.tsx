import { Card } from "~/components/ui/card";

export default function Schedule() {
  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-6">
        <h1 className="text-2xl font-bold text-slate-800">排课模拟</h1>
      </Card>
      <div className="w-full rounded-lg overflow-hidden border border-border">
        <iframe
          src="/sim/index.html"
          title="排课模拟"
          className="w-full"
          style={{ height: "calc(100vh - 12rem)" }}
        />
      </div>
    </div>
  );
}
