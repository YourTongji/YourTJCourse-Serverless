import { useState } from 'react'

interface CollapsibleMarkdownProps {
  content: string
  maxLength?: number
}

export function renderMarkdownHtml(text: string) {
  return text
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;" />')
    .replace(/^### (.*$)/gim, '<h3 class="text-base font-semibold my-2 text-slate-700">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-lg font-semibold my-3 text-slate-700">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-xl font-semibold my-4 text-slate-700">$1</h1>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-600 underline hover:text-cyan-700">$1</a>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/\n\n/g, '</p><p class="my-2 leading-relaxed">')
    .replace(/\n/g, '<br />')
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
        className="leading-relaxed text-slate-600"
        dangerouslySetInnerHTML={{
          __html: '<p class="my-2 leading-relaxed">' + renderMarkdownHtml(displayContent) + '</p>'
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
