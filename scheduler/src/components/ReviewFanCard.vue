<template>
  <div class="h-full rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
    <div class="h-full p-4 flex flex-col">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-2xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-slate-500 text-xs font-bold">
            <img v-if="reviewerAvatar" :src="reviewerAvatar" alt="" class="w-full h-full object-cover" />
            <span v-else>评</span>
          </div>
          <div class="min-w-0">
            <div class="text-sm font-extrabold text-slate-800 truncate">{{ reviewerName }}</div>
            <div class="text-[11px] text-slate-500 truncate">{{ semester }}</div>
          </div>
        </div>
        <div class="shrink-0 flex items-center gap-2">
          <span v-if="typeof review?.rating === 'number'" class="text-[11px] text-slate-600">评分 {{ review.rating }}</span>
          <button
            v-if="enableLike"
            type="button"
            class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-extrabold transition-colors"
            :class="liked ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
            :disabled="likeLoading"
            @click.stop.prevent="onToggle"
            aria-label="点赞"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v10H3V11h4z"/><path d="M7 11l5-7a2 2 0 013 2l-1 5h5a2 2 0 012 2l-2 7a2 2 0 01-2 2H7"/></svg>
            <span>{{ likeCount }}</span>
          </button>
          <button
            v-if="enableReport"
            type="button"
            class="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 text-[11px] font-extrabold text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            @click.stop.prevent="onReport"
            aria-label="举报"
            title="举报此评价"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </button>
        </div>
      </div>

      <div class="mt-3 flex-1 overflow-y-auto pr-1">
        <div class="review-markdown text-[13px] leading-snug text-slate-700 break-words" v-html="commentHtml"></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { renderMarkdown } from '@/utils/markdown'

export default {
  name: 'ReviewFanCard',
  props: {
    review: { type: Object, required: true },
    enableLike: { type: Boolean, default: false },
    enableReport: { type: Boolean, default: false },
    likeLoading: { type: Boolean, default: false },
    onToggleLike: { type: Function, default: null },
    onReportReview: { type: Function, default: null },
  },
  computed: {
    reviewerName(): string {
      // @ts-ignore
      return (this.review?.reviewer_name as string) || '匿名用户'
    },
    reviewerAvatar(): string {
      // @ts-ignore
      return (this.review?.reviewer_avatar as string) || ''
    },
    semester(): string {
      // @ts-ignore
      return (this.review?.semester as string) || ''
    },
    comment(): string {
      // @ts-ignore
      return (this.review?.comment as string) || ''
    },
    commentHtml(): string {
      return renderMarkdown(this.comment || '')
    },
    liked(): boolean {
      // @ts-ignore
      return Boolean(this.review?.liked)
    },
    likeCount(): number {
      // @ts-ignore
      return Number(this.review?.like_count || 0)
    },
  },
  methods: {
    onToggle() {
      // @ts-ignore
      if (typeof this.onToggleLike === 'function') this.onToggleLike(this.review)
    },
    onReport() {
      // @ts-ignore
      if (typeof this.onReportReview === 'function') this.onReportReview(this.review)
    },
  },
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
