import GlassCard from '../components/GlassCard'

export default function FAQ() {
  return (
    <div className="space-y-6">
      <GlassCard className="bg-gradient-to-r from-cyan-50 to-white" hover={false}>
        <h1 className="text-3xl font-bold text-slate-800 mb-6">常见问题</h1>

        <div className="prose prose-slate max-w-none space-y-6">
          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">我该点评哪些课程？写什么？</h4>
            <p className="text-slate-600 mb-3">
              所有的课程。但如果你想帮忙，最好的是那些还没有点评的课程和老师。请不要吝啬你的好评，也不要害怕说坏话。
              即使是没有什么亮点的课程也值得你来写一条点评，因为"这门课很正常"也是很重要的信息。寥寥几字可以拯救无数人的迷茫。
            </p>
            <p className="text-slate-600 mb-2">社区鼓励大家在写点评的时候各显神通，当然一个理想的点评应该</p>
            <ul className="list-disc list-inside text-slate-600 space-y-1 ml-4">
              <li><strong>饱含事实。</strong>"某课很无聊"不是个好的点评，"某课的老师只会读PPT"还可以。你应该只点评自己上过的课程，而不是道听途说的评价。我们鼓励列举事实，不鼓励情绪宣泄。</li>
              <li><strong>全面。</strong>课堂、考核、课下，以及特别的体验。这些维度和故事都涉及会很棒。</li>
              <li><strong>清晰。</strong>点评不应滥用缩写、绰号、梗，或者对缺乏背景的读者难以理解的其他用语或者描述方式。</li>
            </ul>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">选课社区是用来找到"水课"的吗？这是否会伤害教学质量？</h4>
            <p className="text-slate-600 mb-3">
              这不是社区的主题。我们希望的是提供完全信息，方便同学们了解这门课的风格，考核标准与历史。不是哪些课容易满绩。
              我们相信来自广大同学的监督和信息的交换可以带来更大的教学质量提升。这就是为什么我们弱化1-5星的"推荐""不推荐"评分而是主张文字内容。
            </p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">我喜欢看1-5星评分的数据，不喜欢看字。</h4>
            <p className="text-slate-600 mb-3">
              数据本身是个伪命题。每个同学对于一门课是否推荐，工作量是否大的判断标准不一样，用数字衡量看似很客观，实际上主观得很。
              文字可以透露实质的信息，比如某门课大作业是帮着老师实验室做项目，但是给分极好。按1-5评分，可能这门课能登水课榜首，但这也会坑很多人。
              当然数据会让信息更好索引和浏览，因此在统计上合理的条件下，我们会提供一些统计数据。我们在努力达到平衡。
            </p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">请特别注意，"数据"会给人错误的信心</h4>
            <p className="text-slate-600 mb-3">
              我们通常喜欢相信数字。但请注意，社区上的数字是完全人造的。 点评中填写的成绩是自由填写的 ，从而不一定真实、准确或者有任何参考意义。
              课程评价的分数就更加主观了，请参见上一个问题的答案。 因此，我们再次着重强调，数据会骗人。内容才是这个网站存在的核心。
            </p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">选课社区谁开发和部署的？</h4>
            <p className="text-slate-600">同济大学在校（或/与曾经在校）生。</p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">选课社区由谁来管理？</h4>
            <p className="text-slate-600">同济大学在校（或/与曾经在校）生。</p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">我会因为在这里发表点评而被约谈吗？</h4>
            <p className="text-slate-600">
              不会，因为选课社区采用不记名制。 当然我们相信开明的同济大学行政机构和教职工不会因为对本科生课程的评价就试图约谈学生。
            </p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">网站上的内容是否受管理？</h4>
            <p className="text-slate-600 mb-3">
              秉承着完全信息原则，我们不修改网站上的课程点评 ，也不评价内容的真实性。
              这不意味着我们完全不管理社区内容。我们不希望列举过多的规则 ，但以下内容本社区不予接受：
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-1 ml-4 mb-3">
              <li>非课程点评信息。例如广告、对社区的攻击等。</li>
              <li>刷点评。在多门课程中发表相似而无帮助的内容，特别在我们认定用户未真实上过这些课的情况下。</li>
              <li>侵害他人利益。例如暴露没有必要的个人隐私、与课程内容无关的诽谤和人身攻击等。</li>
              <li>违反用户所在地区法律的其他内容。</li>
            </ul>
            <p className="text-slate-600 mb-3">
              社区管理员将删除此类内容，并视情况在一段时间内禁止该用户使用选课社区。
              原则上我们不修改内容，只修正事实性错误和重新排版，如：修改错误的课程、学期、成绩格式，删去无内容的占位符等。
              社区管理员可能会对存在不确定真实内容的点评做出标注，以提醒用户注意辨别真实性。
            </p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">如何界定社区内容的版权问题？</h4>
            <p className="text-slate-600 mb-3">
              向选课社区提交点评时，您同意向社区提供对您提交的点评内容的永久、不可撤回、非独占、 全球有效无限制的许可。您依然享有您提交的内容的全部版权。
              任何人（除了原始所有权人）不得在未经社区许可的条件下，转载社区内容 （包括全部或部分内容）。
              您在提交点评时，授权社区以一切法律、技术途径代理保护您所提交的内容的版权，包括但不限于向任何未经许可的转载媒介进行起诉和发送DMCA请求。
            </p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">如何联系你们？</h4>
            <p className="text-slate-600">
              请通过邮件 <a href="mailto:support@yourtj.de" className="text-cyan-600 hover:text-cyan-700 underline">support@yourtj.de</a> 向社区提出意见和建议。
            </p>
          </div>

          <div>
            <h4 className="text-xl font-semibold text-slate-800 mb-3">我是课程老师……</h4>
            <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
              <li>
                <strong>我希望回复某一个关于我的点评。</strong>感谢您的重视，我们随时欢迎老师也参与选课社区。请使用学校邮箱发信到 <a href="mailto:support@yourtj.de" className="text-cyan-600 hover:text-cyan-700 underline">support@yourtj.de</a>，并提供希望回复的点评和您的回复。确认身份后我们可以将您的回复与点评一起呈现。
              </li>
              <li>
                <strong>我认为课程点评中存在虚假内容。</strong>请使用学校邮箱发信到 <a href="mailto:support@yourtj.de" className="text-cyan-600 hover:text-cyan-700 underline">support@yourtj.de</a>，并提供相关点评和澄清内容。我们希望能够协助您澄清。
              </li>
            </ul>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
