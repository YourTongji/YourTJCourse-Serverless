<template>
  <!-- Mobile: 自定义“扇面扑克牌”评价面板（从右侧滑入） -->
  <teleport to="body">
    <transition name="review-panel">
      <div v-if="open && isMobile" class="fixed inset-0 z-[2000]">
        <div class="absolute inset-0 bg-black/40" @click="emitClose"></div>

        <div class="review-panel__sheet absolute right-0 top-0 h-full w-[86vw] max-w-[420px] bg-white shadow-2xl flex flex-col">
          <div class="p-4 border-b border-slate-200">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-sm font-bold text-slate-800">课程评价</div>
                <div class="text-xs text-slate-500 truncate">{{ courseName }} ({{ courseCode }})</div>
              </div>
              <button
                class="shrink-0 w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                type="button"
                @click="emitClose"
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            <div class="mt-2 text-[11px] text-slate-500">
              <span v-if="summary">{{ summary.review_count ?? 0 }} 条评价</span>
              <span v-if="summary && (summary.review_count ?? 0) > 0" class="ml-2">均分 {{ (summary.review_avg ?? 0).toFixed(2) }}</span>
            </div>
          </div>

          <div class="p-4 flex-1 overflow-hidden">
            <a-spin :spinning="loading">
              <div v-if="error" class="text-red-500 text-sm">{{ error }}</div>

              <div v-else-if="reviews.length === 0" class="text-sm text-slate-500">
                暂无评价
              </div>

              <div v-else class="mt-2">
                <div class="review-viewport">
                  <div v-if="reviews.length > 1" class="fan-card fan-left">
                    <ReviewFanCard :review="prevReview" />
                  </div>

                  <div class="fan-center-wrap">
                    <transition :name="fanTransitionName" mode="out-in">
                      <div class="fan-card fan-center" :key="currentKey">
                        <ReviewFanCard :review="currentReview" :enableLike="true" :likeLoading="likeBusy" :onToggleLike="toggleLike" />
                      </div>
                    </transition>

                    <button
                      class="fan-nav fan-nav--left"
                      type="button"
                      :disabled="reviews.length < 2"
                      @click.stop.prevent="onNav('prev')"
                      @touchstart.stop.prevent="onNav('prev')"
                      @pointerdown.stop.prevent="onNav('prev')"
                      aria-label="上一条"
                    >
                      ‹
                    </button>
                    <button
                      class="fan-nav fan-nav--right"
                      type="button"
                      :disabled="reviews.length < 2"
                      @click.stop.prevent="onNav('next')"
                      @touchstart.stop.prevent="onNav('next')"
                      @pointerdown.stop.prevent="onNav('next')"
                      aria-label="下一条"
                    >
                      ›
                    </button>

                    <div class="fan-indicator">
                      {{ currentIndex + 1 }} / {{ reviews.length }}
                    </div>
                  </div>

                  <div v-if="reviews.length > 1" class="fan-card fan-right">
                    <ReviewFanCard :review="nextReview" />
                  </div>
                </div>
              </div>
            </a-spin>
          </div>

        </div>
      </div>
    </transition>
  </teleport>

  <!-- Desktop: 保留 Drawer（列表样式） -->
  <a-drawer
    v-if="open && !isMobile"
    :open="open"
    placement="right"
    :width="520"
    @close="emitClose"
    :title="title"
    :maskClosable="true"
  >
    <a-spin :spinning="loading">
      <div v-if="error" class="text-red-500 text-sm">{{ error }}</div>

      <div v-else>
        <div class="mb-3">
          <div class="text-sm text-gray-600">
            <span v-if="summary">{{ summary.review_count ?? 0 }} 条评价</span>
            <span v-if="summary && (summary.review_count ?? 0) > 0" class="ml-2">均分 {{ (summary.review_avg ?? 0).toFixed(2) }}</span>
          </div>
        </div>

        <div v-if="reviews.length === 0" class="text-sm text-gray-500">
          暂无评价
        </div>

        <div v-else class="space-y-3">
          <a-card v-for="r in reviews" :key="r.sqid || r.id" size="small">
            <div class="flex items-center justify-between mb-1">
              <div class="text-xs text-gray-500">
                <span>{{ r.reviewer_name || '匿名用户' }}</span>
                <span v-if="r.semester" class="ml-2">{{ r.semester }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="typeof r.rating === 'number'" class="text-xs text-gray-600">评分 {{ r.rating }}</span>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-extrabold transition-colors"
                  :class="r.liked ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
                  :disabled="likeBusy"
                  @click.stop.prevent="toggleLike(r)"
                  aria-label="点赞"
                  title="点赞"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 11v10H3V11h4z" />
                    <path d="M7 11l5-7a2 2 0 013 2l-1 5h5a2 2 0 012 2l-2 7a2 2 0 01-2 2H7" />
                  </svg>
                  <span>{{ Number(r.like_count || 0) }}</span>
                </button>
              </div>
            </div>
            <div class="review-markdown text-sm break-words" v-html="renderComment(r.comment || '')"></div>
          </a-card>
        </div>
      </div>
    </a-spin>

    <div class="sticky bottom-0 pt-3 bg-white">
      <a-button block @click="emitClose">关闭</a-button>
    </div>
  </a-drawer>
</template>

<script lang="ts">
import axios from 'axios'
import { Drawer } from 'ant-design-vue'
import ReviewFanCard from './ReviewFanCard.vue'
import { renderMarkdown } from '@/utils/markdown'
import { getOrCreateClientId } from '@/utils/clientId'
import { isMobile as getIsMobile, onMobileChange } from '@/utils/responsive'

type Review = {
  id?: number
  sqid?: string
  semester?: string
  rating?: number
  comment?: string
  reviewer_name?: string
  reviewer_avatar?: string
  like_count?: number
  liked?: boolean
}

export default {
  name: 'CourseReviewDrawer',
  props: {
    open: { type: Boolean, required: true },
    courseCode: { type: String, required: true },
    courseName: { type: String, required: true },
    teacherName: { type: String, default: '' },
    teacherCode: { type: String, default: '' },
  },
  emits: ['close'],
  data() {
    return {
      loading: false,
      error: '',
      summary: null as null | { review_avg?: number; review_count?: number },
      reviews: [] as Review[],
      currentIndex: 0,
      lastDir: 'next' as 'next' | 'prev',
      isMobile: false,
      navLockUntil: 0,
      clientId: '' as string,
      likeBusy: false,
    }
  },
  computed: {
    title() {
      return `课程评价 - ${this.courseName} (${this.courseCode})`
    },
    currentReview(): Review {
      return this.reviews[this.currentIndex] || {}
    },
    prevReview(): Review {
      if (this.reviews.length === 0) return {}
      const idx = (this.currentIndex - 1 + this.reviews.length) % this.reviews.length
      return this.reviews[idx] || {}
    },
    nextReview(): Review {
      if (this.reviews.length === 0) return {}
      const idx = (this.currentIndex + 1) % this.reviews.length
      return this.reviews[idx] || {}
    },
    currentKey() {
      const r: any = this.currentReview
      return r?.sqid || r?.id || this.currentIndex
    },
    fanTransitionName() {
      return this.lastDir === 'next' ? 'fan-next' : 'fan-prev'
    }
  },
  watch: {
    open: {
      immediate: false,
      async handler(val: boolean) {
        if (!val) return
        this.currentIndex = 0
        await this.fetchReviews()
      }
    },
    teacherCode() {
      if (!this.open) return
      this.currentIndex = 0
      void this.fetchReviews()
    },
    teacherName() {
      if (!this.open) return
      this.currentIndex = 0
      void this.fetchReviews()
    }
  },
  mounted() {
    this.clientId = getOrCreateClientId()
    this._cleanupMobile = onMobileChange((v: boolean) => { this.isMobile = v })
    this.isMobile = getIsMobile()
  },
  beforeUnmount() {
    if (this._cleanupMobile) this._cleanupMobile()
  },
  methods: {
    emitClose() {
      this.$emit('close')
    },
    renderComment(md: string) {
      return renderMarkdown(md || '')
    },
    onNav(dir: 'next' | 'prev') {
      if (this.reviews.length < 2) return

      const now = Date.now()
      if (now < this.navLockUntil) return
      this.navLockUntil = now + 220

      if (dir === 'next') this.goNext()
      else this.goPrev()
    },
    goNext() {
      if (this.reviews.length < 2) return
      this.lastDir = 'next'
      this.currentIndex = (this.currentIndex + 1) % this.reviews.length
    },
    goPrev() {
      if (this.reviews.length < 2) return
      this.lastDir = 'prev'
      this.currentIndex = (this.currentIndex - 1 + this.reviews.length) % this.reviews.length
    },
    async fetchReviews() {
      this.loading = true
      this.error = ''
      this.reviews = []
      this.summary = null
      try {
        const code = encodeURIComponent(this.courseCode)
        const tn = String(this.teacherName || '').trim()
        const tc = String(this.teacherCode || '').trim()
        const params: any = {}
        if (tc) params.teacherCode = tc
        if (tn) params.teacherName = tn
        if (this.clientId) params.clientId = this.clientId
        const qs = new URLSearchParams(params).toString()
        const res = await axios.get(`/api/course/by-code/${code}${qs ? `?${qs}` : ''}`)
        const data = res.data || {}
        this.summary = {
          review_avg: data.review_avg,
          review_count: data.review_count,
        }
        this.reviews = Array.isArray(data.reviews) ? data.reviews : []
      } catch (e: any) {
        const msg = e?.response?.data?.error || e?.message || '获取评价失败'
        this.error = msg
      } finally {
        this.loading = false
      }
    },
    async toggleLike(r: any) {
      if (!r || !r.id) return
      if (!this.clientId) this.clientId = getOrCreateClientId()
      if (this.likeBusy) return
      this.likeBusy = true
      try {
        const id = Number(r.id)
        const nextLiked = !Boolean(r.liked)

        // optimistic update
        this.reviews = this.reviews.map((x: any) =>
          Number(x.id) === id
            ? { ...x, liked: nextLiked, like_count: Math.max(0, Number(x.like_count || 0) + (nextLiked ? 1 : -1)) }
            : x
        )

        const res = nextLiked
          ? await axios.post(`/api/review/${id}/like`, { clientId: this.clientId })
          : await axios.delete(`/api/review/${id}/like`, { data: { clientId: this.clientId } })

        const likeCount = Number(res?.data?.like_count ?? 0)
        this.reviews = this.reviews.map((x: any) => (Number(x.id) === id ? { ...x, liked: nextLiked, like_count: likeCount } : x))
      } catch (_e) {
        // ignore; state will be corrected next fetch
      } finally {
        this.likeBusy = false
      }
    }
  },
  components: { ReviewFanCard, ADrawer: Drawer }
}
</script>

<style scoped>
.review-markdown :deep(p) {
  margin: 0 0 0.65rem 0;
}
.review-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.review-markdown :deep(ul),
.review-markdown :deep(ol) {
  padding-left: 1.1rem;
  margin: 0 0 0.65rem 0;
}
.review-markdown :deep(li) {
  margin: 0.15rem 0;
}
.review-markdown :deep(pre) {
  margin: 0 0 0.65rem 0;
  padding: 0.6rem 0.75rem;
  border-radius: 0.9rem;
  background: rgba(15, 23, 42, 0.06);
  overflow: auto;
}
.review-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.92em;
}
.review-markdown :deep(a) {
  color: rgb(14 116 144);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>

<style scoped>
.fan-card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 78%;
  max-width: 320px;
  transform-origin: center center;
  transition: transform 260ms ease, opacity 260ms ease, filter 260ms ease;
}

.review-viewport {
  position: relative;
  height: 100%;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fan-center-wrap {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 82%;
  max-width: 340px;
  height: calc(100% - 8px);
  min-height: 320px;
  transform: translate(-50%, -50%);
  z-index: 30;
}

.fan-center {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: none;
  transform: none;
  height: 100%;
  opacity: 1;
  filter: blur(0px);
  z-index: 20;
}
.fan-left {
  width: 72%;
  max-width: 300px;
  height: min(62dvh, 600px);
  min-height: 300px;
  transform: translate(-118%, -50%) rotate(-12deg) scale(0.93);
  opacity: 0.45;
  filter: blur(1.4px);
  z-index: 10;
  pointer-events: none;
}
.fan-right {
  width: 72%;
  max-width: 300px;
  height: min(62dvh, 600px);
  min-height: 300px;
  transform: translate(18%, -50%) rotate(12deg) scale(0.93);
  opacity: 0.45;
  filter: blur(1.4px);
  z-index: 10;
  pointer-events: none;
}

.fan-nav {
  position: absolute;
  top: 50%;
  width: 38px;
  height: 38px;
  transform: translateY(-50%);
  border-radius: 999px;
  border: 1px solid rgba(251, 146, 60, 0.45);
  background: rgba(255, 247, 237, 0.38);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  color: rgba(249, 115, 22, 0.95);
  font-size: 24px;
  line-height: 1;
  display: grid;
  place-items: center;
  backdrop-filter: blur(12px);
  z-index: 40;
  touch-action: manipulation;
  pointer-events: auto;
}
.fan-nav:disabled {
  opacity: 0.35;
}
.fan-nav--left {
  left: -12px;
}
.fan-nav--right {
  right: -12px;
}

.fan-indicator {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 1);
  background: rgba(255, 255, 255, 0.9);
  color: rgba(51, 65, 85, 1);
  font-size: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.review-panel-enter-active,
.review-panel-leave-active {
  transition: opacity 200ms ease;
}
.review-panel-enter-from,
.review-panel-leave-to {
  opacity: 0;
}
.review-panel-enter-active .review-panel__sheet,
.review-panel-leave-active .review-panel__sheet {
  transition: transform 260ms ease;
}
.review-panel-enter-from .review-panel__sheet,
.review-panel-leave-to .review-panel__sheet {
  transform: translateX(100%);
}

.fan-next-enter-active,
.fan-next-leave-active,
.fan-prev-enter-active,
.fan-prev-leave-active {
  transition: transform 240ms ease, opacity 240ms ease;
}
.fan-next-enter-from {
  transform: translateX(10%) rotate(10deg) scale(0.98);
  opacity: 0;
}
.fan-next-leave-to {
  transform: translateX(-10%) rotate(-10deg) scale(0.98);
  opacity: 0;
}
.fan-prev-enter-from {
  transform: translateX(-10%) rotate(-10deg) scale(0.98);
  opacity: 0;
}
.fan-prev-leave-to {
  transform: translateX(10%) rotate(10deg) scale(0.98);
  opacity: 0;
}
</style>
