import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import GlassCard from '../components/GlassCard'
import CollapsibleMarkdown from '../components/CollapsibleMarkdown'
import MarkdownEditor from '../components/MarkdownEditor'

const API_BASE = import.meta.env.VITE_API_URL || ''
const ACCESS_KEY = 'tjcourse2026admin'

type AnnouncementType = 'info' | 'warning' | 'error' | 'success'

interface Review {
  id: number
  sqid?: string
  course_id: number
  course_name: string
  code: string
  rating: number
  comment: string
  created_at: number
  is_hidden: number
  reviewer_name: string
  reviewer_avatar: string
}

interface Course {
  id: number
  code: string
  name: string
  credit: number
  department: string
  teacher_name: string
  review_count: number
  review_avg: number
  search_keywords: string
  is_legacy: number
}

interface AnnouncementDraft {
  id: string
  type: AnnouncementType
  content: string
  enabled: boolean
}

const emptyReviewForm = { comment: '', rating: 5, reviewer_name: '', reviewer_avatar: '' }
const emptyCourseForm = { code: '', name: '', credit: 0, department: '', teacher_name: '', search_keywords: '' }

export default function Admin() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const hasAccess = searchParams.get('access') === ACCESS_KEY

  const [secret, setSecret] = useState(localStorage.getItem('admin_secret') || '')
  const [isAuth, setIsAuth] = useState(false)
  const [activeTab, setActiveTab] = useState<'reviews' | 'courses' | 'settings'>('reviews')
  const [loading, setLoading] = useState(false)

  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewKeyword, setReviewKeyword] = useState('')
  const [reviewSearchInput, setReviewSearchInput] = useState('')
  const [reviewPage, setReviewPage] = useState(1)
  const [reviewTotalPages, setReviewTotalPages] = useState(1)
  const [reviewTotal, setReviewTotal] = useState(0)
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null)
  const [reviewEditForm, setReviewEditForm] = useState(emptyReviewForm)

  const [courses, setCourses] = useState<Course[]>([])
  const [courseKeyword, setCourseKeyword] = useState('')
  const [courseSearchInput, setCourseSearchInput] = useState('')
  const [coursePage, setCoursePage] = useState(1)
  const [courseTotalPages, setCourseTotalPages] = useState(1)
  const [courseTotal, setCourseTotal] = useState(0)
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null)
  const [courseEditForm, setCourseEditForm] = useState(emptyCourseForm)
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [newCourseForm, setNewCourseForm] = useState(emptyCourseForm)

  const [showLegacyReviews, setShowLegacyReviews] = useState(false)
  const [announcements, setAnnouncements] = useState<AnnouncementDraft[]>([])
  const [isSavingAnnouncements, setIsSavingAnnouncements] = useState(false)

  const getHeaders = () => ({ 'x-admin-secret': secret, 'Content-Type': 'application/json' })

  const createAnnouncement = (): AnnouncementDraft => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'info',
    content: '',
    enabled: true
  })

  const parseAnnouncements = (value: unknown): AnnouncementDraft[] => {
    if (!value || typeof value !== 'string') return []

    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) return []
      return parsed.map((item, index) => ({
        id: String(item?.id || `${Date.now()}-${index}`),
        type: ['info', 'warning', 'error', 'success'].includes(String(item?.type)) ? item.type : 'info',
        content: String(item?.content || ''),
        enabled: item?.enabled !== false
      }))
    } catch {
      return []
    }
  }

  const login = async () => {
    if (!secret) return
    localStorage.setItem('admin_secret', secret)
    await fetchReviews(1, reviewKeyword)
  }

  const fetchReviews = async (page = reviewPage, keyword = reviewKeyword) => {
    setLoading(true)
    try {
      let url = `${API_BASE}/api/admin/reviews?page=${page}&limit=20`
      if (keyword) url += `&q=${encodeURIComponent(keyword)}`
      const res = await fetch(url, { headers: getHeaders() })
      if (res.status === 401) {
        setIsAuth(false)
        return alert('管理密钥错误')
      }
      if (!res.ok) throw new Error('Failed to fetch reviews')
      const data = await res.json()
      setReviews(data.data || [])
      setReviewTotal(data.total || 0)
      setReviewPage(data.page || page)
      setReviewTotalPages(data.totalPages || 1)
      setIsAuth(true)
    } catch (error) {
      console.error(error)
      alert('获取评论失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleHide = async (id: number) => {
    setReviews((current) => current.map((review) => review.id === id ? { ...review, is_hidden: review.is_hidden ? 0 : 1 } : review))
    try {
      const res = await fetch(`${API_BASE}/api/admin/review/${id}/toggle`, { method: 'POST', headers: getHeaders() })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      void fetchReviews(reviewPage, reviewKeyword)
    }
  }

  const deleteReview = async (id: number) => {
    if (!confirm('确认删除这条评论吗？')) return
    try {
      const res = await fetch(`${API_BASE}/api/admin/review/${id}`, { method: 'DELETE', headers: getHeaders() })
      if (!res.ok) throw new Error('delete failed')
      void fetchReviews(reviewPage, reviewKeyword)
    } catch (error) {
      console.error(error)
      alert('删除失败')
    }
  }

  const saveReviewEdit = async () => {
    if (editingReviewId === null) return
    try {
      const res = await fetch(`${API_BASE}/api/admin/review/${editingReviewId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(reviewEditForm)
      })
      if (!res.ok) throw new Error('save failed')
      setEditingReviewId(null)
      setReviewEditForm(emptyReviewForm)
      void fetchReviews(reviewPage, reviewKeyword)
    } catch (error) {
      console.error(error)
      alert('保存评论失败')
    }
  }

  const fetchCourses = async (page = coursePage, keyword = courseKeyword) => {
    setLoading(true)
    try {
      let url = `${API_BASE}/api/admin/courses?page=${page}&limit=20`
      if (keyword) url += `&q=${encodeURIComponent(keyword)}`
      const res = await fetch(url, { headers: getHeaders() })
      if (res.status === 401) {
        setIsAuth(false)
        return alert('管理密钥错误')
      }
      if (!res.ok) throw new Error('Failed to fetch courses')
      const data = await res.json()
      setCourses(data.data || [])
      setCourseTotal(data.total || 0)
      setCoursePage(data.page || page)
      setCourseTotalPages(data.totalPages || 1)
      setIsAuth(true)
    } catch (error) {
      console.error(error)
      alert('获取课程失败')
    } finally {
      setLoading(false)
    }
  }

  const saveCourseEdit = async () => {
    if (editingCourseId === null) return
    try {
      const res = await fetch(`${API_BASE}/api/admin/course/${editingCourseId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(courseEditForm)
      })
      if (!res.ok) throw new Error('save failed')
      setEditingCourseId(null)
      setCourseEditForm(emptyCourseForm)
      void fetchCourses(coursePage, courseKeyword)
    } catch (error) {
      console.error(error)
      alert('保存课程失败')
    }
  }

  const createCourse = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/course`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newCourseForm)
      })
      if (!res.ok) throw new Error('create failed')
      setShowAddCourse(false)
      setNewCourseForm(emptyCourseForm)
      void fetchCourses(1, courseKeyword)
    } catch (error) {
      console.error(error)
      alert('创建课程失败')
    }
  }

  const deleteCourse = async (id: number) => {
    if (!confirm('确认删除这门课程吗？')) return
    try {
      const res = await fetch(`${API_BASE}/api/admin/course/${id}`, { method: 'DELETE', headers: getHeaders() })
      if (!res.ok) throw new Error('delete failed')
      void fetchCourses(coursePage, courseKeyword)
    } catch (error) {
      console.error(error)
      alert('删除课程失败')
    }
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, { headers: getHeaders() })
      if (!res.ok) throw new Error('fetch settings failed')
      const data = await res.json()
      setShowLegacyReviews(data.show_legacy_reviews === 'true')
      setAnnouncements(parseAnnouncements(data.site_announcements))
    } catch (error) {
      console.error(error)
    }
  }

  const updateShowLegacy = async (value: boolean) => {
    setShowLegacyReviews(value)
    try {
      await fetch(`${API_BASE}/api/admin/settings/show_legacy_reviews`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ value: value ? 'true' : 'false' })
      })
    } catch (error) {
      console.error(error)
    }
  }

  const saveAnnouncements = async (nextAnnouncements: AnnouncementDraft[]) => {
    setAnnouncements(nextAnnouncements)
    setIsSavingAnnouncements(true)
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings/site_announcements`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ value: JSON.stringify(nextAnnouncements) })
      })
      if (!res.ok) throw new Error('save announcements failed')
    } catch (error) {
      console.error(error)
      alert('保存公告失败')
    } finally {
      setIsSavingAnnouncements(false)
    }
  }

  useEffect(() => {
    if (!secret) return
    if (activeTab === 'reviews') {
      void fetchReviews(1, reviewKeyword)
    }
    if (activeTab === 'courses') {
      void fetchCourses(1, courseKeyword)
    }
    if (activeTab === 'settings') {
      void fetchSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <GlassCard hover={false}>
          <div className="mb-1 text-lg font-extrabold text-slate-800">管理入口</div>
          <div className="text-sm text-slate-600">该页面仅供管理员使用，当前缺少访问参数。</div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
          >
            返回首页
          </button>
        </GlassCard>
      </div>
    )
  }

  if (!isAuth) {
    return (
      <div className="mx-auto mt-20 max-w-md">
        <GlassCard hover={false} className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-800">管理员登录</h2>
          <p className="mb-6 text-sm text-slate-500">请输入管理密钥以访问后台。</p>
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="输入 Admin Secret"
            className="mb-4 w-full rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-slate-700 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-400"
            onKeyDown={(event) => event.key === 'Enter' && void login()}
          />
          <button onClick={() => void login()} className="w-full rounded-xl bg-slate-800 py-3 font-bold text-white shadow-lg transition-all hover:bg-slate-700 hover:shadow-xl active:scale-[0.98]">
            进入系统
          </button>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button onClick={() => setActiveTab('reviews')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${activeTab === 'reviews' ? 'bg-cyan-500 text-white' : 'bg-white/70 text-slate-600 hover:bg-slate-100'}`}>
          评论管理 ({reviewTotal})
        </button>
        <button onClick={() => setActiveTab('courses')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${activeTab === 'courses' ? 'bg-cyan-500 text-white' : 'bg-white/70 text-slate-600 hover:bg-slate-100'}`}>
          课程管理 ({courseTotal})
        </button>
        <button onClick={() => setActiveTab('settings')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${activeTab === 'settings' ? 'bg-cyan-500 text-white' : 'bg-white/70 text-slate-600 hover:bg-slate-100'}`}>
          设置
        </button>
      </div>

      {activeTab === 'reviews' && (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-slate-800">评论审核</h2>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={reviewSearchInput}
                onChange={(event) => setReviewSearchInput(event.target.value)}
                placeholder="搜索课程、编号或评论内容..."
                className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setReviewKeyword(reviewSearchInput)
                    void fetchReviews(1, reviewSearchInput)
                  }
                }}
              />
              <button onClick={() => { setReviewKeyword(reviewSearchInput); void fetchReviews(1, reviewSearchInput) }} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white">搜索</button>
              <button onClick={() => void fetchReviews()} disabled={loading} className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm disabled:opacity-50">
                {loading ? '加载中...' : '刷新'}
              </button>
            </div>
          </div>

          {reviews.map((review) => (
            <GlassCard key={review.id} hover={false} className={`!p-4 ${review.is_hidden ? 'border-l-4 border-l-red-400 bg-red-50/30' : ''}`}>
              {editingReviewId === review.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-cyan-600">{review.code}</span>
                    <span className="text-slate-600">{review.course_name}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input value={reviewEditForm.reviewer_name} onChange={(event) => setReviewEditForm({ ...reviewEditForm, reviewer_name: event.target.value })} placeholder="昵称" className="rounded border px-2 py-1 text-sm" />
                    <input value={reviewEditForm.reviewer_avatar} onChange={(event) => setReviewEditForm({ ...reviewEditForm, reviewer_avatar: event.target.value })} placeholder="头像 URL" className="rounded border px-2 py-1 text-sm" />
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button key={score} onClick={() => setReviewEditForm({ ...reviewEditForm, rating: score })}>
                        <svg className={`h-5 w-5 ${score <= reviewEditForm.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <MarkdownEditor value={reviewEditForm.comment} onChange={(value) => setReviewEditForm({ ...reviewEditForm, comment: value })} placeholder="支持 Markdown 编辑..." />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingReviewId(null)} className="px-3 py-1 text-sm text-slate-500">取消</button>
                    <button onClick={() => void saveReviewEdit()} className="rounded bg-cyan-500 px-3 py-1 text-sm text-white">保存</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-cyan-100 px-2 py-0.5 text-xs font-bold text-cyan-600">{review.code}</span>
                        <span className="font-bold text-slate-800">{review.course_name}</span>
                        {review.sqid && <span className="font-mono text-xs text-slate-400">{review.sqid}</span>}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{review.reviewer_name || '匿名用户'} · {new Date(review.created_at * 1000).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-500">{review.rating}</p>
                      <p className="text-xs text-slate-400">{review.is_hidden ? '已隐藏' : '公开中'}</p>
                    </div>
                  </div>
                  <div className="text-sm leading-6 text-slate-700">
                    <CollapsibleMarkdown content={review.comment} maxLength={1200} />
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2 text-xs">
                    <button onClick={() => toggleHide(review.id)} className={`rounded px-2 py-1 ${review.is_hidden ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {review.is_hidden ? '取消隐藏' : '隐藏'}
                    </button>
                    <button onClick={() => { setEditingReviewId(review.id); setReviewEditForm({ comment: review.comment, rating: review.rating, reviewer_name: review.reviewer_name || '', reviewer_avatar: review.reviewer_avatar || '' }) }} className="rounded bg-slate-100 px-2 py-1">编辑</button>
                    <button onClick={() => void deleteReview(review.id)} className="rounded bg-red-100 px-2 py-1 text-red-600">删除</button>
                  </div>
                </>
              )}
            </GlassCard>
          ))}

          {reviewTotalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button onClick={() => void fetchReviews(reviewPage - 1)} disabled={reviewPage <= 1} className="rounded border bg-white px-3 py-1 text-sm disabled:opacity-50">上一页</button>
              <span className="px-3 py-1 text-sm">{reviewPage}/{reviewTotalPages}</span>
              <button onClick={() => void fetchReviews(reviewPage + 1)} disabled={reviewPage >= reviewTotalPages} className="rounded border bg-white px-3 py-1 text-sm disabled:opacity-50">下一页</button>
            </div>
          )}
        </>
      )}

      {activeTab === 'courses' && (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-slate-800">课程管理</h2>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={courseSearchInput}
                onChange={(event) => setCourseSearchInput(event.target.value)}
                placeholder="搜索课程..."
                className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setCourseKeyword(courseSearchInput)
                    void fetchCourses(1, courseSearchInput)
                  }
                }}
              />
              <button onClick={() => { setCourseKeyword(courseSearchInput); void fetchCourses(1, courseSearchInput) }} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white">搜索</button>
              <button onClick={() => setShowAddCourse(true)} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white">+ 添加课程</button>
              <button onClick={() => void fetchCourses()} disabled={loading} className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm disabled:opacity-50">
                {loading ? '加载中...' : '刷新'}
              </button>
            </div>
          </div>

          {showAddCourse && (
            <GlassCard hover={false} className="!p-4 border-2 border-green-200 bg-green-50/30">
              <h3 className="mb-3 font-bold text-slate-700">添加新课程</h3>
              <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <input value={newCourseForm.code} onChange={(event) => setNewCourseForm({ ...newCourseForm, code: event.target.value })} placeholder="课程代码 *" className="rounded border px-2 py-1 text-sm" />
                <input value={newCourseForm.name} onChange={(event) => setNewCourseForm({ ...newCourseForm, name: event.target.value })} placeholder="课程名称 *" className="rounded border px-2 py-1 text-sm" />
                <input value={newCourseForm.teacher_name} onChange={(event) => setNewCourseForm({ ...newCourseForm, teacher_name: event.target.value })} placeholder="教师" className="rounded border px-2 py-1 text-sm" />
                <input type="number" value={newCourseForm.credit} onChange={(event) => setNewCourseForm({ ...newCourseForm, credit: parseFloat(event.target.value) || 0 })} placeholder="学分" className="rounded border px-2 py-1 text-sm" />
                <input value={newCourseForm.department} onChange={(event) => setNewCourseForm({ ...newCourseForm, department: event.target.value })} placeholder="院系" className="rounded border px-2 py-1 text-sm" />
                <input value={newCourseForm.search_keywords} onChange={(event) => setNewCourseForm({ ...newCourseForm, search_keywords: event.target.value })} placeholder="搜索关键词（可选）" className="rounded border px-2 py-1 text-sm" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddCourse(false)} className="px-3 py-1 text-sm text-slate-500">取消</button>
                <button onClick={() => void createCourse()} className="rounded bg-green-500 px-3 py-1 text-sm text-white">创建</button>
              </div>
            </GlassCard>
          )}

          {courses.map((course) => (
            <GlassCard key={course.id} hover={false} className="!p-4">
              {editingCourseId === course.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input value={courseEditForm.code} onChange={(event) => setCourseEditForm({ ...courseEditForm, code: event.target.value })} placeholder="课程代码" className="rounded border px-2 py-1 text-sm" />
                    <input value={courseEditForm.name} onChange={(event) => setCourseEditForm({ ...courseEditForm, name: event.target.value })} placeholder="课程名称" className="rounded border px-2 py-1 text-sm" />
                    <input value={courseEditForm.teacher_name} onChange={(event) => setCourseEditForm({ ...courseEditForm, teacher_name: event.target.value })} placeholder="教师" className="rounded border px-2 py-1 text-sm" />
                    <input type="number" value={courseEditForm.credit} onChange={(event) => setCourseEditForm({ ...courseEditForm, credit: parseFloat(event.target.value) || 0 })} placeholder="学分" className="rounded border px-2 py-1 text-sm" />
                    <input value={courseEditForm.department} onChange={(event) => setCourseEditForm({ ...courseEditForm, department: event.target.value })} placeholder="院系" className="rounded border px-2 py-1 text-sm" />
                    <input value={courseEditForm.search_keywords} onChange={(event) => setCourseEditForm({ ...courseEditForm, search_keywords: event.target.value })} placeholder="搜索关键词" className="rounded border px-2 py-1 text-sm" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingCourseId(null)} className="px-3 py-1 text-sm text-slate-500">取消</button>
                    <button onClick={() => void saveCourseEdit()} className="rounded bg-cyan-500 px-3 py-1 text-sm text-white">保存</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${course.is_legacy ? 'bg-amber-100 text-amber-600' : 'bg-cyan-100 text-cyan-600'}`}>{course.code}</span>
                        <span className="font-bold text-slate-800">{course.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{course.teacher_name || '未知教师'} · {course.department || '未知院系'} · {course.credit} 学分</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-500">{course.review_avg?.toFixed(1) || '-'}</p>
                      <p className="text-xs text-slate-400">{course.review_count} 条评价</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 text-xs">
                    <button onClick={() => { setEditingCourseId(course.id); setCourseEditForm({ code: course.code, name: course.name, credit: course.credit, department: course.department || '', teacher_name: course.teacher_name || '', search_keywords: course.search_keywords || '' }) }} className="rounded bg-slate-100 px-2 py-1">编辑</button>
                    <button onClick={() => void deleteCourse(course.id)} className="rounded bg-red-100 px-2 py-1 text-red-600">删除</button>
                  </div>
                </>
              )}
            </GlassCard>
          ))}

          {courseTotalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button onClick={() => void fetchCourses(coursePage - 1)} disabled={coursePage <= 1} className="rounded border bg-white px-3 py-1 text-sm disabled:opacity-50">上一页</button>
              <span className="px-3 py-1 text-sm">{coursePage}/{courseTotalPages}</span>
              <button onClick={() => void fetchCourses(coursePage + 1)} disabled={coursePage >= courseTotalPages} className="rounded border bg-white px-3 py-1 text-sm disabled:opacity-50">下一页</button>
            </div>
          )}
        </>
      )}

      {activeTab === 'settings' && (
        <GlassCard hover={false} className="!p-6">
          <h2 className="mb-6 text-xl font-bold text-slate-800">站点设置</h2>
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 p-4">
              <div>
                <h3 className="font-semibold text-slate-800">旧乌龙茶历史评价显示</h3>
                <p className="mt-1 text-sm text-slate-500">开启后，课程详情页会显示旧站历史评价数据。</p>
              </div>
              <button onClick={() => void updateShowLegacy(!showLegacyReviews)} className={`relative h-7 w-14 rounded-full transition-colors ${showLegacyReviews ? 'bg-amber-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${showLegacyReviews ? 'left-8' : 'left-1'}`} />
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800">首页公告栏</h3>
                  <p className="mt-1 text-sm text-slate-500">支持信息、警告、错误、成功四种类型，多条公告会在首页自动纵向轮播。</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAnnouncements((current) => [...current, createAnnouncement()])} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">新增公告</button>
                  <button onClick={() => void saveAnnouncements(announcements)} disabled={isSavingAnnouncements} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60">
                    {isSavingAnnouncements ? '保存中...' : '保存公告'}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {announcements.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-400">
                    还没有公告，点击“新增公告”即可创建首页轮播通知。
                  </div>
                )}

                {announcements.map((announcement) => (
                  <div key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start">
                      <select value={announcement.type} onChange={(event) => setAnnouncements((current) => current.map((item) => item.id === announcement.id ? { ...item, type: event.target.value as AnnouncementType } : item))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                        <option value="info">信息</option>
                        <option value="warning">警告</option>
                        <option value="error">错误</option>
                        <option value="success">成功</option>
                      </select>
                      <textarea value={announcement.content} onChange={(event) => setAnnouncements((current) => current.map((item) => item.id === announcement.id ? { ...item, content: event.target.value } : item))} placeholder="输入首页公告内容，支持自动换行。" rows={3} className="min-h-[92px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                      <div className="flex flex-col gap-2 md:w-[128px]">
                        <button onClick={() => setAnnouncements((current) => current.map((item) => item.id === announcement.id ? { ...item, enabled: !item.enabled } : item))} className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${announcement.enabled ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                          {announcement.enabled ? '已启用' : '已停用'}
                        </button>
                        <button onClick={() => setAnnouncements((current) => current.filter((item) => item.id !== announcement.id))} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100">
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
