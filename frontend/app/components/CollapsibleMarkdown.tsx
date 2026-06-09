import { useState } from "react";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

interface CollapsibleMarkdownProps {
  content: string;
  maxLength?: number;
}

const ICU_SECTION_HEADINGS = [
  "课程内容",
  "上课自由度",
  "考核标准",
  "授课质量",
];

const REVIEW_SECTION_HEADINGS = [
  ...ICU_SECTION_HEADINGS,
  "考核方式",
  "授课质量与给分",
  "上课学期",
  "作业与考核",
  "给分情况",
  "作业量",
  "考试难度",
];

const SECTION_HEADING_PATTERN = REVIEW_SECTION_HEADINGS
  .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const INVISIBLE_MARKDOWN_CHARS = /[\u200B\u200C\u200D\uFEFF\u2060]/g;
const LEADING_UNICODE_SPACES = /^[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/;
const INDENT_PRESERVE_EXCLUDE_PATTERN =
  /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|\|.*|\*{3,}\s*$|-{3,}\s*$|_{3,}\s*$)/;

export const markdownContentClassName =
  "yourtj-markdown leading-relaxed text-slate-600 [&_a]:text-cyan-600 [&_a]:underline [&_a]:hover:text-cyan-700 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:my-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:my-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h5]:my-1.5 [&_h5]:text-sm [&_h6]:my-1 [&_h6]:text-xs [&_h6]:font-semibold [&_blockquote]:border-l-4 [&_blockquote]:border-cyan-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_pre]:my-3 [&_pre]:rounded-xl [&_pre]:bg-slate-50 [&_pre]:p-4 [&_pre]:text-sm [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:my-6 [&_hr]:border-slate-200 [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_thead]:border-b-2 [&_thead]:border-slate-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-slate-100";

// ─── Shared markdown-it instance ──────────────────────────────────────────────

const markdownRenderer = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
});

type MarkdownRenderRule = NonNullable<
  typeof markdownRenderer.renderer.rules.link_open
>;

const defaultLinkOpenRule: MarkdownRenderRule =
  markdownRenderer.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx].attrGet("href") || "").trim();
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpenRule(tokens, idx, options, env, self);
};

const defaultImageRule: MarkdownRenderRule =
  markdownRenderer.renderer.rules.image ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

markdownRenderer.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("loading", "lazy");
  tokens[idx].attrSet("decoding", "async");
  return defaultImageRule(tokens, idx, options, env, self);
};

markdownRenderer.renderer.rules.table_open = () =>
  '<div class="yourtj-md-table-wrap"><table>';
markdownRenderer.renderer.rules.table_close = () => "</table></div>";

// ─── Normalize sections ───────────────────────────────────────────────────────

function normalizeMarkdownSections(text: string) {
  const raw = typeof text === "string" ? text : "";
  if (!raw) return "";

  const standaloneHeadingPattern = new RegExp(
    `^\\s*(${SECTION_HEADING_PATTERN})[：:]?\\s*$`,
  );
  const inlineHeadingTestPattern = new RegExp(
    `(${SECTION_HEADING_PATTERN})[：:]`,
  );
  const inlineHeadingReplacePattern = new RegExp(
    `(${SECTION_HEADING_PATTERN})[：:]`,
    "g",
  );
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];
  let inFence = false;

  for (const originalLine of lines) {
    let line = originalLine
      .replace(INVISIBLE_MARKDOWN_CHARS, "")
      .replace(LEADING_UNICODE_SPACES, (spaces) =>
        " ".repeat(spaces.length),
      );
    const trimmedStartLine = line.trimStart();

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      normalized.push(line.trimEnd());
      continue;
    }

    if (inFence) {
      normalized.push(line);
      continue;
    }

    if (/^\s{0,3}#{1,6}\s/.test(trimmedStartLine)) {
      normalized.push(trimmedStartLine.trimEnd());
      continue;
    }

    const standaloneMatch = trimmedStartLine.match(standaloneHeadingPattern);
    if (standaloneMatch) {
      normalized.push(`## ${standaloneMatch[1]}`);
      continue;
    }

    if (inlineHeadingTestPattern.test(trimmedStartLine)) {
      normalized.push(
        trimmedStartLine
          .replace(inlineHeadingReplacePattern, "\n## $1\n")
          .replace(/^\n+/, "")
          .replace(/\n{3,}/g, "\n\n")
          .trimEnd(),
      );
      continue;
    }

    const leadingWhitespace = line.match(/^[ \t]+/)?.[0] ?? "";
    const trimmed = line.trimStart();
    if (
      leadingWhitespace &&
      trimmed &&
      !INDENT_PRESERVE_EXCLUDE_PATTERN.test(trimmed)
    ) {
      const indentWidth = leadingWhitespace.replace(/\t/g, "    ").length;
      line = `${"&nbsp;".repeat(indentWidth)}${trimmed}`;
    }

    normalized.push(line.trimEnd());
  }

  return normalized.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ─── Exported renderer ────────────────────────────────────────────────────────

export function renderMarkdownHtml(text: string): string {
  const raw = normalizeMarkdownSections(text);
  const html = markdownRenderer.render(raw);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["class", "target", "rel", "loading", "decoding"],
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CollapsibleMarkdown({
  content,
  maxLength = 300,
}: CollapsibleMarkdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldCollapse = content.length > maxLength;
  const displayContent =
    shouldCollapse && !isExpanded
      ? content.substring(0, maxLength) + "..."
      : content;

  return (
    <div>
      <div
        className={markdownContentClassName}
        dangerouslySetInnerHTML={{
          __html: renderMarkdownHtml(displayContent),
        }}
      />
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 px-4 py-1.5 bg-cyan-500 text-white text-xs font-semibold rounded-lg hover:bg-cyan-600 transition-all shadow-sm"
        >
          {isExpanded ? "收起 ▲" : "展开 ▼"}
        </button>
      )}
    </div>
  );
}
