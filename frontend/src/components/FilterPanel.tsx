import { useEffect, useMemo, useState } from 'react'
import { useDraggableDesktop } from '../utils/useDraggableDesktop'

export interface FilterState {
  selectedDepartments: string[]
  onlyWithReviews: boolean
  courseName: string
  courseCode: string
  teacherCode: string
  teacherName: string
  campus: string
}

interface FilterPanelProps {
  value: FilterState
  onFilterChange: (filters: FilterState) => void
  departments: string[]
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr))
}

export default function FilterPanel({ value, onFilterChange, departments }: FilterPanelProps) {
  const API_BASE = import.meta.env.VITE_API_URL || ''
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<FilterState>(value)
  const [searchTerm, setSearchTerm] = useState('')
  const [campusOptions, setCampusOptions] = useState<Array<{ campusId: string; campusName: string }>>([])
  const [campusPickerOpen, setCampusPickerOpen] = useState(false)
  const [campusSearch, setCampusSearch] = useState('')
  const drag = useDraggableDesktop('yourtj_floating_filter_pos', { x: 0, y: 0 })

  const openPanel = () => {
    window.dispatchEvent(new CustomEvent('yourtj-floating-open', { detail: { panel: 'filter' } }))
    setIsOpen(true)
  }

  useEffect(() => {
    const onOtherOpen = (e: any) => {
      const panel = String(e?.detail?.panel || '')
      if (panel === 'wallet') {
        setIsOpen(false)
        setCampusPickerOpen(false)
      }
    }
    window.addEventListener('yourtj-floating-open', onOtherOpen as any)
    return () => window.removeEventListener('yourtj-floating-open', onOtherOpen as any)
  }, [])

  useEffect(() => {
    setDraft(value)
  }, [value])

  const activeCount =
    (value.onlyWithReviews ? 1 : 0) +
    value.selectedDepartments.length +
    (value.courseName ? 1 : 0) +
    (value.courseCode ? 1 : 0) +
    (value.teacherCode ? 1 : 0) +
    (value.teacherName ? 1 : 0) +
    (value.campus ? 1 : 0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [campusRes] = await Promise.all([fetch(`${API_BASE}/api/getAllCampus`).then((r) => r.json())])
        if (cancelled) return

        const campuses: Array<{ campusId: string; campusName: string }> = Array.isArray(campusRes?.data) ? campusRes.data : []

        // 去重（按 name）
        const campusUniq = Array.from(new Map(campuses.map((c) => [c.campusName, c])).values()).sort((a, b) =>
          String(a.campusName || '').localeCompare(String(b.campusName || ''), 'zh-CN')
        )

        setCampusOptions(campusUniq)
      } catch (_e) {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [API_BASE])

  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [departments])

  const filteredDepartments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return sortedDepartments
    return sortedDepartments.filter((d) => d.toLowerCase().includes(q))
  }, [searchTerm, sortedDepartments])

  const toggleDepartment = (dept: string) => {
    setDraft((prev) => {
      const exists = prev.selectedDepartments.includes(dept)
      const next = exists ? prev.selectedDepartments.filter((d) => d !== dept) : [...prev.selectedDepartments, dept]
      return { ...prev, selectedDepartments: next }
    })
  }

  const removeDepartment = (dept: string) => {
    setDraft((prev) => ({ ...prev, selectedDepartments: prev.selectedDepartments.filter((d) => d !== dept) }))
  }

  const apply = () => {
    onFilterChange({
      selectedDepartments: uniq(draft.selectedDepartments),
      onlyWithReviews: !!draft.onlyWithReviews,
      courseName: draft.courseName.trim(),
      courseCode: draft.courseCode.trim(),
      teacherCode: draft.teacherCode.trim(),
      teacherName: draft.teacherName.trim(),
      campus: draft.campus
    })
    setIsOpen(false)
  }

  const resetAndApply = () => {
    const cleared: FilterState = {
      selectedDepartments: [],
      onlyWithReviews: false,
      courseName: '',
      courseCode: '',
      teacherCode: '',
      teacherName: '',
      campus: ''
    }
    setDraft(cleared)
    setSearchTerm('')
    onFilterChange(cleared)
    setIsOpen(false)
  }

  const filterIcon = (
    <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 5h18M6 12h12M10 19h4"
      />
    </svg>
  )

  const content = (
    <div className="p-4 space-y-4 max-h-[calc(100vh-190px)] overflow-y-auto">
      {campusPickerOpen && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/25 backdrop-blur-sm" onClick={() => setCampusPickerOpen(false)} />
          <div className="fixed inset-x-4 bottom-4 z-[90] max-h-[70vh] rounded-3xl bg-white shadow-2xl border border-white/60 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-slate-800">选择校区</div>
              <button
                type="button"
                className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                onClick={() => setCampusPickerOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <input
                type="text"
                placeholder="搜索校区..."
                value={campusSearch}
                onChange={(e) => setCampusSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none bg-white"
              />
            </div>
            <div className="px-2 pb-3 max-h-[calc(70vh-132px)] overflow-y-auto">
              {(() => {
                const q = campusSearch.trim().toLowerCase()
                const list = q ? campusOptions.filter((c) => String(c.campusName || '').toLowerCase().includes(q)) : campusOptions
                return (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((p) => ({ ...p, campus: '' }))
                        setCampusPickerOpen(false)
                      }}
                      className={`w-full px-3 py-3 rounded-2xl flex items-center justify-between border ${
                        !draft.campus ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-sm font-bold text-slate-700">不限</span>
                      {!draft.campus && <span className="text-cyan-600 font-black">✓</span>}
                    </button>
                    {list.map((c) => {
                      const selected = draft.campus === c.campusId
                      return (
                        <button
                          key={c.campusId || c.campusName}
                          type="button"
                          onClick={() => {
                            setDraft((p) => ({ ...p, campus: c.campusId }))
                            setCampusPickerOpen(false)
                          }}
                          className={`w-full px-3 py-3 rounded-2xl flex items-center justify-between border ${
                            selected ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-sm font-semibold text-slate-700 truncate">{c.campusName}</span>
                          {selected && <span className="text-cyan-600 font-black">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm font-extrabold text-slate-800">高级筛选</div>
        <button
          type="button"
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-600"
          onClick={() => setIsOpen(false)}
          aria-label="关闭"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={resetAndApply}
          className="py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
        >
          重置
        </button>
        <button
          type="button"
          onClick={apply}
          className="py-2.5 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700"
        >
          应用
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
        <div className="text-sm font-extrabold text-slate-800 mb-2">检索条件</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] font-bold text-slate-600 mb-1">课程名称</div>
            <input
              type="text"
              placeholder="如：高等数学"
              value={draft.courseName}
              onChange={(e) => setDraft((p) => ({ ...p, courseName: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none bg-white"
            />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-600 mb-1">课程代码</div>
            <input
              type="text"
              placeholder="如：TJ12345"
              value={draft.courseCode}
              onChange={(e) => setDraft((p) => ({ ...p, courseCode: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none bg-white"
            />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-600 mb-1">教师工号</div>
            <input
              type="text"
              placeholder="如：20231234"
              value={draft.teacherCode}
              onChange={(e) => setDraft((p) => ({ ...p, teacherCode: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none bg-white"
            />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-600 mb-1">教师姓名</div>
            <input
              type="text"
              placeholder="如：张三"
              value={draft.teacherName}
              onChange={(e) => setDraft((p) => ({ ...p, teacherName: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none bg-white"
            />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-600 mb-1">校区</div>
            <button
              type="button"
              onClick={() => setCampusPickerOpen(true)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {draft.campus
                  ? campusOptions.find((c) => c.campusId === draft.campus)?.campusName || '已选择'
                  : '不限'}
              </span>
              <svg className="w-4 h-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-700">只看有评价的课程</div>
            <div className="text-[11px] text-slate-500 truncate">过滤掉暂无评价的课程条目</div>
          </div>
          <input
            type="checkbox"
            checked={draft.onlyWithReviews}
            onChange={(e) => setDraft((p) => ({ ...p, onlyWithReviews: e.target.checked }))}
            className="w-5 h-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-extrabold text-slate-800">开课单位</div>
          {draft.selectedDepartments.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft((p) => ({ ...p, selectedDepartments: [] }))}
              className="text-xs font-bold text-cyan-700 hover:text-cyan-800"
            >
              清空
            </button>
          )}
        </div>

        <div className="mt-2">
          <input
            type="text"
            placeholder="搜索单位..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none bg-white"
          />
        </div>

        {draft.selectedDepartments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.selectedDepartments.slice(0, 8).map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => removeDepartment(dept)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-50 border border-cyan-100 text-xs font-bold text-cyan-700"
                title="点击移除"
              >
                <span className="max-w-[220px] truncate">{dept}</span>
                <span className="text-cyan-600">×</span>
              </button>
            ))}
            {draft.selectedDepartments.length > 8 && (
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
                +{draft.selectedDepartments.length - 8}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {filteredDepartments.length === 0 ? (
            <div className="p-4 text-sm text-slate-400 text-center">没有匹配的单位</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredDepartments.map((dept) => {
                const selected = draft.selectedDepartments.includes(dept)
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDepartment(dept)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm font-semibold text-slate-700 truncate">{dept}</span>
                    <span
                      className={`w-5 h-5 rounded-lg border grid place-items-center text-xs font-black ${
                        selected ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  )

  return (
    <>
      {/* Desktop: right floating panel */}
      <div className="hidden md:block fixed right-6 top-24 z-40">
        <div
          className={`bg-white/90 backdrop-blur-xl border border-slate-200 shadow-xl rounded-2xl transition-all duration-300 ${
            isOpen ? 'w-[380px]' : 'w-14'
          }`}
          style={drag.style as any}
        >
          <button
            type="button"
            data-tour="tour-filter-floating"
            {...(drag.dragHandleProps as any)}
            onClick={() => {
              if (drag.consumeDragFlag()) return
              if (isOpen) setIsOpen(false)
              else openPanel()
            }}
            className="relative h-14 w-full flex items-center justify-center hover:bg-slate-50 rounded-2xl transition-colors"
            title={isOpen ? '收起筛选' : '展开筛选'}
          >
            {filterIcon}
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-700 yourtj-font-brand">
              筛选
            </span>
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
          {isOpen && content}
        </div>
      </div>

      {/* Mobile: floating button + bottom sheet */}
      <div className="md:hidden fixed right-4 bottom-24 z-50">
        <button
          type="button"
          data-tour="tour-filter-floating"
          onClick={openPanel}
          className="relative h-14 w-14 rounded-2xl bg-white/90 backdrop-blur-xl border border-white/50 shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          aria-label="打开筛选"
        >
          {filterIcon}
          <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] leading-none text-cyan-700 yourtj-font-brand">
            筛选
          </span>
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
            <div className="fixed inset-x-3 bottom-3 max-h-[78vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-white/60">
              {content}
            </div>
          </>
        )}
      </div>
    </>
  )
}
