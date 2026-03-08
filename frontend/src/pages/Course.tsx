import { useState, useEffect, useMemo, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BoringAvatar from 'boring-avatars'
import { toJpeg, toPng } from 'html-to-image'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { fetchCourse, likeReview, unlikeReview } from '../services/api'
import GlassCard from '../components/GlassCard'
import CollapsibleMarkdown, { renderMarkdownHtml } from '../components/CollapsibleMarkdown'
import { getOrCreateClientId } from '../utils/clientId'
import { loadCreditWallet } from '../utils/creditWallet'

interface Review {
  id: number
  sqid?: string
  rating: number
  comment: string
  semester: string
  created_at: number
  reviewer_name?: string
  reviewer_avatar?: string
  like_count?: number
  liked?: boolean
  wallet_user_hash?: string | null
}

interface CourseData {
  id: number
  code: string
  name: string
  credit: number
  department: string
  teacher_name: string
  review_avg: number
  review_count: number
  semesters?: string[]
  reviews: Review[]
}

type SharePreviewState = {
  review: Review
  avatarUrl: string
  markdownHtml: string
  commentRasterUrl?: string
}

const AVATAR_COLORS = ['#0f172a', '#38bdf8', '#f8fafc', '#f59e0b', '#22c55e']

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatSemesterLabel(value: string) {
  const text = String(value || '').trim()
  const yearMatch = text.match(/(20\d{2})/)

  if (!yearMatch) return text || '未知学期'

  const shortYear = yearMatch[1].slice(2)
  if (/1/i.test(text)) return `${shortYear}秋`
  if (/2/i.test(text)) return `${shortYear}春`

  return text
}

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

function isQqAvatar(url?: string) {
  return /qlogo\.cn/i.test(String(url || ''))
}

async function rasterizeImageSource(src: string, options?: { size?: number; backgroundColor?: string }) {
  if (!src) return ''

  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    if (!src.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }

    image.onload = () => {
      try {
        const pixelRatio = 2
        const targetWidth = options?.size || image.naturalWidth || 88
        const targetHeight = options?.size || image.naturalHeight || 88
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(targetWidth * pixelRatio)
        canvas.height = Math.ceil(targetHeight * pixelRatio)
        const context = canvas.getContext('2d')

        if (!context) {
          reject(new Error('avatar_canvas_context_failed'))
          return
        }

        context.scale(pixelRatio, pixelRatio)
        context.fillStyle = options?.backgroundColor || '#ffffff'
        context.fillRect(0, 0, targetWidth, targetHeight)

        const sourceWidth = image.naturalWidth || targetWidth
        const sourceHeight = image.naturalHeight || targetHeight
        const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
        const drawWidth = sourceWidth * scale
        const drawHeight = sourceHeight * scale
        const offsetX = (targetWidth - drawWidth) / 2
        const offsetY = (targetHeight - drawHeight) / 2

        context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('avatar_rasterize_failed'))
      }
    }

    image.onerror = () => reject(new Error('avatar_image_load_failed'))
    image.src = src
  })
}

function toImageProxyUrl(url: string) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}`
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('blob_to_data_url_failed'))
    reader.readAsDataURL(blob)
  })
}

async function fetchImageAsDataUrl(url: string) {
  if (!url) return ''
  if (url.startsWith('data:')) return url

  const candidates = isQqAvatar(url) ? [toImageProxyUrl(url)] : [url, toImageProxyUrl(url)]
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { mode: 'cors' })
      if (!response.ok) throw new Error(`image_fetch_failed:${response.status}`)
      const blob = await response.blob()
      return blobToDataUrl(blob)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('image_fetch_failed')
}

function getReviewAvatarUrl(review: Review, size = 72) {
  const reviewerName = String(review.reviewer_name || '').trim()
  const avatarUrl = String(review.reviewer_avatar || '').trim()

  if (avatarUrl) return avatarUrl
  if (reviewerName) return buildBeamAvatarDataUri(reviewerName, size)
  return ''
}

async function inlineMarkdownImages(html: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const images = Array.from(doc.querySelectorAll('img'))

  await Promise.all(images.map(async (image) => {
    const src = image.getAttribute('src') || ''
    if (!src) return
    try {
      image.setAttribute('src', await fetchImageAsDataUrl(src))
      image.setAttribute('style', 'max-width: 100%; height: auto; border-radius: 14px; margin: 12px 0; display: block;')
    } catch {
      const alt = image.getAttribute('alt') || '图片加载失败'
      const fallback = doc.createElement('div')
      fallback.textContent = alt
      fallback.setAttribute('style', 'margin: 12px 0; padding: 16px; border-radius: 14px; background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1;')
      image.replaceWith(fallback)
    }
  }))

  return doc.body.innerHTML
}

async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll('img'))

  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve()
      return
    }

    const finish = () => {
      window.clearTimeout(timer)
      image.removeEventListener('load', finish)
      image.removeEventListener('error', finish)
      resolve()
    }

    const timer = window.setTimeout(finish, 4000)
    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })))

  if ('fonts' in document) {
    try {
      await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
    } catch {
      // ignore
    }
  }
}

async function exportShareNode(node: HTMLElement, format: 'png' | 'jpg') {
  const options = {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio: format === 'jpg' ? 2.2 : 2.5
  }

  return format === 'jpg'
    ? toJpeg(node, { ...options, quality: 0.96 })
    : toPng(node, options)
}

type CommentBlock = {
  type: 'heading' | 'paragraph' | 'image' | 'list'
  text?: string
  level?: 1 | 2 | 3
  src?: string
  alt?: string
  items?: string[]
}

function collectCommentBlocks(html: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild || doc.body
  const blocks: CommentBlock[] = []

  const pushParagraphLike = (container: ParentNode) => {
    let buffer = ''
    const flush = () => {
      const text = buffer.replace(/\s+/g, ' ').trim()
      if (text) blocks.push({ type: 'paragraph', text })
      buffer = ''
    }

    const walk = (node: ChildNode) => {
      if (node.nodeType === Node.TEXT_NODE) {
        buffer += node.textContent || ''
        return
      }

      if (!(node instanceof HTMLElement)) return

      const tag = node.tagName.toLowerCase()
      if (tag === 'img') {
        flush()
        blocks.push({ type: 'image', src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' })
        return
      }

      if (tag === 'br') {
        buffer += '\n'
        return
      }

      if (tag === 'ul' || tag === 'ol') {
        flush()
        const items = Array.from(node.querySelectorAll('li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean)
        if (items.length) blocks.push({ type: 'list', items })
        return
      }

      Array.from(node.childNodes).forEach(walk)
    }

    Array.from(container.childNodes).forEach(walk)
    flush()
  }

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim()
      if (text) blocks.push({ type: 'paragraph', text })
      return
    }

    if (!(node instanceof HTMLElement)) return
    const tag = node.tagName.toLowerCase()

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const text = node.textContent?.replace(/\s+/g, ' ').trim()
      if (text) blocks.push({ type: 'heading', text, level: Number(tag.slice(1)) as 1 | 2 | 3 })
      return
    }

    if (tag === 'img') {
      blocks.push({ type: 'image', src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' })
      return
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.querySelectorAll('li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean)
      if (items.length) blocks.push({ type: 'list', items })
      return
    }

    pushParagraphLike(node)
  })

  return blocks
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let current = ''

  for (const char of Array.from(text)) {
    if (char === '\n') {
      lines.push(current || ' ')
      current = ''
      continue
    }

    const candidate = `${current}${char}`
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = char
    } else {
      current = candidate
    }
  }

  if (current) lines.push(current)
  return lines.length ? lines : [' ']
}

async function renderCommentRaster(html: string, width = 640) {
  const blocks = collectCommentBlocks(html)
  if (!blocks.some((block) => block.type === 'image')) return ''

  const imageSources = Array.from(new Set(blocks.filter((block) => block.type === 'image' && block.src).map((block) => String(block.src))))
  const imageMap = new Map<string, HTMLImageElement>()

  await Promise.all(imageSources.map(async (src) => new Promise<void>(async (resolve) => {
    let resolvedSrc = src

    if (!resolvedSrc.startsWith('data:')) {
      try {
        resolvedSrc = await fetchImageAsDataUrl(resolvedSrc)
      } catch {
        resolvedSrc = src
      }
    }

    const img = new Image()
    img.decoding = 'async'
    if (!resolvedSrc.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      imageMap.set(src, img)
      resolve()
    }
    img.onerror = () => resolve()
    img.src = resolvedSrc
  })))

  const canvas = document.createElement('canvas')
  const measureContext = canvas.getContext('2d')
  if (!measureContext) return ''

  const innerWidth = width
  let totalHeight = 12

  for (const block of blocks) {
    if (block.type === 'heading') {
      const fontSize = block.level === 1 ? 24 : block.level === 2 ? 20 : 17
      const lineHeight = block.level === 1 ? 34 : block.level === 2 ? 30 : 27
      measureContext.font = `800 ${fontSize}px "Microsoft YaHei", sans-serif`
      totalHeight += wrapCanvasText(measureContext, block.text || '', innerWidth).length * lineHeight + 10
      continue
    }

    if (block.type === 'paragraph') {
      measureContext.font = '15px "Microsoft YaHei", sans-serif'
      totalHeight += wrapCanvasText(measureContext, block.text || '', innerWidth).length * 28 + 10
      continue
    }

    if (block.type === 'list') {
      measureContext.font = '15px "Microsoft YaHei", sans-serif'
      for (const item of block.items || []) {
        totalHeight += wrapCanvasText(measureContext, `• ${item}`, innerWidth).length * 28
      }
      totalHeight += 10
      continue
    }

    if (block.type === 'image' && block.src) {
      const image = imageMap.get(block.src)
      if (!image) continue
      const ratio = Math.min(1, innerWidth / image.naturalWidth)
      totalHeight += image.naturalHeight * ratio + 14
    }
  }

  const pixelRatio = 2
  canvas.width = Math.ceil(width * pixelRatio)
  canvas.height = Math.ceil((totalHeight + 8) * pixelRatio)
  const context = canvas.getContext('2d')
  if (!context) return ''

  context.scale(pixelRatio, pixelRatio)
  context.clearRect(0, 0, width, totalHeight + 8)

  let y = 0
  for (const block of blocks) {
    if (block.type === 'heading') {
      const fontSize = block.level === 1 ? 24 : block.level === 2 ? 20 : 17
      const lineHeight = block.level === 1 ? 34 : block.level === 2 ? 30 : 27
      context.font = `800 ${fontSize}px "Microsoft YaHei", sans-serif`
      context.fillStyle = '#0f172a'
      for (const line of wrapCanvasText(context, block.text || '', innerWidth)) {
        y += lineHeight
        context.fillText(line, 0, y)
      }
      y += 10
      continue
    }

    if (block.type === 'paragraph') {
      context.font = '15px "Microsoft YaHei", sans-serif'
      context.fillStyle = '#334155'
      for (const line of wrapCanvasText(context, block.text || '', innerWidth)) {
        y += 28
        context.fillText(line, 0, y)
      }
      y += 10
      continue
    }

    if (block.type === 'list') {
      context.font = '15px "Microsoft YaHei", sans-serif'
      context.fillStyle = '#334155'
      for (const item of block.items || []) {
        for (const line of wrapCanvasText(context, `• ${item}`, innerWidth)) {
          y += 28
          context.fillText(line, 0, y)
        }
      }
      y += 10
      continue
    }

    if (block.type === 'image' && block.src) {
      const image = imageMap.get(block.src)
      if (!image) continue
      const ratio = Math.min(1, innerWidth / image.naturalWidth)
      const drawWidth = image.naturalWidth * ratio
      const drawHeight = image.naturalHeight * ratio
      const radius = 16
      y += 8
      context.save()
      context.beginPath()
      context.moveTo(radius, y)
      context.lineTo(drawWidth - radius, y)
      context.quadraticCurveTo(drawWidth, y, drawWidth, y + radius)
      context.lineTo(drawWidth, y + drawHeight - radius)
      context.quadraticCurveTo(drawWidth, y + drawHeight, drawWidth - radius, y + drawHeight)
      context.lineTo(radius, y + drawHeight)
      context.quadraticCurveTo(0, y + drawHeight, 0, y + drawHeight - radius)
      context.lineTo(0, y + radius)
      context.quadraticCurveTo(0, y, radius, y)
      context.closePath()
      context.clip()
      context.drawImage(image, 0, y, drawWidth, drawHeight)
      context.restore()
      y += drawHeight + 14
    }
  }

  return canvas.toDataURL('image/png')
}

function estimateShareCommentHeight(markdown: string) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n')
  let units = 0
  let inCodeBlock = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      units += 2.4
      inCodeBlock = !inCodeBlock
      continue
    }

    if (!trimmed) {
      units += 0.9
      continue
    }

    if (inCodeBlock) {
      units += Math.max(1.4, Math.ceil(trimmed.length / 28) * 1.2)
      continue
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      units += 2.6 + Math.ceil(trimmed.length / 24) * 0.5
      continue
    }

    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      units += Math.max(1.5, Math.ceil(trimmed.length / 26) * 1.2)
      continue
    }

    units += Math.max(1.35, Math.ceil(trimmed.length / 30) * 1.25)
  }

  return Math.max(360, Math.ceil(units * 24 + 56))
}

function buildShareSvg(course: CourseData, review: Review, avatarUrl: string, markdownHtml: string) {
  const width = 1120
  const commentHeight = estimateShareCommentHeight(review.comment)
  const paperHeight = Math.max(960, commentHeight + 360)
  const foreignHeight = paperHeight + 176
  const height = foreignHeight + 144
  const reviewCode = review.sqid || `#${review.id}`
  const reviewDate = new Date(review.created_at * 1000).toLocaleDateString('zh-CN')
  const courseScore = Number(course.review_avg || 0) > 0 ? course.review_avg.toFixed(1) : '暂无'
  const reviewTotal = String(course.review_count || 0)
  const doodles = Array.from({ length: 9 }, (_, index) => {
    const x = 90 + (index * 97.13 % 1) * 940
    const y = 80 + (index * 83.21 % 1) * Math.max(220, height - 180)
    const radius = 24 + ((index * 52.71) % 29)
    const hue = 190 + ((index * 43) % 110)
    const opacity = 0.08 + ((index * 0.017) % 0.12)
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="hsla(${hue}, 90%, 70%, ${opacity.toFixed(3)})"/>`
  }).join('')

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="share-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e0f2fe"/>
          <stop offset="38%" stop-color="#f8fafc"/>
          <stop offset="100%" stop-color="#dbeafe"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="44" fill="url(#share-bg)"/>
      ${doodles}
      <foreignObject x="68" y="72" width="984" height="${foreignHeight}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="height:${foreignHeight}px;font-family:Inter,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#0f172a;position:relative;">
          <style>
            .share-root { min-height:${foreignHeight}px; display:flex; flex-direction:column; }
            .printer-top { height: 136px; border-radius: 34px 34px 22px 22px; background: linear-gradient(135deg, #0f172a, #1e293b); box-shadow: 0 24px 50px rgba(15, 23, 42, 0.18); padding: 28px 34px; color: white; display:flex; align-items:flex-start; justify-content:space-between; }
            .printer-title { font-size: 16px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.72); font-weight: 800; }
            .printer-name { margin-top: 10px; font-size: 34px; font-weight: 900; line-height: 1.25; max-width: 620px; }
            .printer-code { display:inline-flex; align-items:center; gap: 8px; padding: 10px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; font-size: 15px; font-weight: 800; }
            .paper { margin: -34px auto 0; width: 900px; min-height: ${paperHeight}px; background: rgba(255,255,255,0.96); border-radius: 22px; padding: 46px 48px 40px; box-shadow: 0 24px 60px rgba(14, 165, 233, 0.16); clip-path: polygon(0 0, 100% 0, 100% 96.5%, 98% 99%, 95.5% 97%, 93% 99%, 90% 96.5%, 87% 99%, 84% 96.7%, 81% 99%, 78% 96.5%, 75% 99%, 72% 96.7%, 69% 99%, 66% 96.5%, 63% 99%, 60% 96.7%, 57% 99%, 54% 96.5%, 51% 99%, 48% 96.7%, 45% 99%, 42% 96.5%, 39% 99%, 36% 96.7%, 33% 99%, 30% 96.5%, 27% 99%, 24% 96.7%, 21% 99%, 18% 96.5%, 15% 99%, 12% 96.7%, 9% 99%, 6% 96.5%, 3% 99%, 0 96.7%); }
            .meta-row { display:flex; align-items:center; justify-content:space-between; gap:18px; }
            .reviewer { display:flex; align-items:center; gap:16px; }
            .reviewer img { width: 58px; height: 58px; border-radius: 18px; object-fit: cover; }
            .reviewer-name { font-size: 20px; font-weight: 800; color:#0f172a; }
            .reviewer-sub { font-size: 13px; color:#64748b; margin-top: 6px; }
            .rating { display:flex; align-items:center; gap:10px; }
            .rating-stars { display:flex; gap:6px; align-items:center; }
            .star { width: 18px; height: 18px; color: #fbbf24; }
            .rating-value { font-size: 15px; font-weight: 900; color:#92400e; }
            .chips { margin-top: 26px; display:flex; flex-wrap:wrap; gap:10px; }
            .chip { border-radius:999px; padding: 8px 14px; font-size: 13px; font-weight: 800; }
            .chip.code { background:#ecfeff; color:#0f766e; }
            .chip.teacher { background:#f8fafc; color:#475569; }
            .chip.term { background:#eef2ff; color:#4338ca; }
            .chip.score { background:#fff7ed; color:#c2410c; }
            .chip.count { background:#ecfdf5; color:#047857; }
            .comment { margin-top: 28px; min-height:${commentHeight}px; border-radius: 24px; background: linear-gradient(180deg, #f8fbff, #ffffff); border:1px solid #dbeafe; padding: 26px 28px; color:#334155; line-height:1.9; font-size: 16px; }
            .comment p { margin: 10px 0; }
            .comment h1 { font-size: 26px; font-weight: 800; margin: 18px 0 12px; color:#0f172a; }
            .comment h2 { font-size: 22px; font-weight: 800; margin: 16px 0 10px; color:#0f172a; }
            .comment h3 { font-size: 18px; font-weight: 800; margin: 14px 0 8px; color:#0f172a; }
            .comment ul, .comment ol { margin: 10px 0 10px 22px; }
            .comment li { margin: 6px 0; }
            .comment pre { margin: 14px 0; padding: 14px 16px; border-radius: 16px; background:#0f172a; color:#e2e8f0; overflow:hidden; }
            .comment a { color:#0284c7; text-decoration: underline; }
            .comment strong { color:#0f172a; }
            .comment code { background:#e2e8f0; padding:2px 8px; border-radius:8px; font-size: 14px; font-family:Consolas,Monaco,monospace; }
            .footer { margin-top: 30px; padding-top: 30px; display:flex; justify-content:space-between; align-items:flex-end; gap:20px; }
            .brand-title { font-size: 24px; font-weight: 900; color:#0f172a; }
            .brand-sub { font-size: 14px; color:#64748b; margin-top: 6px; }
            .review-id { font-size: 15px; font-weight: 900; color:#334155; }
            .link { margin-top: 20px; font-size: 16px; color:#0ea5e9; font-weight: 800; text-align:center; }
          </style>
          <div class="share-root">
            <div class="printer-top">
              <div>
                <div class="printer-title">评论长图</div>
                <div class="printer-name">${escapeHtml(course.name)}</div>
              </div>
              <div class="printer-code">${escapeHtml(course.code)}</div>
            </div>
            <div class="paper">
              <div class="meta-row">
                <div class="reviewer">
                  <img src="${avatarUrl}" alt="avatar" />
                  <div>
                    <div class="reviewer-name">${escapeHtml(review.reviewer_name || '评论长图')}</div>
                    <div class="reviewer-sub">${escapeHtml(formatSemesterLabel(review.semester))} | ${reviewDate}</div>
                  </div>
                </div>
                <div class="rating">
                  <div class="rating-stars">
                    ${Array.from({ length: 5 }, (_, index) => `<svg class="star" viewBox="0 0 24 24" fill="${index < review.rating ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`).join('')}
                  </div>
                  <span class="rating-value">${Number(review.rating).toFixed(1)}/5</span>
                </div>
              </div>
              <div class="chips">
                <span class="chip code">评论长图 | ${escapeHtml(course.code)}</span>
                <span class="chip teacher">评论长图 | ${escapeHtml(course.teacher_name || '评论长图')}</span>
                <span class="chip term">评论长图 | ${escapeHtml(reviewCode)}</span>
                <span class="chip score">评论长图 | ${escapeHtml(courseScore)}</span>
                <span class="chip count">评论长图 | ${escapeHtml(reviewTotal)}</span>
              </div>
              <div class="comment">${markdownHtml}</div>
              <div class="footer">
                <div>
                  <div class="brand-title">YourTJ 评论长图</div>
                  <div class="brand-sub">分享评论预览分享评论预览分享评论预览??</div>
                </div>
                <div class="review-id">${escapeHtml(reviewCode)}</div>
              </div>
              <div class="link">https://xk.yourtj.de</div>
            </div>
          </div>
        </div>
      </foreignObject>
    </svg>
  `.trim()
}

void buildShareSvg

export default function Course() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<CourseData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [displayCount, setDisplayCount] = useState(20) // 初始显示20条评论
  const clientId = useMemo(() => getOrCreateClientId(), [])
  const walletHash = loadCreditWallet()?.userHash || ''
  const [sharePreview, setSharePreview] = useState<SharePreviewState | null>(null)
  const [shareBusyId, setShareBusyId] = useState<number | null>(null)
  const sharePreviewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!id) return
    setCourse(null)
    setLoadError('')
    fetchCourse(id, { clientId })
      .then(setCourse)
      .catch(() => setLoadError('加载失败，请重试'))
  }, [id, clientId])

  const handleLoadMore = () => {
    setDisplayCount(prev => prev + 20)
  }

  const toggleLike = async (reviewId: number) => {
    if (!course) return
    const reviews = course.reviews || []
    const target = reviews.find((r) => r.id === reviewId)
    if (!target) return

    const nextLiked = !target.liked

    // optimistic
    setCourse((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        reviews: prev.reviews.map((r) =>
          r.id === reviewId
            ? { ...r, liked: nextLiked, like_count: Math.max(0, Number(r.like_count || 0) + (nextLiked ? 1 : -1)) }
            : r
        )
      }
    })

    try {
      const res = nextLiked ? await likeReview(reviewId, clientId) : await unlikeReview(reviewId, clientId)
      const likeCount = Number(res?.like_count ?? 0)
      setCourse((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          reviews: prev.reviews.map((r) => (r.id === reviewId ? { ...r, liked: nextLiked, like_count: likeCount } : r))
        }
      })
      if (nextLiked) {
        window.dispatchEvent(new CustomEvent('yourtj-tour-like-done'))
      }
    } catch (_e) {
      // revert
      setCourse((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          reviews: prev.reviews.map((r) => (r.id === reviewId ? { ...r, liked: !nextLiked } : r))
        }
      })
    }
  }

  const startEdit = (review: Review) => {
    if (!id) return
    navigate(`/write-review/${id}?edit=1`, { state: { editReview: review } })
  }

  const openSharePreview = async (review: Review) => {
    if (!course) return

    setShareBusyId(review.id)

    try {
      const avatarSeed = review.reviewer_name?.trim() || `评论长图-${review.id}`
      let avatarUrl = buildBeamAvatarDataUri(avatarSeed, 88)

      if (review.reviewer_avatar) {
        try {
          avatarUrl = await fetchImageAsDataUrl(String(review.reviewer_avatar))
        } catch {
          avatarUrl = buildBeamAvatarDataUri(avatarSeed, 88)
        }
      }

      try {
        avatarUrl = await rasterizeImageSource(avatarUrl, { size: 88 })
      } catch {
        // ignore and keep original data url
      }

      const markdownHtml = await inlineMarkdownImages(renderMarkdownHtml(review.comment))
      const commentRasterUrl = markdownHtml.includes('<img') ? await renderCommentRaster(markdownHtml) : ''
      setSharePreview({ review, avatarUrl, markdownHtml, commentRasterUrl })
      window.dispatchEvent(new CustomEvent('yourtj-tour-share-opened'))
    } finally {
      setShareBusyId(null)
    }
  }

  const closeSharePreview = () => {
    setSharePreview(null)
  }

  const saveSharePreview = async () => {
    if (!sharePreview) return
    if (!sharePreviewRef.current) return

    try {
      const node = sharePreviewRef.current
      await waitForImages(node)
      let dataUrl = ''
      let extension: 'png' | 'jpg' = 'png'

      try {
        dataUrl = await exportShareNode(node, 'png')
      } catch {
        dataUrl = await exportShareNode(node, 'jpg')
        extension = 'jpg'
      }

      if (!dataUrl) throw new Error('export_failed')

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${course?.code || 'yourtj'}-${sharePreview.review.sqid || sharePreview.review.id}.${extension}`
      link.click()
      window.dispatchEvent(new CustomEvent('yourtj-tour-share-saved'))
    } catch (error) {
      console.error('分享评论导出失败', error)
      window.alert('导出图片失败，请稍后重试。')
    }
  }

  const renderSharePaper = (exportMode = false) => {
    if (!course || !sharePreview) return null

    const reviewDate = new Date(sharePreview.review.created_at * 1000).toLocaleDateString('zh-CN')
    const paperClassName = exportMode
      ? 'yourtj-share-paper w-[760px] overflow-hidden rounded-[26px] bg-white shadow-[0_28px_60px_rgba(14,165,233,0.16)]'
      : 'yourtj-share-paper w-full max-w-[760px] overflow-hidden rounded-[26px] bg-white shadow-[0_28px_60px_rgba(14,165,233,0.16)]'

    return (
      <div ref={exportMode ? sharePreviewRef : undefined} className={paperClassName}>
        <div className="bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
          <div className={`grid gap-4 border-b border-slate-100 pb-5 ${exportMode ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]'}`}>
            <div className="min-w-0">
              <div className="text-[11px] font-black tracking-[0.18em] text-slate-400">YOURTJ 选课社区</div>
              <div className={`mt-2 font-black leading-tight text-slate-900 ${exportMode ? 'text-[28px]' : 'text-[20px] sm:text-[28px]'}`}>{course.name}</div>
              <div className="mt-2 inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{course.code}</div>
            </div>
            <div className={`rounded-3xl bg-white/90 px-4 py-3 text-right shadow-sm ring-1 ring-slate-100 ${exportMode ? 'min-w-[150px]' : 'min-w-[138px] sm:min-w-[150px]'}`}>
              <div className="text-[11px] font-bold text-slate-400">课程评分</div>
              <div className={`mt-1 font-black text-amber-500 ${exportMode ? 'text-xl' : 'text-lg sm:text-xl'}`}>{course.review_avg?.toFixed(1) || '-'} / 5.0</div>
              <div className="mt-2 text-[11px] font-bold text-slate-400">评价数量</div>
              <div className={`mt-1 font-black text-slate-800 ${exportMode ? 'text-lg' : 'text-base sm:text-lg'}`}>{course.review_count} 条</div>
            </div>
          </div>

          <div className={`mt-5 flex gap-4 ${exportMode ? 'items-center justify-between' : 'flex-col sm:flex-row sm:items-center sm:justify-between'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <img src={sharePreview.avatarUrl} alt="头像" className={`${exportMode ? 'h-14 w-14' : 'h-12 w-12 sm:h-14 sm:w-14'} rounded-2xl object-cover ring-1 ring-slate-100`} />
              <div className="min-w-0">
                <div className={`truncate font-black text-slate-900 ${exportMode ? 'text-lg' : 'text-base sm:text-lg'}`}>{sharePreview.review.reviewer_name || '匿名用户'}</div>
                <div className="mt-1 text-xs font-semibold text-slate-400">{formatSemesterLabel(sharePreview.review.semester)} · {reviewDate}</div>
              </div>
            </div>
            <div className={`shrink-0 rounded-full bg-amber-50 font-black text-amber-600 ring-1 ring-amber-100 ${exportMode ? 'px-4 py-2 text-sm' : 'px-3.5 py-1.5 text-[13px] sm:px-4 sm:py-2 sm:text-sm'}`}>{Number(sharePreview.review.rating).toFixed(1)} / 5</div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 ring-1 ring-cyan-100">教师：{course.teacher_name || '未知教师'}</span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">学期：{formatSemesterLabel(sharePreview.review.semester)}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">编号：{sharePreview.review.sqid || sharePreview.review.id}</span>
          </div>

          <div className={`mt-6 rounded-[24px] border border-sky-100 bg-white text-slate-700 ${exportMode ? 'px-6 py-5 text-[15px] leading-8' : 'px-4 py-4 text-[14px] leading-7 sm:px-6 sm:py-5 sm:text-[15px] sm:leading-8'}`}>
            {exportMode && sharePreview.commentRasterUrl ? (
              <img src={sharePreview.commentRasterUrl} alt="评论内容" className="w-full rounded-[18px]" />
            ) : (
              <div dangerouslySetInnerHTML={{ __html: sharePreview.markdownHtml }} />
            )}
          </div>

          <div className="mt-6 flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>内容来自 YOURTJ 选课社区</span>
            <span>xk.yourtj.de</span>
          </div>
        </div>
      </div>
    )
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
            fetchCourse(id, { clientId })
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
      <div className="min-h-[100vh] grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
        <div className="lg:col-span-4 space-y-4">
          <GlassCard hover={false}>
            <div className="h-6 w-28 rounded-full bg-slate-200 mb-4" />
            <div className="h-8 w-3/4 rounded bg-slate-200 mb-3" />
            <div className="h-4 w-1/2 rounded bg-slate-200 mb-6" />
            <div className="space-y-3">
              <div className="h-14 rounded-xl bg-slate-200/80" />
              <div className="h-14 rounded-xl bg-slate-200/80" />
              <div className="h-14 rounded-xl bg-slate-200/80" />
            </div>
          </GlassCard>
        </div>
        <div className="lg:col-span-8 space-y-4">
          <div className="h-6 w-44 rounded bg-slate-200" />
          <GlassCard hover={false} className="!p-5">
            <div className="h-5 w-1/3 rounded bg-slate-200 mb-3" />
            <div className="h-4 w-full rounded bg-slate-200 mb-2" />
            <div className="h-4 w-11/12 rounded bg-slate-200 mb-2" />
            <div className="h-4 w-10/12 rounded bg-slate-200" />
          </GlassCard>
          <GlassCard hover={false} className="!p-5">
            <div className="h-5 w-1/3 rounded bg-slate-200 mb-3" />
            <div className="h-4 w-full rounded bg-slate-200 mb-2" />
            <div className="h-4 w-11/12 rounded bg-slate-200 mb-2" />
            <div className="h-4 w-10/12 rounded bg-slate-200" />
          </GlassCard>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Course Info */}
      <div className="lg:col-span-4 space-y-4">
        <GlassCard className="bg-gradient-to-b from-cyan-50/80 to-white" hover={false}>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full text-xs font-bold text-cyan-600 shadow-sm mb-4">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
            {course.code}
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-1">{course.name}</h2>
          <p className="text-slate-500 font-medium mb-6">{course.department}</p>
          {Array.isArray(course.semesters) && course.semesters.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {course.semesters.map((s) => (
                <span
                  key={s}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-white">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center text-cyan-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">授课教师</p>
                <p className="text-sm font-bold text-slate-700">{course.teacher_name || '未知教师'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-white">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-500">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">综合评分</p>
                <p className="text-sm font-bold text-slate-700">{course.review_avg?.toFixed(1) || '-'} / 5.0</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-white">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">课程学分</p>
                <p className="text-sm font-bold text-slate-700">{course.credit} 学分</p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-cyan-100/50">
            <Link
              to={`/write-review/${course.id}`}
              data-tour="tour-write-review-button"
              className="w-full py-3 bg-slate-800 text-white rounded-2xl font-bold shadow-lg hover:bg-slate-700 hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              撰写评价
            </Link>
          </div>
        </GlassCard>
      </div>

      {/* Right: Reviews */}
      <div className="lg:col-span-8 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold text-slate-800">
            课程评价 <span className="text-slate-400 text-sm font-normal">({course.review_count})</span>
          </h3>
        </div>

        {course.reviews?.length > 0 ? (
          <>
            {course.reviews.slice(0, displayCount).map((review, index) => (
              <GlassCard
                key={review.id}
                hover={false}
                className="!p-5"
              >
                <div data-tour={index === 0 ? 'tour-latest-review' : undefined}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    {getReviewAvatarUrl(review, 36) ? (
                      <img
                        src={getReviewAvatarUrl(review, 36)}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center text-cyan-700 text-sm font-bold border-2 border-white shadow-sm">
                        匿
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-700">{review.reviewer_name || '匿名用户'}</p>
                      <p className="text-[10px] text-slate-400">{formatSemesterLabel(review.semester)} · {new Date(review.created_at * 1000).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <svg key={s} className={`w-4 h-4 ${s <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ))}
                  </div>
                </div>

                <div className="text-slate-600 text-sm leading-relaxed mb-3">
                  <CollapsibleMarkdown content={review.comment} maxLength={300} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleLike(review.id)}
                    data-tour={index === 0 ? 'tour-like-button' : undefined}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-extrabold transition-colors ${
                      review.liked
                        ? 'bg-orange-50 border-orange-200 text-orange-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    title={review.liked ? '撤销点赞' : '点赞'}
                  >
                    <svg
                      className={`w-4 h-4 ${review.liked ? 'text-orange-600' : 'text-slate-400'}`}
                      viewBox="0 0 24 24"
                      fill={review.liked ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 11v10H3V11h4z" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 11l5-7a2 2 0 013 2l-1 5h5a2 2 0 012 2l-2 7a2 2 0 01-2 2H7"
                      />
                    </svg>
                    <span>{Number(review.like_count || 0)}</span>
                    <span className="text-[10px] font-black opacity-80">点赞</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void openSharePreview(review)}
                    data-tour={index === 0 ? 'tour-share-button' : undefined}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white border-slate-200 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                    title="评论长图"
                  >
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C9.046 13.12 9.47 13 9.91 13c.44 0 .864.12 1.226.342l3.218 1.974A3 3 0 1016 14a2.99 2.99 0 00-1.646.494l-3.218-1.974A3.001 3.001 0 0010 7a3 3 0 101.136 2.774l3.218 1.974A3 3 0 1016 10a2.99 2.99 0 00-1.646.494l-3.218-1.974A3 3 0 108.684 13.342z" />
                    </svg>
                    <span className="text-[10px] font-black opacity-80">{shareBusyId === review.id ? '生成中...' : '分享评论'}</span>
                  </button>

                  {walletHash && String(review.wallet_user_hash || '').trim() === walletHash && (
                    <button
                      type="button"
                      onClick={() => startEdit(review)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white border-slate-200 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                      title="编辑我的评价"
                    >
                      <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
                      </svg>
                      <span className="text-[10px] font-black opacity-80">编辑</span>
                    </button>
                  )}

                  {review.sqid && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                      <span className="font-mono">{review.sqid}</span>
                    </div>
                  )}
                </div>
                </div>
              </GlassCard>
            ))}

            {/* 加载更多按钮 */}
            {displayCount < course.reviews.length && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleLoadMore}
                  className="px-6 py-3 bg-white/70 hover:bg-white/90 backdrop-blur-sm border border-white/60 rounded-2xl font-semibold text-slate-700 shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  加载更多 ({course.reviews.length - displayCount} 条)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white/50 rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium">暂无评价，快来抢沙发吧！</p>
          </div>
        )}
      </div>
    </div>

      {sharePreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm" onClick={closeSharePreview}>
          <div className="yourtj-share-printer max-h-full w-full max-w-[960px] overflow-auto rounded-[32px] bg-white/95 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.32)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-center sm:text-left">
                <div className="text-xs font-black tracking-[0.28em] text-slate-400">分享评论预览</div>
                <div className="mt-2 flex justify-center sm:justify-start">
                  <span className="inline-block whitespace-nowrap bg-gradient-to-r from-sky-400 via-slate-300 to-cyan-500 bg-clip-text text-[11px] font-bold text-transparent sm:text-xs">
                    不记名、自由、简洁、高效的选课社区
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  data-tour="tour-share-save"
                  onClick={() => void saveSharePreview()}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-800 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-slate-700"
                >
                  保存图片
                </button>
                <button
                  type="button"
                  onClick={closeSharePreview}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-[28px] bg-gradient-to-b from-slate-900 to-slate-700 p-4 shadow-inner">
              <div className="yourtj-printer-bar mx-auto h-4 w-48 rounded-full bg-slate-950/60" />
            </div>

            <div className="yourtj-share-paper-wrapper mt-[-10px] flex justify-center px-0 pb-2 pt-0 sm:px-2">
              {renderSharePaper(false)}
            </div>

            <div className="pointer-events-none fixed -left-[10000px] top-0 opacity-0">
              {renderSharePaper(true)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

