import { type MetaFunction } from "react-router";
import { Link } from "react-router";

export const meta: MetaFunction = () => [
  { title: "YOURTJ选课社区" },
  { name: "description", content: "同济大学课程评价与选课交流社区" },
];

export default function Index() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-800 font-brand">
          YOURTJ选课社区
        </h1>
        <p className="mt-2 text-slate-500">
          不记名、自由、简洁、高效的选课社区
        </p>
      </div>

      <div className="flex gap-4">
        <Link
          to="/courses"
          className="rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white transition hover:bg-slate-700"
        >
          浏览课程
        </Link>
      </div>

      <p className="text-xs text-slate-400">Next-gen frontend · React Router v7 · shadcn/ui</p>
    </div>
  );
}
