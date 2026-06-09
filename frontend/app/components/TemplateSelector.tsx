import type { TemplateHints } from "~/components/MarkdownEditor";

interface Template {
  id: string;
  name: string;
  icon: React.ReactNode;
  content: string;
  description: string;
}

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (content: string, templateId?: string) => void;
}

const TEMPLATES: Template[] = [
  {
    id: "comprehensive",
    name: "全面评价",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    description: "包含课程内容、教学方式、考核方式等全面评价",
    content: `## 课程内容

## 教学方式

## 作业与考核

## 收获与建议
`,
  },
  {
    id: "quick",
    name: "快速点评",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    description: "简洁明了的快速评价",
    content: `**总体评价：**

**优点：**
-

**缺点：**
-

**建议：**
`,
  },
  {
    id: "teacher-focused",
    name: "教师评价",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
    description: "重点评价教师教学水平和风格",
    content: `## 教学态度

## 授课风格

## 师生互动

## 总体印象
`,
  },
  {
    id: "exam-focused",
    name: "考试攻略",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
    description: "重点介绍考试形式和备考建议",
    content: `## 考试形式

## 考试难度

## 备考建议

## 给分情况
`,
  },
  {
    id: "workload",
    name: "工作量评估",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    description: "重点评价课程工作量和时间投入",
    content: `## 课时安排

## 作业量

## 项目/实验

## 时间投入
`,
  },
  {
    id: "blank",
    name: "空白模板",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    ),
    description: "从空白开始自由发挥",
    content: "",
  },
];

export const TEMPLATE_HINTS: { [templateId: string]: TemplateHints } = {
  comprehensive: {
    "## 课程内容": "描述课程主要内容、知识点覆盖范围",
    "## 教学方式": "描述老师的教学风格、课堂互动情况",
    "## 作业与考核": "描述作业量、考试难度、评分标准",
    "## 收获与建议": "总结课程收获，给出选课建议",
  },
  quick: {
    "**总体评价：**": "一句话总结",
    "**优点：**": "列出课程优点",
    "**缺点：**": "列出课程缺点",
    "**建议：**": "给后来者的建议",
  },
  "teacher-focused": {
    "## 教学态度": "描述老师的教学态度、责任心",
    "## 授课风格": "描述老师的讲课方式、表达能力",
    "## 师生互动": "描述课堂互动、答疑情况",
    "## 总体印象": "总结对老师的整体评价",
  },
  "exam-focused": {
    "## 考试形式": "描述考试类型：开卷/闭卷、题型分布",
    "## 考试难度": "描述考试难度、与平时作业的关系",
    "## 备考建议": "给出具体的复习建议、重点内容",
    "## 给分情况": "描述老师的给分风格、是否有调分",
  },
  workload: {
    "## 课时安排": "描述每周课时、上课时间",
    "## 作业量": "描述作业频率、完成时间",
    "## 项目/实验": "描述是否有项目或实验、工作量如何",
    "## 时间投入": "总结课程总体时间投入、性价比",
  },
};

export default function TemplateSelector({
  isOpen,
  onClose,
  onSelect,
}: TemplateSelectorProps) {
  const handleSelect = (template: Template) => {
    onSelect(template.content, template.id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile: bottom drawer */}
      <div className="md:hidden">
        <div
          className="fixed inset-0 bg-black/40 z-50 transition-opacity"
          onClick={onClose}
        />
        <div
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 transition-transform"
          style={{ maxHeight: "80vh" }}
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1 bg-slate-300 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-800">选择评论模板</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="关闭"
              type="button"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div
            className="overflow-y-auto p-4 space-y-3"
            style={{ maxHeight: "calc(80vh - 80px)" }}
          >
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/50 transition-all group"
                type="button"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-cyan-100 flex items-center justify-center text-slate-600 group-hover:text-cyan-600 transition-colors">
                    {template.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 mb-1">
                      {template.name}
                    </h4>
                    <p className="text-sm text-slate-500 line-clamp-2">
                      {template.description}
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 text-slate-400 group-hover:text-cyan-600 transition-colors flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: floating modal */}
      <div className="hidden md:block">
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
          onClick={onClose}
        />
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] bg-white rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-bold text-slate-800">选择评论模板</h3>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              aria-label="关闭"
              type="button"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
            <div className="grid grid-cols-2 gap-4">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/50 transition-all group"
                  type="button"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-cyan-100 flex items-center justify-center text-slate-600 group-hover:text-cyan-600 transition-colors">
                      {template.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-800 mb-1">
                        {template.name}
                      </h4>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2">
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
