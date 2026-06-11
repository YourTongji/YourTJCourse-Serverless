import { Link, type MetaFunction } from "react-router";
import { Card, CardContent } from "~/components/ui/card";

export const meta: MetaFunction = () => [
  { title: "页面未找到 — YOURTJ选课社区" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="p-8 text-center space-y-4">
          <p className="text-6xl font-black text-slate-200">404</p>
          <h1 className="text-xl font-bold text-slate-800">页面未找到</h1>
          <p className="text-sm text-slate-500">
            你访问的页面不存在，或已被移除。
          </p>
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
          >
            返回首页
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
