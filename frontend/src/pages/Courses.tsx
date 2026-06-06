import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fetchCourses, fetchDepartments } from '../services/api'
import { formatSemesterLabel, semesterLabelScore } from '../utils/format'
import GlassCard from '../components/GlassCard'
import Logo from '../components/Logo'
import FilterPanel, { FilterState } from '../components/FilterPanel'

interface CourseItem {
  id: number
  code: string
  name: string
  rating: number
  review_count: number
  teacher_name: string
  semesters?: string[]
  department?: string
  credit?: number
  is_legacy?: number
}

const DEFAULT_FILTERS: FilterState = {
  selectedDepartments: [],
  onlyWithReviews: false,
  courseName: '',
  courseCode: '',
  teacherCode: '',
  teacherName: '',
  campus: ''
}

const SEARCH_PLACEHOLDERS = [
  '搜索课程名、代码或教师…',
  '试试\u201c高等数学\u201d\u201c线性代数\u201d\u2026',
  '从真实评价里找到更适合你的课程…'
]

const PAGE_SIZE = 20

function parseSearchState(search: string) {
  const params = new URLSearchParams(search)

  return {
    keyword: params.get('q') || '',
    page: Math.max(1, Number(params.get('page') || '1') || 1),
    filters: {
      selectedDepartments: (params.get('departments') || '').split(',').map((item) => item.trim()).filter(Boolean),
      onlyWithReviews: params.get('onlyWithReviews') === 'true',
      courseName: params.get('courseName') || '',
      courseCode: params.get('courseCode') || '',
      teacherCode: params.get('teacherCode') || '',
      teacherName: params.get('teacherName') || '',
      campus: params.get('campus') || ''
    } as FilterState
  }
}

function buildSearchQuery(keyword: string, page: number, filters: FilterState) {
  const params = new URLSearchParams()

  if (keyword.trim()) params.set('q', keyword.trim())
  if (page > 1) params.set('page', String(page))
  if (filters.selectedDepartments.length > 0) params.set('departments', filters.selectedDepartments.join(','))
  if (filters.onlyWithReviews) params.set('onlyWithReviews', 'true')
  if (filters.courseName) params.set('courseName', filters.courseName)
  if (filters.courseCode) params.set('courseCode', filters.courseCode)
  if (filters.teacherCode) params.set('teacherCode', filters.teacherCode)
  if (filters.teacherName) params.set('teacherName', filters.teacherName)
  if (filters.campus) params.set('campus', filters.campus)

  return params.toString()
}



function hashCourseOrder(input: string) {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function hasActiveFilters(filters: FilterState) {
  return Boolean(
    filters.selectedDepartments.length
    || filters.onlyWithReviews
    || filters.courseName.trim()
    || filters.courseCode.trim()
    || filters.teacherCode.trim()
    || filters.teacherName.trim()
    || filters.campus.trim()
  )
}

function shuffleCoursesForSession(courses: CourseItem[], seed: string) {
  return [...courses].sort((left, right) => {
    const leftScore = hashCourseOrder(`${seed}-${left.id}-${left.code}`)
    const rightScore = hashCourseOrder(`${seed}-${right.id}-${right.code}`)
    return leftScore - rightScore
  })
}

export default function Courses() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialStateRef = useRef(parseSearchState(location.search))
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [keyword, setKeyword] = useState(initialStateRef.current.keyword)
  const [loading, setLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [showLegacyDocs, setShowLegacyDocs] = useState(() => {
    try {
      return localStorage.getItem('yourtj_show_legacy_docs') === '1'
    } catch {
      return false
    }
  })
  const [legacyLoaded, setLegacyLoaded] = useState(false)
  const [legacyReady, setLegacyReady] = useState(false)
  const [legacyProgress, setLegacyProgress] = useState(0)
  const [legacyIsFirstOpen, setLegacyIsFirstOpen] = useState(() => {
    try {
      return localStorage.getItem('yourtj_wlc_first_ready') !== '1'
    } catch {
      return true
    }
  })
  const legacyIframeRef = useRef<HTMLIFrameElement | null>(null)
  const legacyUrl = '/wlc/index.html'
  const [page, setPage] = useState(initialStateRef.current.page)
  const [hasMore, setHasMore] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const [filters, setFilters] = useState<FilterState>(initialStateRef.current.filters || DEFAULT_FILTERS)
  const [typingPlaceholder, setTypingPlaceholder] = useState('')
  const [expandedSemesterCourseId, setExpandedSemesterCourseId] = useState<number | null>(null)
  const [sessionShuffleSeed] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const syncUrl = (nextKeyword: string, nextPage: number, nextFilters: FilterState) => {
    const nextSearch = buildSearchQuery(nextKeyword, nextPage, nextFilters)
    const currentSearch = location.search.replace(/^\?/, '')

    if (nextSearch === currentSearch) return

    navigate(
      {
        pathname: '/',
        search: nextSearch ? `?${nextSearch}` : ''
      },
      { replace: true }
    )
  }

  const search = async (nextPage = 1, nextKeyword = keyword, nextFilters = filters) => {
    setLoading(true)
    setError('')
    syncUrl(nextKeyword, nextPage, nextFilters)

    try {
      const data = await fetchCourses(nextKeyword, undefined, nextPage, PAGE_SIZE, {
        departments: nextFilters.selectedDepartments,
        onlyWithReviews: nextFilters.onlyWithReviews,
        courseName: nextFilters.courseName,
        courseCode: nextFilters.courseCode,
        teacherCode: nextFilters.teacherCode,
        teacherName: nextFilters.teacherName,
        campus: nextFilters.campus
      }, {
        includeTotal: true
      })

      const nextCourses = Array.isArray(data.data) ? data.data : []
      const shouldShuffle = !nextKeyword.trim() && nextPage === 1 && !hasActiveFilters(nextFilters)

      if (nextPage > 1) {
        setCourses((prev) => [...prev, ...(shouldShuffle ? shuffleCoursesForSession(nextCourses, sessionShuffleSeed) : nextCourses)])
      } else {
        setCourses(shouldShuffle ? shuffleCoursesForSession(nextCourses, sessionShuffleSeed) : nextCourses)
      }
      setHasMore(Boolean(data.hasMore))
      setPage(nextPage)
    } catch (err) {
      console.error('Failed to fetch courses:', err)
      setError('加载失败，请稍后重试')
      setCourses([])
      setHasMore(false)
    } finally {
      setLoading(false)
      setIsSearching(false)
      setHasLoadedOnce(true)
    }
  }

  const loadDepartments = async () => {
    try {
      const data = await fetchDepartments(undefined)
      setDepartments(data.departments || [])
    } catch (err) {
      console.error('Failed to fetch departments:', err)
    }
  }

  const handleFilterChange = (nextFilters: FilterState) => {
    setFilters(nextFilters)
    setPage(1)
    void search(1, keyword, nextFilters)
  }

  const toggleLegacyDocs = () => {
    setShowLegacyDocs((current) => {
      const nextValue = !current
      try {
        localStorage.setItem('yourtj_show_legacy_docs', nextValue ? '1' : '0')
      } catch {
        // ignore
      }
      return nextValue
    })
  }

  const openLegacyDocsInNewWindow = () => {
    window.open(legacyUrl, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    let phraseIndex = 0
    let charIndex = 0
    let deleting = false
    let timer = 0

    const tick = () => {
      const current = SEARCH_PLACEHOLDERS[phraseIndex]

      if (deleting) {
        charIndex = Math.max(0, charIndex - 1)
      } else {
        charIndex = Math.min(current.length, charIndex + 1)
      }

      setTypingPlaceholder(current.slice(0, charIndex))

      if (!deleting && charIndex == current.length) {
        timer = window.setTimeout(() => {
          deleting = true
          tick()
        }, 1400)
        return
      }

      if (deleting && charIndex === 0) {
        deleting = false
        phraseIndex = (phraseIndex + 1) % SEARCH_PLACEHOLDERS.length
      }

      timer = window.setTimeout(tick, deleting ? 42 : 85)
    }

    tick()
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!showLegacyDocs) {
      setLegacyLoaded(false)
      setLegacyReady(false)
      setLegacyProgress(0)
      return
    }

    setLegacyLoaded(false)
    setLegacyReady(false)
    setLegacyProgress(0)
  }, [showLegacyDocs])

  useEffect(() => {
    if (!showLegacyDocs || !legacyIsFirstOpen) return

    let progress = 0
    setLegacyProgress(0)

    const timer = window.setInterval(() => {
      const target = 92
      const step = Math.max(0.6, (target - progress) * 0.12)
      progress = Math.min(target, progress + step)
      setLegacyProgress(progress)
    }, 120)

    return () => window.clearInterval(timer)
  }, [showLegacyDocs, legacyIsFirstOpen])

  useEffect(() => {
    if (!showLegacyDocs || !legacyLoaded) return

    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      const doc = legacyIframeRef.current?.contentDocument

      if (doc?.querySelector('.DocSearch-Button')) {
        window.clearInterval(timer)
        setLegacyReady(true)
        setLegacyProgress(100)

        if (legacyIsFirstOpen) {
          setLegacyIsFirstOpen(false)
          try {
            localStorage.setItem('yourtj_wlc_first_ready', '1')
          } catch {
            // ignore
          }
        }
      }

      if (tries > 160) {
        window.clearInterval(timer)
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [showLegacyDocs, legacyLoaded, legacyIsFirstOpen])

  useEffect(() => {
    void loadDepartments()
    void search(initialStateRef.current.page, initialStateRef.current.keyword, initialStateRef.current.filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ keyword?: string }>
      const nextKeyword = String(custom.detail?.keyword || '').trim()
      if (!nextKeyword) return
      setKeyword(nextKeyword)
      window.setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 80)
    }

    window.addEventListener('yourtj-tour-fill-search', handler as EventListener)
    return () => window.removeEventListener('yourtj-tour-fill-search', handler as EventListener)
  }, [])

  const tourTargetCourseId = courses.find((course) => (
    String(course.id) === '1286'
    || String(course.name || '').includes('评论区测试')
  ))?.id

  // Only show the full-page skeleton on the very first load; keep the existing
  // list visible while re-searching or appending ("加载更多").
  const isInitialLoading = loading && courses.length === 0

  return (
    <div className="space-y-4 md:space-y-4">
      <FilterPanel
        value={filters}
        departments={departments}
        onFilterChange={handleFilterChange}
      />

      <GlassCard className="relative min-h-[160px] overflow-hidden bg-gradient-to-r from-cyan-50 to-white" hover={false}>
        <div className="absolute right-0 top-0 p-6 opacity-10">
          <svg className="h-32 w-32 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="relative z-10 max-w-2xl">
          <h2 className="animate-fade-in mb-2 text-2xl font-black tracking-tight text-slate-800 md:text-3xl">探索同济大学精彩课程</h2>
          <p className="animate-fade-in mb-5 text-sm text-slate-500 md:text-base" style={{ animationDelay: '0.15s' }}>不记名、自由、简洁、高效的选课社区</p>

          <div className="flex items-center gap-2 rounded-2xl border border-cyan-100 bg-white p-2 shadow-sm transition-all duration-300 focus-within:border-cyan-300 focus-within:shadow-[0_0_20px_-4px_rgba(6,182,212,0.25)] focus-within:ring-2 focus-within:ring-cyan-400">
            <svg className="ml-2 h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              data-tour="tour-search-input"
              type="text"
              name="course-search"
              autoComplete="off"
              aria-label="搜索课程"
              placeholder={typingPlaceholder || '搜索课程名、代码或教师…'}
              className="h-10 min-w-0 w-full border-none bg-transparent text-slate-700 outline-none placeholder:text-slate-500 placeholder:font-medium"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  window.dispatchEvent(new CustomEvent('yourtj-tour-search-clicked'))
                  setIsSearching(true)
                  void search(1)
                }
              }}
            />
            <button
              data-tour="tour-search-button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('yourtj-tour-search-clicked'))
                setIsSearching(true)
                void search(1)
              }}
              disabled={loading}
              className="shrink-0 whitespace-nowrap rounded-xl bg-slate-800 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50 md:px-6"
            >
              {loading && isSearching ? '搜索中…' : '搜索'}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={toggleLegacyDocs}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
            >
              查阅旧乌龙茶文档
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h6m0 0v6m0-6L10 16m-1 5H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v4" />
              </svg>
            </button>
          </div>
        </div>
      </GlassCard>

      {showLegacyDocs && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_4px_20px_-4px_rgba(6,182,212,0.12)]">
          {legacyIsFirstOpen && !legacyReady && (
            <div className="px-5 pt-5">
              <div className="overflow-hidden rounded-2xl border border-orange-100 bg-orange-50/90">
                <div className="px-4 py-3 text-sm font-semibold text-orange-800">
                  首次加载旧文档需要一点时间，等搜索框出现后即可正常使用。
                </div>
                <div className="relative h-2 bg-orange-100/70">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-orange-500"
                    style={{ width: `${Math.max(0, Math.min(100, legacyProgress))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-black text-slate-800">旧乌龙茶课程文档</div>
              <div className="text-xs text-slate-500">保留历史资料入口，首次加载完成后会自动缓存。</div>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <button
                type="button"
                onClick={openLegacyDocsInNewWindow}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                新窗口打开
              </button>
              <button
                type="button"
                onClick={toggleLegacyDocs}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                收起
              </button>
            </div>
          </div>

          <div className="relative h-[76vh] bg-slate-50">
            {!legacyReady && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/75 backdrop-blur-sm">
                <Logo size={50} animate />
                <p className="text-sm font-medium text-slate-500">历史文档加载中…</p>
              </div>
            )}
            <iframe
              ref={legacyIframeRef}
              src={legacyUrl}
              title="旧乌龙茶课程文档"
              className="h-full w-full border-0"
              onLoad={() => {
                setLegacyLoaded(true)
                setLegacyReady(true)
                setLegacyProgress(100)

                if (legacyIsFirstOpen) {
                  setLegacyIsFirstOpen(false)
                  try {
                    localStorage.setItem('yourtj_wlc_first_ready', '1')
                  } catch {
                    // ignore
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      <div className="min-h-[60vh]">
        {isInitialLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4">
            {[1, 2, 3, 4, 5, 6].map((skeleton) => (
              <div
                key={skeleton}
                className="animate-pulse rounded-[20px] border border-slate-100 bg-white/80 p-4"
                style={{ animationDelay: '0s', animation: 'pulse 2s ease-in-out infinite' }}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="h-5 w-20 rounded-md bg-slate-100" />
                  <div className="h-6 w-24 rounded-md bg-slate-100" />
                </div>
                <div className="mb-2 h-5 w-3/4 rounded-md bg-slate-100" />
                <div className="mb-1.5 h-3.5 w-1/2 rounded-md bg-slate-100" />
                <div className="mb-3 h-3.5 w-1/3 rounded-md bg-slate-100" />
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="h-4 w-20 rounded-md bg-slate-100" />
                  <div className="h-4 w-16 rounded-md bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="py-10 text-center">
            <p className="mb-4 text-red-500">{error}</p>
            <button
              onClick={() => void search(page)}
              className="rounded-xl bg-slate-800 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-slate-700"
            >
              重新加载
            </button>
          </div>
        )}

        {!isInitialLoading && !error && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4">
              {courses.map((course, index) => {
                const semesters = Array.isArray(course.semesters) ? course.semesters.map(formatSemesterLabel).filter(Boolean) : []
                const uniqueSemesters = Array.from(new Set(semesters))
                const orderedSemesters = uniqueSemesters.slice().sort((left, right) => semesterLabelScore(right) - semesterLabelScore(left))
                const recentSemester = orderedSemesters[0] || ''
                const historySemesters = orderedSemesters.slice(1)
                const hiddenCount = Math.max(0, orderedSemesters.length - 1)
                const isSemesterExpanded = expandedSemesterCourseId === course.id
                const historyToShow = historySemesters.slice(0, 6)
                const omittedHistoryCount = Math.max(0, historySemesters.length - historyToShow.length)

                return (
                  <Link
                    key={course.id}
                    to={`/course/${course.id}`}
                    data-tour={course.id === tourTargetCourseId ? 'tour-course-target' : undefined}
                    className="block h-full"
                  >
                    <GlassCard hover={false} className="animate-scale-in group flex min-h-[172px] flex-col justify-between border-white/70 bg-white/80 !p-4 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_-8px_rgba(6,182,212,0.22)] hover:border-cyan-200/80" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
                      <div>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-bold tracking-wide ${course.is_legacy ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-cyan-100 bg-cyan-50 text-cyan-700'}`}>
                            {course.code}
                          </span>

                          {course.rating > 0 ? (
                            <div className="flex items-center gap-1 rounded-md border border-amber-100 bg-amber-50 px-2 py-1">
                              <span className="text-sm font-extrabold text-amber-500">{course.rating.toFixed(1)}</span>
                              <div className="flex">
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <div key={score} className={`mx-[1px] h-1.5 w-1.5 rounded-full ${score <= Math.round(course.rating || 0) ? 'bg-amber-400' : 'bg-slate-200'}`} />
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-400">无评分</span>
                          )}
                        </div>

                        <h3 className="mb-1 line-clamp-1 text-base font-bold text-slate-800 transition-colors group-hover:text-cyan-700 md:text-lg">
                          {course.name}
                        </h3>

                        <div className="space-y-2">
                          <p className="min-w-0 truncate text-sm text-slate-500">{course.teacher_name || '未知教师'}</p>
                          {recentSemester && (
                            <div className="flex flex-wrap items-center gap-1.5 overflow-visible">
                              <span
                                className="whitespace-nowrap rounded-full border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-[10px] font-black text-cyan-700"
                              >
                                最近 {recentSemester}
                              </span>

                              {hiddenCount > 0 && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="whitespace-nowrap rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] font-black text-pink-700 transition-colors hover:bg-pink-100"
                                  aria-label={`展开历史学期，共 ${hiddenCount} 个`}
                                  aria-expanded={isSemesterExpanded}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setExpandedSemesterCourseId((current) => (current === course.id ? null : course.id))
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      setExpandedSemesterCourseId((current) => (current === course.id ? null : course.id))
                                    }
                                  }}
                                >
                                  +{hiddenCount}
                                </span>
                              )}

                              <div
                                className={`basis-full overflow-hidden transition-[max-height,opacity,transform] ${isSemesterExpanded ? 'max-h-20 opacity-100 translate-y-0 duration-200' : 'max-h-0 opacity-0 -translate-y-1 duration-150'}`}
                                aria-hidden={!isSemesterExpanded}
                              >
                                <div className="flex flex-wrap items-center gap-1 pt-1">
                                  {historyToShow.map((semester, index) => (
                                    <span
                                      key={`${course.id}-${semester}`}
                                      className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 transition-all"
                                      style={{ transitionDelay: isSemesterExpanded ? `${index * 35}ms` : '0ms' }}
                                    >
                                      {semester}
                                    </span>
                                  ))}
                                  {omittedHistoryCount > 0 && (
                                    <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                      另 {omittedHistoryCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-xs text-slate-400">{course.review_count} 条评论</span>
                        <span className="inline-flex items-center text-xs font-semibold text-slate-400 transition-colors group-hover:text-cyan-600">
                          详细信息
                          <svg className="ml-1 h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </GlassCard>
                  </Link>
                )
              })}
            </div>

            {hasLoadedOnce && courses.length > 0 && hasMore && (
              <div className="flex justify-center pt-4 pb-2">
                <button
                  onClick={() => void search(page + 1)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-3 text-sm font-bold text-slate-600 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_8px_20px_-8px_rgba(6,182,212,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      加载中…
                    </>
                  ) : (
                    <>
                      加载更多课程
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}

            {hasLoadedOnce && courses.length > 0 && !hasMore && (
              <div className="pt-4 pb-2 text-center">
                <p className="text-xs text-slate-400">已显示全部课程</p>
              </div>
            )}

            {hasLoadedOnce && courses.length === 0 && (
              <div className="animate-fade-in rounded-3xl border border-dashed border-slate-300 bg-white/50 py-20 text-center">
                <p className="text-slate-400">没有找到相关课程，换个关键词试试吧。</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
