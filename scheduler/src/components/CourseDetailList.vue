<template>
    <a-layout-content class="w-full md:w-[60%]">
        <a-card
            :title="title"
        >
            <template #extra>
                <a-button size="small" @click="openReviewDrawer">查看课程评价</a-button>
            </template>
            <a-table
                v-if="!isMobile"
                :columns="columns"
                :data-source="localDetailList"
                :pagination="false"
                :row-class-name="getRowClass"
                class="max-h-[420px] md:h-80 overflow-auto"
                :custom-row="onRowEvent"
                bordered
            >
                <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'campus'">
                        <div :class="getCampusClass(record.campus)" class="absolute inset-0 flex items-center justify-center">
                            <p>{{ record.campus }}</p>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'status'">
                        <span :class="getStatusTextColor(record.status)">
                            {{ mapStatusToChinese(record.status) }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'code'">
                        <div class="flex flex-row items-center justify-center">
                            <a-tag color="green" v-if="record.isExclusive">专业课表</a-tag>
                            <p>{{ record.code }}</p>
                        </div>
                    </template>
                </template>
            </a-table>

            <!-- Mobile: dense card list (no horizontal scroll) -->
            <div v-else class="space-y-3">
                <div
                    v-for="d in localDetailList"
                    :key="d.code"
                    class="rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm active:scale-[0.99] transition-transform"
                    @click="selectDetail(d)"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 min-w-0">
                                <a-tag color="green" v-if="d.isExclusive">专业课表</a-tag>
                                <div class="text-sm font-bold text-slate-800 truncate">{{ d.code }}</div>
                            </div>
                            <div class="mt-1 text-[11px] text-slate-500">
                                <span>教师：{{ (d.teachers || []).map((t: any) => t.teacherName).join('、') || '未知' }}</span>
                                <span class="ml-2">语言：{{ d.teachingLanguage || '-' }}</span>
                            </div>
                        </div>
                        <div class="shrink-0 text-[11px]" :class="getStatusTextColor(d.status)">
                            {{ mapStatusToChinese(d.status) }}
                        </div>
                    </div>

                    <div class="mt-2">
                        <div class="inline-flex items-center gap-2 text-[11px] text-slate-600">
                            <span class="px-2 py-1 rounded-lg" :class="getCampusClass(d.campus)">{{ d.campus || '-' }}</span>
                        </div>
                    </div>

                    <div class="mt-2 text-[11px] leading-snug text-slate-700 whitespace-pre-wrap break-words">
                        {{ (d.arrangementInfo || []).map((a: any) => a.arrangementText).join('\\n') }}
                    </div>
                </div>
            </div>
        </a-card>

        <CourseReviewDrawer
            :open="reviewDrawerOpen"
            :courseCode="$store.state.clickedCourseInfo.courseCode"
            :courseName="$store.state.clickedCourseInfo.courseName"
            :teacherName="reviewTeacherName"
            :teacherCode="reviewTeacherCode"
            @close="reviewDrawerOpen = false"
        />
    </a-layout-content>
</template>

<script lang="ts">
import { Table, Tag } from 'ant-design-vue';
import { mapStatusToChinese } from '@/utils/statusManipulate';
import type { teacherlet, arrangementInfolet, courseDetaillet, stagedCourse } from '@/utils/myInterface';
import CourseReviewDrawer from './CourseReviewDrawer.vue';

    export default {
        components: { CourseReviewDrawer, ATable: Table, ATag: Tag },
        data() {
            return {
                reviewDrawerOpen: false,
                reviewTeacherName: '',
                reviewTeacherCode: '',
                isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
                columns: ([
                    {
                        title: '课程序号',
                        dataIndex: 'code',
                        key: 'code',
                        align: 'center',
                        sorter: (a: { code: string }, b: { code: string }) => String(a.code).localeCompare(String(b.code))
                    },
                    {
                        title: '教师',
                        dataIndex: 'teachers',
                        key: 'teachers',
                        align: 'center',
                        customRender: ({ text }: { text: teacherlet[] }) => text?.map(teacher => teacher.teacherName).join(', ')
                    },
                    {
                        title: '校区',
                        dataIndex: 'campus',
                        key: 'campus',
                        align: 'center',
                        customCell: () => ({
                            style: {
                                padding: '0',
                                position: 'relative'  // 使绝对定位的子元素能正确填充
                            }
                        })
                    },
                    {
                        title: '课程安排',
                        dataIndex: 'arrangementInfo',
                        key: 'arrangementInfo',
                        align: 'center',
                        customRender: ({ text }: { text: arrangementInfolet[] }) => text?.map(arrangement => arrangement.arrangementText).join(', ')
                    },
                    {
                        title: '状态',
                        dataIndex: 'status',
                        key: 'status',
                        align: 'center',
                    },
                    {
                        title: '语言',
                        dataIndex: 'teachingLanguage',
                        key: 'language',
                        align: 'center'
                    }
                ] as any[]),
            }
        },
        computed: {
            localDetailList() {
                const details = this.$store.state.commonLists.stagedCourses.find((course: stagedCourse) => course.courseCode === this.$store.state.clickedCourseInfo.courseCode)?.courseDetail || [];
                return [...details].sort((left: any, right: any) => {
                    const leftExclusive = left?.isExclusive ? 1 : 0;
                    const rightExclusive = right?.isExclusive ? 1 : 0;
                    if (leftExclusive !== rightExclusive) return rightExclusive - leftExclusive;
                    return String(left?.code || '').localeCompare(String(right?.code || ''));
                });
            },
            title() {
                const courseInfo = this.$store.state.clickedCourseInfo;
                // console.log("courseInfo", courseInfo);
                return `${courseInfo.courseName} ${courseInfo.courseCode}`;
            }
        },
        methods: {
            syncReviewTeacherFromClickedInfo() {
                const clickedInfo = this.$store.state.clickedCourseInfo || {}
                this.reviewTeacherName = clickedInfo.teacherName ? String(clickedInfo.teacherName) : ''
                this.reviewTeacherCode = clickedInfo.teacherCode ? String(clickedInfo.teacherCode) : ''
            },
            findPreferredDetailForReview() {
                const clickedInfo = this.$store.state.clickedCourseInfo || {}
                const preferredTeacherCode = String(clickedInfo.teacherCode || '').trim()
                const preferredTeacherName = String(clickedInfo.teacherName || '').trim()
                const detailList = this.localDetailList || []

                if (preferredTeacherCode) {
                    const matchedByCode = detailList.find((detail: any) =>
                        Array.isArray(detail?.teachers) && detail.teachers.some((teacher: any) => String(teacher?.teacherCode || '').trim() === preferredTeacherCode)
                    )
                    if (matchedByCode) return matchedByCode
                }

                if (preferredTeacherName) {
                    const matchedByName = detailList.find((detail: any) =>
                        Array.isArray(detail?.teachers) && detail.teachers.some((teacher: any) => String(teacher?.teacherName || '').trim() === preferredTeacherName)
                    )
                    if (matchedByName) return matchedByName
                }

                const selectedDetail = detailList.find((detail: any) => Number(detail?.status || 0) > 0)
                if (selectedDetail) return selectedDetail

                return detailList[0]
            },
            syncTeacherSelection(courseDetaillet: courseDetaillet) {
                const teacher0 = (courseDetaillet as any)?.teachers?.[0]
                this.reviewTeacherName = teacher0?.teacherName ? String(teacher0.teacherName) : ''
                this.reviewTeacherCode = teacher0?.teacherCode ? String(teacher0.teacherCode) : ''
                this.$store.commit('setClickedCourseInfo', {
                    ...this.$store.state.clickedCourseInfo,
                    teacherName: this.reviewTeacherName,
                    teacherCode: this.reviewTeacherCode
                })
            },
            openReviewDrawer() {
                const preferredDetail = this.findPreferredDetailForReview() as any
                if (preferredDetail) this.syncTeacherSelection(preferredDetail)
                this.reviewDrawerOpen = true;
            },
            selectDetail(courseDetaillet: courseDetaillet) {
                this.syncTeacherSelection(courseDetaillet)
                this.$store.commit('updateTimeTable', courseDetaillet);
            },
            getCampusClass(campus: string) {
                switch (campus) {
                    case '四平路校区':
                        return 'bg-yellow-100/80';
                    case '嘉定校区':
                        return 'bg-red-100/80';
                    case '沪西校区':
                        return 'bg-white';
                    default:
                        return 'bg-white';
                }
            },
            onRowEvent(courseDetaillet: courseDetaillet) {
                return {
                    onClick: () => {
                        this.syncTeacherSelection(courseDetaillet)
                        this.$store.commit('updateTimeTable', courseDetaillet);
                    }
                }
            },
            mapStatusToChinese,
            getStatusTextColor(status: number) {
                // console.log("132", status);
                switch (status) {
                    case 0:
                        return '';
                    case 1:
                        return 'text-yellow-300';
                    case 2:
                        return 'text-red-500';
                    default:
                        return '';
                }
            },
            getRowClass(record: {status: number}, index: number) {
                let className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                
                switch (record.status) {
                    case 0: // 未选
                        break;
                    case 1: // 备选
                        className =  'bg-blue-500/60';
                        break;
                    case 2:
                        className += ' ' + 'text-red-500';
                        break;
                    default:
                        break;
                }

                // console.log("className", className);

                return className;
            }
        },
        mounted() {
            const onResize = () => {
                this.isMobile = window.innerWidth < 768
            }
            window.addEventListener('resize', onResize, { passive: true })
            onResize()
            ;(this as any)._onResize = onResize
        },
        beforeUnmount() {
            const fn = (this as any)._onResize
            if (fn) window.removeEventListener('resize', fn)
        },
        watch: {
            '$store.state.clickedCourseInfo.courseCode': {
                handler() {
                    this.syncReviewTeacherFromClickedInfo()
                },
                immediate: true
            },
            '$store.state.clickedCourseInfo.teacherCode': {
                handler() {
                    this.syncReviewTeacherFromClickedInfo()
                },
                immediate: true
            },
            '$store.state.clickedCourseInfo.teacherName': {
                handler() {
                    this.syncReviewTeacherFromClickedInfo()
                },
                immediate: true
            }
        }
    }
</script>

<style scoped>
:deep(.ant-table-tbody > tr.ant-table-row:hover > td),
:deep(.ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: transparent !important;
}
</style>
