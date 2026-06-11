interface MarkdownToolbarProps {
  onInsert: (before: string, after?: string) => void
  onShowMore: () => void
  className?: string
}

export default function MarkdownToolbar({ onInsert, onShowMore, className = '' }: MarkdownToolbarProps) {
  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40 pb-safe ${className}`} style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* 左侧：高频操作 */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              label="模板"
              onClick={() => onShowMore()}
            />
            <ToolbarButton
              icon={<span className="font-bold text-sm">B</span>}
              label="加粗"
              onClick={() => onInsert('**', '**')}
            />
            <ToolbarButton
              icon={<span className="italic text-sm">I</span>}
              label="斜体"
              onClick={() => onInsert('*', '*')}
            />
          </div>

          {/* 中间：常用格式 */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={<span className="font-bold text-sm">H</span>}
              label="标题"
              onClick={() => onInsert('## ', '')}
            />
            <ToolbarButton
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              }
              label="链接"
              onClick={() => onInsert('[', '](url)')}
            />
            <ToolbarButton
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              }
              label="列表"
              onClick={() => onInsert('- ', '')}
            />
          </div>

          {/* 右侧：更多选项 */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              }
              label="更多"
              onClick={onShowMore}
              highlight
            />
          </div>
        </div>
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  highlight?: boolean
}

function ToolbarButton({ icon, label, onClick, highlight = false }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center min-w-[48px] h-12 px-2 rounded-lg transition-colors ${
        highlight
          ? 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
      aria-label={label}
    >
      <div className="flex items-center justify-center h-5">{icon}</div>
      <span className="text-[10px] mt-0.5 leading-none">{label}</span>
    </button>
  )
}
