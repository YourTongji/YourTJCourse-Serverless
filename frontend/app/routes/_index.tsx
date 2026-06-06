import { type MetaFunction } from "react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";

export const meta: MetaFunction = () => [
  { title: "YOURTJ选课社区" },
  { name: "description", content: "同济大学课程评价与选课交流社区" },
];

export default function Index() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="space-y-6">
        {/* Brand hero */}
        <div>
          <h1 className="font-brand text-5xl font-black tracking-tight text-slate-800">
            YOURTJ选课社区
          </h1>
          <p className="mt-3 text-lg text-slate-500 font-slogan">
            不记名、自由、简洁、高效的选课社区
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-center gap-4">
          <Link
            to="/courses"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-all"
          >
            浏览课程
          </Link>
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-400">
          Next-gen frontend · React Router v7 · shadcn/ui
        </p>
      </div>
    </div>
  );
}
