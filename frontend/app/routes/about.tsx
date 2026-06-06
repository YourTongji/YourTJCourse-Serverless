import { Card } from "~/components/ui/card";

export default function About() {
  return (
    <div className="space-y-6">
      <Card className="p-6 md:p-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-6">关于</h1>

        <div className="prose prose-slate max-w-none">
          <h2>简介</h2>
          <p>
            YOURTJ选课社区为非官方网站，由同济大学在校生开发维护。
            选课社区目的在于让同学们了解课程的更多情况，延续"乌龙茶"选课社区精神，不想也不能代替教务处的课程评教。我们的愿景是：建立不记名，自由，简洁，高效的选课社区。
          </p>

          <h2>机制</h2>

          <h3>匿名身份</h3>
          <p>
            选课社区无需登录，不存储任何个人信息，您可以放心的提交测评。
          </p>

          <h3>点评管理</h3>
          <p>
            在符合社区规范的情况下，我们不修改选课社区的点评内容，也不评价内容的真实性。 如果您上过某一门课程并认为网站上的点评与事实不符，欢迎提交您的意见， 我们相信全面的信息会给大家最好的答案。
          </p>
          <p>
            选课社区管理员的责任仅限于维护系统的稳定，删除非课程点评内容和重复发帖，并维护课程和教师信息格式， 方便进行数据的批量处理。
          </p>

          <h3>课程与教师信息</h3>
          <p>
            课程与教师信息来自同济大学教务系统公开数据。我们不对信息的准确性做任何保证，也不代表官方立场。
          </p>

          <h3>激励与学分</h3>
          <p>
            选课社区目前不提供任何形式的物质激励。我们相信，分享课程信息本身就是对社区最大的贡献。
          </p>

          <h3>社区规范</h3>
          <p>
            我们提倡文明、理性、真实的讨论。请尊重每一位教师和同学。我们保留删除违规内容的权利。
          </p>

          <h2>成员</h2>
          <p>
            YOURTJ选课社区由同济大学在校生志愿者开发和维护。如果你有兴趣加入我们，欢迎通过邮件联系。
          </p>

          <h2>联系方式</h2>
          <p>
            您目前可以通过邮件{" "}
            <a href="mailto:support@yourtj.de" className="text-cyan-600 hover:text-cyan-700 underline">
              support@yourtj.de
            </a>{" "}
            联系我们。
          </p>

          <h2>致谢</h2>
          <p>
            <a
              href="https://github.com/WALKERKILLER/TongjiCourses-Serverless"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 hover:text-cyan-700 underline"
            >
              YOURTJ选课社区
            </a>
            基于
            <a
              href="https://github.com/SJTU-jCourse/jcourse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 hover:text-cyan-700 underline ml-1"
            >
              SJTU选课社区
            </a>
            源代码
          </p>
          <p>
            <a
              href="https://github.com/WALKERKILLER/TongjiCaptcha"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 hover:text-cyan-700 underline"
            >
              YOURTJ选课社区人机验证
            </a>
            基于
            <a
              href="https://github.com/YuiNijika/BangCaptcha"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 hover:text-cyan-700 underline ml-1"
            >
              BangCaptcha
            </a>
            源代码
          </p>
          <p className="mt-2">
            排课模拟器及高级检索基于
            <a
              href="https://github.com/XiaLing233/tongji-course-scheduler"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 hover:text-cyan-700 underline ml-1"
            >
              TONGJI-COURSE-SCHEDULER
            </a>
            源代码
          </p>
        </div>
      </Card>
    </div>
  );
}
