import { useEffect, useRef, useState } from 'react'
import GlassCard from '../components/GlassCard'

// 声明 Waline 全局类型
declare global {
  interface Window {
    Waline?: {
      init: (options: any) => void
    }
  }
}

export default function Feedback() {
  const walineRef = useRef<HTMLDivElement>(null)
  const walineServerUrl = import.meta.env.VITE_WALINE_SERVER_URL || ''
  const [walineReady, setWalineReady] = useState(false)

  useEffect(() => {
    if (!walineServerUrl) return
    if (!walineRef.current) return

    let cancelled = false
    let cssLink: HTMLLinkElement | null = null
    let observer: IntersectionObserver | null = null
    let loadedOnce = false

    const initWaline = async () => {
      if (cancelled || loadedOnce) return
      loadedOnce = true

      // 预留空间已由容器 min-height 保证，这里只负责懒加载资源并初始化，减少首屏阻塞与 CLS
      cssLink = document.createElement('link')
      cssLink.rel = 'stylesheet'
      cssLink.href = 'https://unpkg.com/@waline/client@v3/dist/waline.css'
      document.head.appendChild(cssLink)

      try {
        // @ts-expect-error - 运行时从 CDN 动态加载 ESM 模块（TypeScript 无法解析该 URL）
        const mod: any = await import('https://unpkg.com/@waline/client@v3/dist/waline.js')
        if (cancelled) return
        window.Waline = { init: mod.init }

        if (window.Waline && walineRef.current) {
          window.Waline.init({
            el: walineRef.current,
            serverURL: walineServerUrl,
            lang: 'zh-CN',
            locale: {
              placeholder: '欢迎留言反馈，说说你的想法吧...',
              sofa: '来发评论吧~',
              submit: '提交',
              comment: '评论',
              refresh: '刷新',
              more: '加载更多...',
              preview: '预览',
              emoji: '表情',
              uploadImage: '上传图片',
              seconds: '秒前',
              minutes: '分钟前',
              hours: '小时前',
              days: '天前',
              now: '刚刚',
              uploading: '正在上传',
              login: '登录',
              logout: '退出',
              admin: '管理',
              sticky: '置顶',
              word: '字',
              wordHint: '评论字数应在 $0 到 $1 字之间！\\n当前字数：$2',
              anonymous: '匿名',
              approved: '通过',
              waiting: '待审核',
              spam: '垃圾',
              unsticky: '取消置顶',
              oldest: '按倒序',
              latest: '按正序',
              hottest: '按热度',
              reactionTitle: '你认为这篇文章怎么样？',
            },
            emoji: [
              'https://unpkg.com/@waline/emojis@1.2.0/weibo',
              'https://unpkg.com/@waline/emojis@1.2.0/bilibili',
            ],
            dark: false, // 强制使用浅色模式
            meta: ['nick', 'mail'],
            requiredMeta: ['nick'],
            pageSize: 10,
            wordLimit: [0, 1000],
          })
          setWalineReady(true)
        }
      } catch (e) {
        // ignore
      }
    }

    const scheduleInit = () => {
      const rIC = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: any) => void)
      if (typeof rIC === 'function') rIC(() => void initWaline(), { timeout: 2000 })
      else window.setTimeout(() => void initWaline(), 60)
    }

    observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (!e?.isIntersecting) return
        scheduleInit()
        observer?.disconnect()
        observer = null
      },
      { rootMargin: '200px 0px' }
    )
    observer.observe(walineRef.current)

    return () => {
      cancelled = true
      observer?.disconnect()
      if (cssLink && cssLink.parentNode) cssLink.parentNode.removeChild(cssLink)
    }
  }, [walineServerUrl])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <GlassCard className="bg-gradient-to-r from-purple-50 to-white min-h-[120px] flex flex-col justify-center" hover={false}>
        <div className="max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">反馈留言板</h2>
          <p className="text-sm md:text-base text-slate-500">
            欢迎在这里留下你的建议、反馈或想法，我们会认真倾听每一条留言 ✨
          </p>
        </div>
      </GlassCard>

      {/* Waline 评论区 */}
      <GlassCard hover={false}>
        <div className="relative">
          {!walineReady && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 pointer-events-none">
              正在加载评论区...
            </div>
          )}
          <div
            ref={walineRef}
            className="waline-container h-[70vh] min-h-[720px] overflow-auto"
            style={{ visibility: walineReady ? 'visible' : 'hidden' }}
          />
        </div>
      </GlassCard>

      {/* 使用说明 */}
      <GlassCard hover={false}>
        <div className="prose prose-slate max-w-none">
          <h3 className="text-lg font-bold text-slate-800 mb-3">💡 留言说明</h3>
          <ul className="text-sm text-slate-600 space-y-2">
            <li>留言系统的账号登录仅用于方便展示昵称与头像，你可以选择不登录，填写昵称即可</li>
            <li>留言支持 Markdown 语法</li>
            <li>支持表情符号，点击输入框下方的表情按钮即可选择</li>
            <li>留言会经过审核后显示，请文明发言，不要灌水/打广告/谈论无关信息</li>
            <li>如有紧急问题，请通过"关于"页面的联系方式直接联系我们</li>
          </ul>
        </div>
      </GlassCard>
    </div>
  )
}
