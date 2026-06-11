import GlassCard from '../components/GlassCard'

export default function About() {
  return (
    <div className="space-y-6">
      <GlassCard className="bg-gradient-to-r from-cyan-50 to-white" hover={false}>
        <h1 className="text-3xl font-bold text-slate-800 mb-6">关于</h1>

        <div className="prose prose-slate max-w-none">
          <h4 className="text-xl font-semibold text-slate-800 mb-3">简介</h4>
          <p className="text-slate-600 mb-6">
            YOURTJ选课社区为非官方网站，由同济大学在校生开发维护。
            选课社区目的在于让同学们了解课程的更多情况，延续"乌龙茶"选课社区精神，不想也不能代替教务处的课程评教。我们的愿景是：建立不记名，自由，简洁，高效的选课社区。
          </p>

          <h4 className="text-xl font-semibold text-slate-800 mb-3">机制</h4>

          <h5 className="text-lg font-semibold text-slate-700 mb-2">匿名身份</h5>
          <p className="text-slate-600 mb-4">
            选课社区无需登录，不存储任何个人信息，您可以放心的提交测评。
          </p>

          <h5 className="text-lg font-semibold text-slate-700 mb-2">点评管理</h5>
          <p className="text-slate-600 mb-4">
            在符合社区规范的情况下，我们不修改选课社区的点评内容，也不评价内容的真实性。 如果您上过某一门课程并认为网站上的点评与事实不符，欢迎提交您的意见， 我们相信全面的信息会给大家最好的答案。
          </p>
          <p className="text-slate-600 mb-6">
            选课社区管理员的责任仅限于维护系统的稳定，删除非课程点评内容和重复发帖，并维护课程和教师信息格式， 方便进行数据的批量处理。
          </p>

          <h4 className="text-xl font-semibold text-slate-800 mb-3">联系方式</h4>
          <p className="text-slate-600 mb-6">
            您目前可以通过邮件 <a href="mailto:support@yourtj.de" className="text-cyan-600 hover:text-cyan-700 underline">support@yourtj.de</a> 联系我们。
          </p>

          <h4 className="text-xl font-semibold text-slate-800 mb-3">致谢</h4>
          <p className="text-slate-600 mb-2">
            <a href="https://github.com/WALKERKILLER/TongjiCourses-Serverless" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-700 underline">
              YOURTJ选课社区
            </a>
            基于
            <a href="https://github.com/SJTU-jCourse/jcourse" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-700 underline ml-1">
              SJTU选课社区
            </a>
            源代码
          </p>
          <p className="text-slate-600">
            <a href="https://github.com/WALKERKILLER/TongjiCaptcha" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-700 underline">
              YOURTJ选课社区人机验证
            </a>
            基于
            <a href="https://github.com/YuiNijika/BangCaptcha" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-700 underline ml-1">
              BangCaptcha
            </a>
            源代码
          </p>
          <p className="text-slate-600 mt-2">
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
      </GlassCard>
    </div>
  )
}
