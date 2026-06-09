import { useMemo } from "react";
import DOMPurify from "dompurify";

interface MarkdownContentProps {
  content: string;
}

// TODO(M4): Replace with markdown-it for full Markdown rendering
function renderMarkdown(text: string): string {
  // Simple line-break-to-paragraph transformation
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const html = useMemo(() => {
    if (!content) return "";
    const raw = renderMarkdown(content);
    return DOMPurify.sanitize(raw);
  }, [content]);

  if (!content) {
    return (
      <p className="text-sm text-muted-foreground">暂无内容</p>
    );
  }

  return (
    <div
      className="prose prose-sm max-w-none text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
