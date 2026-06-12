import { useMediaQuery } from "~/hooks/useMediaQuery";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import { Button } from "~/components/ui/button";
import { ChevronRight } from "lucide-react";
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
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handleSelect = (template: Template) => {
    onSelect(template.content, template.id);
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (!isOpen) return null;

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>选择评论模板</DialogTitle>
            <DialogDescription>
              选择一个模板开始撰写评价
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[calc(80vh-160px)]">
            <div className="grid grid-cols-2 gap-4">
              {TEMPLATES.map((template) => (
                <Button
                  variant="ghost"
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/50 transition-all group h-auto"
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
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>选择评论模板</SheetTitle>
          <SheetDescription>
            选择一个模板开始撰写评价
          </SheetDescription>
        </SheetHeader>
        <div
          className="overflow-y-auto space-y-3"
          style={{ maxHeight: "calc(80vh - 100px)" }}
        >
          {TEMPLATES.map((template) => (
            <Button
              variant="ghost"
              key={template.id}
              onClick={() => handleSelect(template)}
              className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/50 transition-all group h-auto"
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
                <ChevronRight className="size-5 text-slate-400 group-hover:text-cyan-600 transition-colors flex-shrink-0" />
              </div>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
