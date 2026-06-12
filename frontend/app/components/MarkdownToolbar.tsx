import { Button } from "~/components/ui/button";
import { FileText, Link, List, MoreHorizontal } from "lucide-react";

interface MarkdownToolbarProps {
  onInsert: (before: string, after?: string) => void;
  onShowMore: () => void;
  className?: string;
}

export default function MarkdownToolbar({
  onInsert,
  onShowMore,
  className = "",
}: MarkdownToolbarProps) {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40 ${className}`}
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Left: frequent actions */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={<FileText className="size-4" />}
              label="模板"
              onClick={() => onShowMore()}
            />
            <ToolbarButton
              icon={<span className="font-bold text-sm">B</span>}
              label="加粗"
              onClick={() => onInsert("**", "**")}
            />
            <ToolbarButton
              icon={<span className="italic text-sm">I</span>}
              label="斜体"
              onClick={() => onInsert("*", "*")}
            />
          </div>

          {/* Center: common formats */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={<span className="font-bold text-sm">H</span>}
              label="标题"
              onClick={() => onInsert("## ", "")}
            />
            <ToolbarButton
              icon={<Link className="size-4" />}
              label="链接"
              onClick={() => onInsert("[", "](url)")}
            />
            <ToolbarButton
              icon={<List className="size-4" />}
              label="列表"
              onClick={() => onInsert("- ", "")}
            />
          </div>

          {/* Right: more */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={<MoreHorizontal className="size-4" />}
              label="更多"
              onClick={onShowMore}
              highlight
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  highlight?: boolean;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  highlight = false,
}: ToolbarButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`flex flex-col items-center justify-center min-w-[48px] h-12 px-2 rounded-lg transition-colors ${
        highlight
          ? "bg-cyan-50 text-cyan-600 hover:bg-cyan-100"
          : "text-slate-600 hover:bg-slate-100"
      }`}
      aria-label={label}
      type="button"
    >
      <div className="flex items-center justify-center h-5">{icon}</div>
      <span className="text-[10px] mt-0.5 leading-none">{label}</span>
    </Button>
  );
}
