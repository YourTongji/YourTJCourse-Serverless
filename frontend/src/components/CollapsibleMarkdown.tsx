import { useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

interface CollapsibleMarkdownProps {
  content: string
  maxLength?: number
}

const ICU_SECTION_HEADINGS = [
  '课程内容',
  '上课自由度',
  '考核标准',
  '授课质量',
]

const REVIEW_SECTION_HEADINGS = [
  ...ICU_SECTION_HEADINGS,
  '考核方式',
  '授课质量与给分',
  '上课学期',
  '作业与考核',
  '给分情况',
  '作业量',
  '考试难度',
]

const SECTION_HEADING_PATTERN = REVIEW_SECTION_HEADINGS
  .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

export const markdownContentClassName = 'leading-relaxed text-slate-600 [&_a]:text-cyan-600 [&_a]:underline [&_a]:hover:text-cyan-700 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:my-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:my-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h5]:my-2 [&_h5]:text-sm [&_h5]:font-semibold [&_h6]:my-2 [&_h6]:text-sm [&_h6]:font-semibold [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100'

function normalizeMarkdownSections(text: string) {
  const raw = typeof text === 'string' ? text : ''
  if (!raw) return ''

  const standaloneHeadingPattern = new RegExp(`^\\s*(${SECTION_HEADING_PATTERN})[：:]?\\s*$`)
  const inlineHeadingPattern = new RegExp(`(${SECTION_HEADING_PATTERN})[：:]`, 'g')

  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s{0,3}#{1,6}\s/.test(line)) return line.trimEnd()

      const standaloneMatch = line.match(standaloneHeadingPattern)
      if (standaloneMatch) return `## ${standaloneMatch[1]}`

      if (!inlineHeadingPattern.test(line)) return line.trimEnd()

      return line
        .replace(inlineHeadingPattern, '\n## $1\n')
        .replace(/^\n+/, '')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

export function renderMarkdownHtml(text: string) {
  const raw = normalizeMarkdownSections(text)
  marked.setOptions({
    gfm: true,
    breaks: true,
  })
  const html = marked.parse(raw) as string
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

export default function CollapsibleMarkdown({ content, maxLength = 300 }: CollapsibleMarkdownProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const shouldCollapse = content.length > maxLength
  const displayContent = shouldCollapse && !isExpanded
    ? content.substring(0, maxLength) + '...'
    : content

  return (
    <div>
      <div
        className={markdownContentClassName}
        dangerouslySetInnerHTML={{
          __html: renderMarkdownHtml(displayContent)
        }}
      />
      {shouldCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 px-4 py-1.5 bg-cyan-500 text-white text-xs font-semibold rounded-lg hover:bg-cyan-600 transition-all shadow-sm"
        >
          {isExpanded ? '收起 ▲' : '展开 ▼'}
        </button>
      )}
    </div>
  )
}
