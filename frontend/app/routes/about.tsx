import { Card } from "~/components/ui/card";
import type { MetaFunction } from "react-router";
export const meta: MetaFunction = () => [
  { title: "关于 — YOURTJ选课社区" },
  { name: "description", content: "关于YOURTJ选课社区——同济大学课程评价与选课交流社区" },
];

export default function About() {
  return (
    <div className="space-y-6">
      <Card data-slot="card" className="p-6 md:p-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-8">关于</h1>

        <div className="prose prose-slate max-w-none">
          {/* 简介 */}
          <section className="not-prose mb-10">
            <h2 className="text-xl font-bold text-slate-800 mb-3">简介</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              YOURTJ选课社区为非官方网站，由同济大学在校生开发维护。
              选课社区目的在于让同学们了解课程的更多情况，延续"乌龙茶"选课社区精神，不想也不能代替教务处的课程评教。我们的愿景是：建立不记名，自由，简洁，高效的选课社区。
            </p>
          </section>

          {/* 机制 */}
          <section className="not-prose mb-10">
            <h2 className="text-xl font-bold text-slate-800 mb-4">机制</h2>

            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-700 mb-1.5">匿名身份</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  选课社区无需登录，不存储任何个人信息，您可以放心的提交测评。
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-700 mb-1.5">点评管理</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  在符合社区规范的情况下，我们不修改选课社区的点评内容，也不评价内容的真实性。 如果您上过某一门课程并认为网站上的点评与事实不符，欢迎提交您的意见， 我们相信全面的信息会给大家最好的答案。
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                  选课社区管理员的责任仅限于维护系统的稳定，删除非课程点评内容和重复发帖，并维护课程和教师信息格式， 方便进行数据的批量处理。
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-700 mb-1.5">课程与教师信息</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  课程与教师信息来自同济大学教务系统公开数据。我们不对信息的准确性做任何保证，也不代表官方立场。
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-700 mb-1.5">激励与学分</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  选课社区目前不提供任何形式的物质激励。我们相信，分享课程信息本身就是对社区最大的贡献。
                </p>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-700 mb-1.5">社区规范</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  我们提倡文明、理性、真实的讨论。请尊重每一位教师和同学。我们保留删除违规内容的权利。
                </p>
              </div>
            </div>
          </section>

          {/* 成员 */}
          <section className="not-prose mb-10">
            <h2 className="text-xl font-bold text-slate-800 mb-3">成员</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              YOURTJ选课社区由同济大学在校生志愿者开发和维护。如果你有兴趣加入我们，欢迎通过邮件联系。
            </p>
          </section>

          {/* 联系方式 */}
          <section className="not-prose mb-10">
            <h2 className="text-xl font-bold text-slate-800 mb-3">联系方式</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              您目前可以通过邮件{" "}
              <a href="mailto:support@yourtj.de" className="text-cyan-600 hover:text-cyan-700 underline font-medium">
                support@yourtj.de
              </a>{" "}
              联系我们。
            </p>
          </section>

          {/* 致谢 */}
          <section className="not-prose mb-2">
            <h2 className="text-xl font-bold text-slate-800 mb-4">致谢</h2>
            <div className="space-y-2.5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <a
                  href="https://github.com/WALKERKILLER/TongjiCourses-Serverless"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-700 underline font-medium"
                >
                  YOURTJ选课社区
                </a>
                <span className="mx-1">基于</span>
                <a
                  href="https://github.com/SJTU-jCourse/jcourse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-700 underline font-medium"
                >
                  SJTU选课社区
                </a>
                源代码
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <a
                  href="https://github.com/WALKERKILLER/TongjiCaptcha"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-700 underline font-medium"
                >
                  YOURTJ选课社区人机验证
                </a>
                <span className="mx-1">基于</span>
                <a
                  href="https://github.com/YuiNijika/BangCaptcha"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-700 underline font-medium"
                >
                  BangCaptcha
                </a>
                源代码
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                排课模拟器及高级检索基于
                <a
                  href="https://github.com/XiaLing233/tongji-course-scheduler"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-700 underline font-medium ml-1"
                >
                  TONGJI-COURSE-SCHEDULER
                </a>
                源代码
              </p>
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}
