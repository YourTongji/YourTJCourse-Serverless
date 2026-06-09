import { useState } from "react";
import { Link, useNavigate, type MetaFunction } from "react-router";
import { ArrowRight, CalendarRange, MessageSquareText, Search } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";

export const meta: MetaFunction = () => [
  { title: "YOURTJ选课社区" },
  { name: "description", content: "同济大学课程评价与选课交流社区" },
];

const quickActions = [
  {
    to: "/courses",
    title: "课程目录",
    description: "按课程、教师、学院筛选评价",
    icon: Search,
  },
  {
    to: "/schedule",
    title: "排课模拟",
    description: "组合课程并检查时间冲突",
    icon: CalendarRange,
  },
  {
    to: "/feedback",
    title: "反馈",
    description: "提交问题、建议和站点反馈",
    icon: MessageSquareText,
  },
];

export default function Index() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
        <div className="grid gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div>
            <p className="text-sm font-medium text-teal-700">
              YOURTJ选课社区
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">
              查课程评价，排一张可落地的课表
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              课程目录与排课模拟已经合并到新版前端，搜索、筛选、选课和查看评价都可以从这里进入。
            </p>
          </div>

          <form
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = query.trim();
              navigate(trimmed ? `/courses?q=${encodeURIComponent(trimmed)}` : "/courses");
            }}
          >
            <label htmlFor="home-course-search" className="text-sm font-medium text-slate-700">
              搜索课程
            </label>
            <div className="mt-2 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="home-course-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="课程名、课号或教师"
                  className="bg-white pl-9"
                />
              </div>
              <Button type="submit">
                搜索
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {quickActions.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="group block">
              <Card className="h-full border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-teal-700">
                    <Icon className="size-4" />
                  </div>
                  <ArrowRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-slate-900">
                  {item.title}
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  {item.description}
                </p>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
