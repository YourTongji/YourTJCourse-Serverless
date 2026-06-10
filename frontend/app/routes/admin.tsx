import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "管理后台 — YOURTJ选课社区" },
];

export default function Admin() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-slate-800">
            管理后台
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-500 text-sm">
            管理后台功能正在迁移中，敬请期待。
          </p>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-slate-400">
            管理员链接区域
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
