<template>
    <a-layout-content class="m-2">
        <div v-if="isMobile" class="px-1 pb-2 text-[11px] text-slate-500">
            提示：长按课程块查看详细信息
        </div>
        <div
            class="overflow-x-hidden max-w-full rounded-2xl border border-slate-200 bg-white/70 shadow-sm"
            :style="{ minHeight: tableMinHeight() + 'px' }"
        >
        <div v-if="creditSummary.show" class="px-3 py-2 border-b border-slate-200 bg-white/70">
            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] md:text-xs">
                <div class="flex flex-wrap items-center gap-3">
                    <span class="font-extrabold text-slate-700">学分</span>
                    <span class="text-slate-600">应修专业 {{ creditSummary.targetMajor.toFixed(1) }}</span>
                    <span class="text-slate-600">可选专选 {{ creditSummary.targetMajorElective.toFixed(1) }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                    <span class="text-slate-600">已选专业 {{ creditSummary.selectedMajor.toFixed(1) }}</span>
                    <span class="text-slate-600">已选专选 {{ creditSummary.selectedMajorElective.toFixed(1) }}</span>
                    <span class="text-slate-600">已选通识 {{ creditSummary.selectedOptional.toFixed(1) }}</span>
                </div>
            </div>
        </div>
        <table class="w-full min-w-0 border-collapse table-fixed">
            <thead>
                <tr class="bg-slate-100/80">
                    <th class="border border-slate-200 p-1 md:p-2 text-[10px] md:text-xs font-semibold text-slate-700 w-[42px] md:w-[78px]">节次</th>
                    <th
                        v-for="day in ['一', '二', '三', '四', '五', '六', '日']"
                        :key="day"
                        class="border border-slate-200 p-1 md:p-2 text-[10px] md:text-xs font-semibold text-slate-700"
                    >
                        周{{ day }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, index) in timeTable" :key="index" :class="getRowClass(index)">
                    <td
                        class="border border-slate-200 text-center h-[36px] md:h-[48px] p-1 md:p-2 text-[10px] md:text-xs font-semibold text-slate-700 bg-white/70"
                        :class="index == 11 ? 'text-red-600' : ''"
                    >
                        第{{ index + 1 }}节
                    </td>
                    <template v-for="(courses, dayIndex) in row">
                        <td 
                            v-if="!occupied[index][dayIndex]"
                            :key="dayIndex"
                            class="border border-slate-200 align-top text-center p-[2px] md:p-1 bg-white/60"
                            :rowspan="maxSpans[index][dayIndex]"
                            @click="handleCellClick({ dayIndex, rowIndex: index })"
                        >
                            <div
                                v-if="courses.length > 0"
                                class="h-full rounded-xl overflow-hidden"
                                :style="{ height: (maxSpans[index][dayIndex] * cellUnitHeight()) + 'px' }"
                            >
                                <div
                                    v-for="(course, courseIndex) in courses"
                                    :key="course.code + '_' + courseIndex"
                                    class="h-full px-1 md:px-2 py-1 md:py-2 text-[10px] md:text-[11px] leading-tight text-white"
                                    :class="[isMobile ? 'text-center' : 'text-left', courseIndex !== courses.length - 1 ? 'border-b border-dashed border-white/60' : '']"
                                    :style="courseCardStyle(course)"
                                    @touchstart.stop="onPressStart(course, $event)"
                                    @touchmove.stop="onPressMove($event)"
                                    @touchend.stop="onPressCancel()"
                                    @touchcancel.stop="onPressCancel()"
                                    @mousedown.stop="onPressStart(course, $event)"
                                    @mouseup.stop="onPressCancel()"
                                    @mouseleave.stop="onPressCancel()"
                                >
                                    <div v-if="isMobile" class="tt-mobile-course">
                                        <div class="tt-mobile-title" :title="formatCourseLines(course).title">
                                            {{ formatCourseLines(course).mobileTitle }}
                                        </div>
                                        <div
                                            v-if="course.occupyTime.length >= 2 && formatCourseLines(course).mobileMeta"
                                            class="tt-mobile-meta"
                                        >
                                            {{ formatCourseLines(course).mobileMeta }}
                                        </div>
                                    </div>
                                    <template v-else>
                                        <div class="font-extrabold tracking-tight break-words">
                                            {{ formatCourseLines(course).title }}
                                        </div>
                                        <div class="mt-1 opacity-95 whitespace-pre-line break-words">
                                            {{ formatCourseLines(course).sub }}
                                        </div>
                                        <div v-if="formatCourseLines(course).meta" class="mt-1 text-[10px] opacity-90">
                                          {{ formatCourseLines(course).meta }}
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </td>
                    </template>
                </tr>
            </tbody>
        </table>
        </div>

        <!-- Mobile: long-press detail card -->
        <teleport to="body">
            <transition name="tt-detail">
                <div v-if="isMobile && mobileDetailOpen" class="fixed inset-0 z-[2100]">
                    <div class="absolute inset-0 bg-black/40" @click="closeMobileDetail"></div>
                    <div class="absolute left-1/2 top-1/2 w-[88vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2">
                        <div class="rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden" @click.stop>
                            <div class="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
                                <div class="text-sm font-extrabold">{{ mobileDetailInfo.name }}</div>
                                <div class="text-[11px] opacity-90">{{ mobileDetailInfo.code }}</div>
                            </div>
                            <div class="p-4 space-y-2">
                                <div class="text-[12px] text-slate-600">{{ mobileDetailInfo.teacherAndCode }}</div>
                                <div class="text-[13px] leading-snug text-slate-800 whitespace-pre-wrap break-words">
                                    {{ mobileDetailInfo.arrangement }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </transition>
        </teleport>
    </a-layout-content>
</template>

<script lang="ts">
import { errorNotify } from '@/utils/notify';
import type { courseOnTable } from '@/utils/myInterface';
import { isMobile as getIsMobile, onMobileChange } from '@/utils/responsive';

export default {
    name: 'timeTable',
    data() {
        return {
            timeTable: Array(12).fill(null).map(() => Array(7).fill(undefined).map(() => [])) as courseOnTable[][][],
            maxSpans: Array.from({ length: 12 }, () => Array(7).fill(1)),
            occupied: Array.from({ length: 12 }, () => Array(7).fill(false)), // 这个 occupied 表示的并不是一个单元格内有没有课程，而是这个单元格有没有被 startTime 不是这节课的课程占用
            isMobile: getIsMobile(),
            _cleanupMobile: null as (() => void) | null,
            pressTimer: null as any,
            pressStartX: 0,
            pressStartY: 0,
            mobileDetailOpen: false,
            mobileDetailCourse: null as null | courseOnTable,
        }
    },
    methods: {
        cellUnitHeight() {
            // 移动端更紧凑：保证竖屏一屏可看完整周课表（不横向滚动）
            return this.isMobile ? 44 : 54
        },
        tableMinHeight() {
            return this.isMobile ? 620 : 820
        },
        hashColor(input: string) {
            let h = 0
            for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
            return h
        },
        courseCardStyle(course: courseOnTable) {
            const seed = this.hashColor(course.code || course.courseName || course.showText || 'course')
            const hue = seed % 360
            const hue2 = (hue + 24) % 360
            if (this.isMobile) {
                return { background: `linear-gradient(135deg, hsl(${hue}, 82%, 52%), hsl(${hue2}, 82%, 42%))` }
            }
            // 桌面端：接近原版的紫色课程块
            return { background: 'linear-gradient(135deg, #5d57e8, #4b3fd9)' }
        },
        compactCourseName(name: string) {
            const cleaned = String(name || '')
                .replace(/[（(][^()（）]*[）)]/g, '')
                .replace(/\s+/g, '')
                .trim()
            if (!cleaned) return '课程'

            const chars = Array.from(cleaned)
            return chars.length > 7 ? `${chars.slice(0, 6).join('')}…` : cleaned
        },
        compactMobileMeta(teacher: string, room: string) {
            const teacherText = String(teacher || '').replace(/[A-Z0-9]+$/i, '').trim()
            const roomText = String(room || '')
                .replace(/校区/g, '')
                .replace(/教学楼|学院楼|综合楼/g, '')
                .replace(/\s+/g, '')
                .trim()
            return [teacherText, roomText].filter(Boolean).join(' · ')
        },
        formatCourseLines(course: courseOnTable) {
            const raw = String(course.showText || '').trim()

            // teacher name | course name (code) | room/campus...
            const m = /^(\S+)\s+(.+?)\(([^)]+)\)\s+(.+)$/.exec(raw)
            if (m) {
                const teacher = m[1]
                const name = m[2].trim()
                const code = m[3].trim()
                const rest = m[4].trim()
                const dayMatch = rest.match(/(星期[一二三四五六日])([0-9]{1,2}-[0-9]{1,2})节/)
                const weekMatch = rest.match(/\[([^\]]+)\]/)
                const roomMatch = rest.match(/\]\s*(.+)$/)
                const shortDay = dayMatch ? `${dayMatch[1].replace('星期', '周')}${dayMatch[2]}` : ''
                const weekText = weekMatch ? weekMatch[1] : ''
                let room = roomMatch ? roomMatch[1].trim() : ''
                if (this.isMobile && room) {
                    room = room.replace(/校区/g, '').replace(/\\s+/g, ' ').trim()
                }

                if (this.isMobile) {
                    return {
                        title: name,
                        mobileTitle: this.compactCourseName(name),
                        mobileMeta: this.compactMobileMeta(teacher, room),
                        sub: '',
                        meta: ''
                    }
                }

                return {
                    title: `${teacher} ${name}(${code})`,
                    mobileTitle: this.compactCourseName(name),
                    mobileMeta: this.compactMobileMeta(teacher, room),
                    sub: [shortDay, weekText, room].filter(Boolean).join(' '),
                    meta: ''
                }
            }

            const fallbackTitle = course.courseName || course.code || '课程'
            return {
                title: fallbackTitle,
                mobileTitle: this.compactCourseName(fallbackTitle),
                mobileMeta: course.code || '',
                sub: raw,
                meta: course.code || ''
            }
        },
        parseShowText(raw: string) {
            const text = String(raw || '').trim()
            const m = /^(\S+)\s+(.+?)\(([^)]+)\)\s+(.+)$/.exec(text)
            if (!m) {
                return { teacherAndCode: '', name: '', code: '', arrangement: text }
            }
            return { teacherAndCode: m[1], name: m[2].trim(), code: m[3].trim(), arrangement: m[4].trim() }
        },
        onPressStart(course: courseOnTable, ev: any) {
            if (!this.isMobile) return
            this.onPressCancel()

            const p = ev?.touches?.[0] || ev
            this.pressStartX = Number(p?.clientX ?? 0)
            this.pressStartY = Number(p?.clientY ?? 0)

            this.pressTimer = setTimeout(() => {
                this.pressTimer = null
                this.mobileDetailCourse = course
                this.mobileDetailOpen = true
            }, 420)
        },
        onPressMove(ev: any) {
            if (!this.isMobile || !this.pressTimer) return
            const p = ev?.touches?.[0]
            if (!p) return
            const dx = Math.abs(Number(p.clientX ?? 0) - this.pressStartX)
            const dy = Math.abs(Number(p.clientY ?? 0) - this.pressStartY)
            if (dx > 10 || dy > 10) this.onPressCancel()
        },
        onPressCancel() {
            if (this.pressTimer) clearTimeout(this.pressTimer)
            this.pressTimer = null
        },
        closeMobileDetail() {
            this.mobileDetailOpen = false
            this.mobileDetailCourse = null
        },
        getRowClass(index: number) {
            if (index === 11) return 'bg-red-50'
            return Math.floor(index / 2) % 2 === 0 ? 'bg-white' : 'bg-gray-50'
        },
        updateTimeTable() {
            // 初始化数据结构
            const maxRows = this.maxRows
            const newTimeTable = Array(maxRows).fill(null).map(() => Array(7).fill(undefined).map(() => [])) as courseOnTable[][][]
            const newMaxSpans = Array.from({ length: maxRows }, () => Array(7).fill(1))
            const newOccupied = Array.from({ length: maxRows }, () => Array(7).fill(false))
            const safeCourses = Array.isArray(this.timeTableData) ? this.timeTableData.filter((course: any) => {
                return Array.isArray(course?.occupyTime) && course.occupyTime.length > 0 && typeof course?.occupyDay === 'number' && course.occupyDay >= 1 && course.occupyDay <= 7 && course.occupyTime.every((slot: number) => slot >= 1 && slot <= maxRows)
            }) : []

            // 步骤1: 按课程长度排序（长课程优先处理）
            const sortedCourses = [...safeCourses].sort((a, b) => b.occupyTime.length - a.occupyTime.length)

            // 步骤2: 记录每个单元格覆盖的时间范围（用于判断重叠）
            // cellRanges[row][col] = { startTime, endTime, courses }
            const cellRanges: Array<Array<{ startTime: number, endTime: number, courses: courseOnTable[] } | null>> = 
                Array(maxRows).fill(null).map(() => Array(7).fill(null))

            // 步骤3: 填充课程数据 - 短课程合并到长课程的单元格中
            sortedCourses.forEach((course: courseOnTable) => {
                const startRow = course.occupyTime[0] - 1
                const dayIndex = course.occupyDay - 1

                // 检查是否有已存在的课程覆盖了当前课程的时间段
                let mergedIntoExisting = false
                
                for (let checkRow = 0; checkRow <= startRow; checkRow++) {
                    const existingRange = cellRanges[checkRow][dayIndex]
                    if (existingRange && 
                        existingRange.startTime <= course.occupyTime[0] && 
                        existingRange.endTime >= course.occupyTime[course.occupyTime.length - 1]) {
                        // 当前课程的时间段完全在已有课程的范围内，合并到该单元格
                        existingRange.courses.push(course)
                        newTimeTable[checkRow][dayIndex].push(course)
                        mergedIntoExisting = true
                        break
                    }
                }

                // 如果没有合并到已有单元格，创建新的单元格
                if (!mergedIntoExisting) {
                    newTimeTable[startRow][dayIndex].push(course)
                    cellRanges[startRow][dayIndex] = {
                        startTime: course.occupyTime[0],
                        endTime: course.occupyTime[course.occupyTime.length - 1],
                        courses: [course]
                    }
                }
            })

            // 步骤4: 计算最大跨度（基于实际的课程长度）
            for (let row = 0; row < maxRows; row++) {
                for (let col = 0; col < 7; col++) {
                    const courses = newTimeTable[row][col]
                    if (courses.length > 0) {
                        // 取所有课程中最长的跨度
                        newMaxSpans[row][col] = Math.max(...courses.map(c => c.occupyTime.length))
                    }
                }
            }

            // 步骤5: 标记被占用的单元格
            for (let row = 0; row < maxRows; row++) {
                for (let col = 0; col < 7; col++) {
                    const span = newMaxSpans[row][col]
                    if (span > 1) {
                        for (let i = 1; i < span; i++) {
                            if (row + i < maxRows) {
                                newOccupied[row + i][col] = true
                            }
                        }
                    }
                }
            }

            // 更新响应式数据
            this.timeTable = newTimeTable
            this.maxSpans = newMaxSpans
            this.occupied = newOccupied
        },
        handleCellClick(cell: { dayIndex: number, rowIndex: number }) {
            // 如果输入了个人信息，再允许点击
            if (!this.$store.getters.isMajorSelected) {
                // console.log("未选择专业");
                errorNotify("未选择专业");
                return;
            }

            // 如果当前单元格没被占用，再触发事件
            if ((this.$store.state.occupied?.[cell.rowIndex]?.[cell.dayIndex] || []).length > 0) {
                return
            }

            // 传入后，要 +1，同时传递 calendarId 以兼容 11/12 节课制 section 映射
            this.$emit('cellClick', {
                day: cell.dayIndex + 1,
                class: cell.rowIndex + 1,
                calendarId: this.$store.state.majorSelected?.calendarId || 0
            });
        }
    },
    created() {
        this.updateTimeTable()
    },
    mounted() {
        this._cleanupMobile = onMobileChange((v: boolean) => { this.isMobile = v })
        this.isMobile = getIsMobile()
    },
    beforeUnmount() {
        if (this._cleanupMobile) this._cleanupMobile()
    },
    computed: {
        timeTableData() {
            // console.log("tongbu", this.$store.state.timeTableData)
            return this.$store.state.timeTableData;
        }
        ,
        maxRows(): number {
            const calendarId = this.$store.state.majorSelected?.calendarId || 0
            return calendarId >= 120 ? 11 : 12
        },
        mobileDetailInfo() {
            const c = this.mobileDetailCourse
            const parsed = this.parseShowText(c?.showText || '')
            return {
                teacherAndCode: parsed.teacherAndCode || '未知教师',
                name: parsed.name || c?.courseName || '课程',
                code: parsed.code || c?.code || '',
                arrangement: parsed.arrangement || ''
            }
        },
        creditSummary() {
            const empty = {
                show: false,
                targetMajor: 0,
                targetMajorElective: 0,
                selectedMajor: 0,
                selectedMajorElective: 0,
                selectedOptional: 0,
            }

            if (!this.$store.getters.isMajorSelected) return empty

            const compulsory: any[] = this.$store.state.commonLists?.compulsoryCourses || []
            const optionalGroups: any[] = this.$store.state.commonLists?.optionalCourses || []
            const staged: any[] = this.$store.state.commonLists?.stagedCourses || []
            const selected: string[] = this.$store.state.commonLists?.selectedCourses || []

            const classifyMajor = (natures: any): 'major' | 'elective' | 'other' => {
                const list = Array.isArray(natures) ? natures.map((x) => String(x || '')) : [String(natures || '')]
                const text = list.join(' ')
                if (text.includes('专业选修') || text.includes('专选') || text.includes('专业方向') || text.includes('专业任选')) return 'elective'
                if (text.includes('专业')) return 'major'
                return 'other'
            }

            const compulsoryCat = new Map<string, 'major' | 'elective' | 'other'>()
            let targetMajor = 0
            let targetMajorElective = 0
            for (const c of compulsory) {
                const cc = String(c?.courseCode || '')
                if (!cc) continue
                const credit = Number(c?.credit || 0)
                const cat = classifyMajor(c?.courseNature)
                compulsoryCat.set(cc, cat)
                if (cat === 'elective') targetMajorElective += credit
                else if (cat === 'major') targetMajor += credit
            }

            const optionalCodes = new Set<string>()
            for (const g of optionalGroups) {
                for (const c of (g?.courses || [])) {
                    const cc = String(c?.courseCode || '')
                    if (cc) optionalCodes.add(cc)
                }
            }

            const selectedBases = new Set<string>()
            for (const code of selected) {
                const s = String(code || '')
                if (!s) continue
                selectedBases.add(s.length > 2 ? s.slice(0, -2) : s)
            }

            let selectedMajor = 0
            let selectedMajorElective = 0
            let selectedOptional = 0
            for (const c of staged) {
                const cc = String(c?.courseCode || '')
                if (!cc || !selectedBases.has(cc)) continue
                const credit = Number(c?.credit || 0)

                if (optionalCodes.has(cc)) {
                    selectedOptional += credit
                    continue
                }

                const cat = compulsoryCat.get(cc) || 'other'
                if (cat === 'elective') selectedMajorElective += credit
                else if (cat === 'major') selectedMajor += credit
            }

            return {
                show: true,
                targetMajor,
                targetMajorElective,
                selectedMajor,
                selectedMajorElective,
                selectedOptional,
            }
        }
    },
    watch: {
        timeTableData: {
            handler: 'updateTimeTable',
            immediate: true,
            deep: true // 不写这个的话，局部更新不会触发
        }
    },
    emits: ['cellClick'],
}
</script>

<style scoped>
.tt-mobile-course {
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
}

.tt-mobile-title {
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.08;
  max-width: 100%;
  overflow: hidden;
  text-align: center;
  text-shadow: 0 1px 2px rgb(15 23 42 / 0.24);
  text-overflow: ellipsis;
  word-break: break-all;
  writing-mode: horizontal-tb;
}

.tt-mobile-meta {
  font-size: 8px;
  line-height: 1;
  margin-top: 2px;
  max-width: 100%;
  opacity: 0.84;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgb(15 23 42 / 0.18);
  white-space: nowrap;
}

.tt-detail-enter-active,
.tt-detail-leave-active {
  transition: opacity 180ms ease;
}
.tt-detail-enter-from,
.tt-detail-leave-to {
  opacity: 0;
}
</style>
