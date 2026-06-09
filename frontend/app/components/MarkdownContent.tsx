import { useMemo } from "react";
import { renderMarkdownHtml } from "~/components/CollapsibleMarkdown";

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const html = useMemo(() => {
    if (!content) return "";
    return renderMarkdownHtml(content);
  }, [content]);

  if (!content) {
    return <p className="text-sm text-muted-foreground">暂无内容</p>;
  }

  return (
    <div
      className="prose prose-sm max-w-none text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
