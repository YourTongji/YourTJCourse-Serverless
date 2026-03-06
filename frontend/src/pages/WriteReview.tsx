import { useState, useEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BoringAvatar from 'boring-avatars'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchCourse, submitReview, updateReview } from '../services/api'
import GlassCard from '../components/GlassCard'
import MarkdownEditor from '../components/MarkdownEditor'
import MarkdownToolbar from '../components/MarkdownToolbar'
import TemplateSelector, { TEMPLATE_HINTS, TemplateHints } from '../components/TemplateSelector'
import TongjiCaptchaWidget from '../components/TongjiCaptchaWidget'
import { loadCreditWallet } from '../utils/creditWallet'

const REVIEW_TEMPLATE = `## 考核方式：

## 授课质量与给分：

## 上课学期：
`

// 默认模板的提示
const DEFAULT_HINTS: TemplateHints = {
  '## 考核方式：': '描述考试形式、作业要求等',
  '## 授课质量与给分：': '描述老师的教学质量和给分情况',
  '## 上课学期：': '填写你上这门课的学期，如 2024春'
}

const AVATAR_COLORS = ['#0f172a', '#38bdf8', '#f8fafc', '#f59e0b', '#22c55e']

function buildBeamAvatarDataUri(seedText: string, size = 72) {
  const svg = renderToStaticMarkup(
    <BoringAvatar
      size={size}
      name={seedText || '匿名用户'}
      variant="beam"
      colors={AVATAR_COLORS}
    />
  )

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export default function WriteReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [course, setCourse] = useState<{ name: string; code: string } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState(REVIEW_TEMPLATE)
  const [currentHints, setCurrentHints] = useState<TemplateHints>(DEFAULT_HINTS)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)

  // 点评人设置
  const [showReviewer, setShowReviewer] = useState(false)
  const [reviewerName, setReviewerName] = useState('')
  const [avatarType, setAvatarType] = useState<'random' | 'qq'>('random')
  const [qqNumber, setQqNumber] = useState('')

  const editReview = (location.state as any)?.editReview as any | undefined
  const isEdit = Boolean(editReview?.id) && new URLSearchParams(location.search || '').get('edit') === '1'

  const getAvatarSeed = () => reviewerName.trim() || '匿名用户'

  const getAvatarUrl = () => {
    if (!showReviewer) return ''
    if (avatarType === 'qq' && qqNumber) {
      return `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`
    }
    return buildBeamAvatarDataUri(getAvatarSeed(), 96)
  }

  useEffect(() => {
    if (!id) return
    setCourse(null)
    setLoadError('')
    fetchCourse(id)
      .then(setCourse)
      .catch(() => setLoadError('加载失败，请重试'))
  }, [id])

  useEffect(() => {
    if (!isEdit) return
    if (!editReview) return
    setComment(String(editReview.comment || ''))
    setRating(Number(editReview.rating ?? 5))
    setShowReviewer(Boolean(editReview.reviewer_name || editReview.reviewer_avatar))
    setReviewerName(String(editReview.reviewer_name || ''))
    if (String(editReview.reviewer_avatar || '').includes('qlogo.cn')) {
      setAvatarType('qq')
      const m = String(editReview.reviewer_avatar || '').match(/nk=(\d+)/)
      if (m?.[1]) setQqNumber(m[1])
    }
  }, [isEdit, editReview])

  // 草稿自动保存
  useEffect(() => {
    if (!id) return

    // 加载草稿
    const draftKey = `review_draft_${id}`
    const savedDraft = localStorage.getItem(draftKey)
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft)
        setComment(draft.comment || REVIEW_TEMPLATE)
        setRating(draft.rating || 5)
        setShowReviewer(draft.showReviewer || false)
        setReviewerName(draft.reviewerName || '')
        setAvatarType(draft.avatarType || 'random')
        setQqNumber(draft.qqNumber || '')
      } catch (e) {
        console.error('Failed to load draft:', e)
      }
    }
  }, [id])

  // 自动保存草稿（防抖）
  useEffect(() => {
    if (!id) return

    const draftKey = `review_draft_${id}`
    const timer = setTimeout(() => {
      const draft = {
        comment,
        rating,
        showReviewer,
        reviewerName,
        avatarType,
        qqNumber,
        timestamp: Date.now()
      }
      localStorage.setItem(draftKey, JSON.stringify(draft))
    }, 1000) // 1秒防抖

    return () => clearTimeout(timer)
  }, [id, comment, rating, showReviewer, reviewerName, avatarType, qqNumber])

  // Markdown 插入功能
  const handleInsert = (before: string, after?: string) => {
    // 这个功能会通过 MarkdownEditor 内部的 insertText 方法实现
    // 暂时通过简单的文本追加实现
    const textarea = document.querySelector('textarea')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = comment.substring(start, end)
    const newText = comment.substring(0, start) + before + selectedText + (after || '') + comment.substring(end)

    setComment(newText)

    // 恢复光标位置
    setTimeout(() => {
      textarea.focus()
      const newCursorPos = start + before.length + selectedText.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const handleShowMore = () => {
    setShowTemplateSelector(true)
  }

  const handleTemplateSelect = (template: string, templateId?: string) => {
    setComment(template || REVIEW_TEMPLATE)
    // 根据模板ID设置对应的提示
    if (templateId && TEMPLATE_HINTS[templateId]) {
      setCurrentHints(TEMPLATE_HINTS[templateId])
    } else if (!template) {
      setCurrentHints(DEFAULT_HINTS)
    } else {
      setCurrentHints({}) // 空白模板或未知模板不显示提示
    }
  }

  const handleSubmit = async () => {
    if (!comment.trim()) return alert('请填写点评内容')
    if (!token) return alert('请完成人机验证')

    setLoading(true)
    try {
      const wallet = loadCreditWallet()
      const payload = {
        rating,
        comment,
        semester: '',
        turnstile_token: token,
        reviewer_name: showReviewer ? reviewerName : '',
        reviewer_avatar: getAvatarUrl(),
        walletUserHash: wallet?.userHash || ''
      }

      if (isEdit && editReview?.id) {
        const res = await updateReview(Number(editReview.id), payload)
        if (res?.success) {
          alert('编辑成功！')
          if (id) localStorage.removeItem(`review_draft_${id}`)
          navigate(`/course/${id}`)
        } else {
          alert(res?.error || '编辑失败')
        }
      } else {
        const res = await submitReview({
          course_id: Number(id),
          ...payload
        })
        if (res.success) {
          const credit = res?.creditReward
          if (credit && credit.skipped !== true) {
            if (credit.ok) {
              alert('点评提交成功！评课激励 +10 已发放到积分钱包。')
            } else {
              const reason = credit.error ? `（${String(credit.error).slice(0, 120)}）` : ''
              alert(`点评提交成功，但评课激励发放失败${reason}`)
            }
          } else {
            alert('点评提交成功！')
          }
          if (id) localStorage.removeItem(`review_draft_${id}`)
          navigate(`/course/${id}`)
        } else {
          alert(res.error || '提交失败')
        }
      }
    } catch (e: any) {
      const msg = String(e?.message || e || '提交失败')
      alert(msg)
      if (msg.includes('人机验证') || msg.toLowerCase().includes('captcha')) {
        // 允许重新验证
        setToken('')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loadError) {
    return (
      <GlassCard hover={false}>
        <div className="text-slate-700 font-bold mb-3">{loadError}</div>
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700"
          onClick={() => {
            if (!id) return
            setCourse(null)
            setLoadError('')
            fetchCourse(id)
              .then(setCourse)
              .catch(() => setLoadError('加载失败，请重试'))
          }}
        >
          重新加载
        </button>
      </GlassCard>
    )
  }

  if (!course) {
    return (
      <div className="min-h-[100vh] max-w-4xl mx-auto pb-24 md:pb-6 animate-pulse">
        <GlassCard hover={false}>
          <div className="h-6 w-28 rounded-full bg-slate-200 mb-4" />
          <div className="h-8 w-3/4 rounded bg-slate-200 mb-6" />
          <div className="space-y-3">
            <div className="h-12 rounded-2xl bg-slate-200/80" />
            <div className="h-12 rounded-2xl bg-slate-200/80" />
            <div className="h-12 rounded-2xl bg-slate-200/80" />
          </div>
        </GlassCard>
      </div>
    )
  }

  const walletBound = !!loadCreditWallet()?.userHash
  const reviewEligible = String(comment || '').trim().length >= 50

  return (
    <div className="max-w-4xl mx-auto pb-24 md:pb-6">
      <GlassCard hover={false}>
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-50 rounded-full text-xs font-bold text-cyan-600 border border-cyan-100 mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            撰写评价
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{course.code} - {course.name}</h2>
          {isEdit && (
            <p className="mt-1 text-sm text-slate-500">编辑我的评价（需要完成一次人机验证）</p>
          )}
        </div>

        <div className={`mb-6 p-4 rounded-2xl border ${walletBound ? 'bg-emerald-50/70 border-emerald-100' : 'bg-amber-50/70 border-amber-100'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold text-slate-700 leading-relaxed">
              {walletBound
                ? `已绑定积分钱包：${reviewEligible ? '本次点评满足 50 字，将自动获得 +10 积分。' : '点评达到 50 字可获得 +10 积分。'}`
                : '未绑定积分钱包：绑定后 50 字以上点评可立即获得 +10，收到 1 个点赞 +3（每日结算）。'}
            </div>
            {!walletBound && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('open-credit-wallet'))}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-extrabold hover:bg-slate-700"
              >
                绑定钱包
              </button>
            )}
          </div>
        </div>

        {/* Rating - 移动端优化为紧凑两行布局 */}
        <div className="mb-6">
          <label className="block mb-3 text-sm font-semibold text-slate-600">评分</label>
          <div className="p-4 bg-white/60 backdrop-blur rounded-2xl border border-white">
            {/* 桌面端：单行布局 */}
            <div className="hidden md:flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="text-3xl p-1 transition-transform hover:scale-110 active:scale-95"
                >
                  <svg
                    className={`w-8 h-8 ${star <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
              <span className="ml-3 text-sm font-semibold text-slate-600">{rating} 分</span>
            </div>

            {/* 移动端：紧凑两行布局 */}
            <div className="md:hidden space-y-2">
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform active:scale-95"
                  >
                    <svg
                      className={`w-7 h-7 ${star <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                ))}
              </div>
              <div className="text-center text-lg font-bold text-slate-700">{rating} 分</div>
            </div>
          </div>
        </div>

        {/* Comment */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-600">
              点评内容 <span className="text-slate-400 font-normal text-xs">(支持 Markdown 格式)</span>
            </label>
            {/* 桌面端显示模板按钮 */}
            <button
              onClick={() => setShowTemplateSelector(true)}
              className="hidden md:flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              选择模板
            </button>
          </div>

          {/* 桌面端：Markdown 提示 */}
          <div className="hidden md:flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 mb-3 text-[11px] text-slate-500">
            <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">**粗体**</span>
            <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">*斜体*</span>
            <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">[链接](url)</span>
            <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">![图片](url)</span>
            <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">`代码`</span>
            <span className="px-2 py-1 bg-white rounded-md border border-slate-100 font-mono">## 标题</span>
          </div>

          <MarkdownEditor
            value={comment}
            onChange={setComment}
            placeholder="请按照模板填写课程点评..."
            hints={currentHints}
          />
        </div>

        {/* 点评人设置 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-slate-600">显示点评人信息</label>
            <button
              type="button"
              onClick={() => setShowReviewer(!showReviewer)}
              className={`relative w-12 h-6 rounded-full transition-colors ${showReviewer ? 'bg-cyan-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${showReviewer ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {showReviewer && (
            <div className="p-4 bg-white/60 backdrop-blur rounded-2xl border border-white space-y-4">
              {/* 昵称 */}
              <div>
                <label className="block mb-2 text-xs font-medium text-slate-500">昵称</label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={e => setReviewerName(e.target.value)}
                  placeholder="输入你想显示的昵称"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-400"
                  maxLength={20}
                />
              </div>

              {/* 头像选择 */}
              <div>
                <label className="block mb-2 text-xs font-medium text-slate-500">头像</label>
                <div className="flex gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setAvatarType('random')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${avatarType === 'random' ? 'border-cyan-400 bg-cyan-50 text-cyan-600' : 'border-slate-200 text-slate-500'}`}
                  >
                    随机头像
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarType('qq')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${avatarType === 'qq' ? 'border-cyan-400 bg-cyan-50 text-cyan-600' : 'border-slate-200 text-slate-500'}`}
                  >
                    QQ头像
                  </button>
                </div>

                {avatarType === 'qq' && (
                  <div>
                    <input
                      type="text"
                      value={qqNumber}
                      onChange={e => setQqNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="输入QQ号"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-400"
                    />
                    <p className="mt-1 text-xs text-slate-400">我们只存储头像链接，不会公开你的 QQ 号</p>
                  </div>
                )}

                {/* 头像预览 */}
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={getAvatarUrl()}
                    alt="头像预览"
                    className="w-12 h-12 rounded-full bg-slate-100 object-cover"
                  />
                  <span className="text-sm text-slate-500">头像预览</span>
                </div>
              </div>
            </div>
          )}

          {!showReviewer && (
            <p className="text-xs text-slate-400">关闭后将以"匿名用户"身份发布点评</p>
          )}
        </div>

        {/* 人机验证 */}
        <div className="mb-6">
          <label className="block mb-3 text-sm font-semibold text-slate-600">人机验证</label>
          <TongjiCaptchaWidget value={token} onVerify={setToken} />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3.5 bg-slate-800 text-white rounded-2xl font-bold shadow-lg hover:bg-slate-700 hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              提交中...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              提交点评
            </>
          )}
        </button>
      </GlassCard>

      {/* 移动端：底部工具栏 */}
      <div className="md:hidden">
        <MarkdownToolbar
          onInsert={handleInsert}
          onShowMore={handleShowMore}
        />
      </div>

      {/* 模板选择器 */}
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
      />
    </div>
  )
}
