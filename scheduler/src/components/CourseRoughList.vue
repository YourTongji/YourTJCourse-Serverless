<template>
    <a-layout-content class="w-full md:w-[40%]">
        <div>
            <a-card
                title="选课列表"
            >
                <template #extra>
                    <div class="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
                        <a-button @click="getCompulsoryCourses">
                            <p>选择课程</p>
                        </a-button>
                        <a-button type="primary" @click="handleSave">
                            <p>保存课表</p>
                        </a-button>
                    </div>
                </template>
                <a-table
                    v-if="!isMobile"
                    :columns="columns"
                    :data-source="$store.state.commonLists.stagedCourses"
                    :pagination="false"
                    :row-class-name="getRowClass"
                    class="max-h-[420px] md:h-80 overflow-auto"
                    bordered
                    :custom-row="onRowEvent"
                    :rowHoverable="false"
                >
                    <template #bodyCell="{ column, record }">
                        <template v-if="column.key === 'status'">
                            <span :class="getStatusTextColor(record.status)">
                                {{ mapStatusToChinese(record.status) }}
                            </span>
                        </template>
                        <template v-else-if="column.key === 'action'">
                            <!-- .stop 是为了事件不冒泡 -->
                            <a-button type="link" @click.stop="handleRemoveCourse(record)">
                                <div class=" text-red-500">
                                    <span v-if="record.status === 2" >退课</span>
                                    <span v-else>清除</span>
                                </div>
                            </a-button>
                        </template>
                    </template>
                </a-table>

                <!-- Mobile: dense card list (no horizontal scroll) -->
                <div v-else class="space-y-3">
                    <div
                        v-for="c in $store.state.commonLists.stagedCourses"
                        :key="c.courseCode"
                        class="rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm active:scale-[0.99] transition-transform"
                        :class="c.courseCode === $store.state.clickedCourseInfo.courseCode ? 'ring-2 ring-cyan-400/40' : ''"
                        @click="selectCourse(c)"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="text-sm font-bold text-slate-800 line-clamp-1">{{ c.courseName }}</div>
                                <div class="mt-1 text-[11px] text-slate-500">
                                    <span class="font-mono">{{ c.courseCode }}</span>
                                    <span v-if="c.credit !== undefined" class="ml-2">{{ c.credit }} 学分</span>
                                    <span v-if="c.courseType" class="ml-2">{{ c.courseType }}</span>
                                </div>
                                <div class="mt-1 text-[11px] text-slate-500 line-clamp-1">
                                    教师：{{ (c.teacher || []).map((t: any) => t.teacherName).join('、') || '未选择' }}
                                </div>
                            </div>
                            <div class="shrink-0 flex flex-col items-end gap-2">
                                <div class="text-[11px]" :class="getStatusTextColor(c.status)">
                                    {{ mapStatusToChinese(c.status) }}
                                </div>
                                <button
                                    type="button"
                                    class="px-2 py-1 rounded-xl border border-slate-200 bg-white text-[11px] text-red-600 active:scale-95"
                                    @click.stop="handleRemoveCourse(c)"
                                >
                                    <span v-if="c.status === 2">退课</span>
                                    <span v-else>清除</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </a-card>
        </div>    
    </a-layout-content>
</template>

<script lang="ts">
import axios from 'axios';
import { Modal, Table } from 'ant-design-vue';
import { mapStatusToChinese, getStatusTextColor } from '@/utils/statusManipulate';
import { errorNotify } from '@/utils/notify';
import type { teacherlet, courseInfo } from '@/utils/myInterface';
import { isMobile as getIsMobile, onMobileChange } from '@/utils/responsive';

export default {
    components: { ATable: Table },
    data() {
        return {
            isMobile: getIsMobile(),
            _cleanupMobile: null as (() => void) | null,
            columns: ([
            {
                title: '课程名称',
                dataIndex: 'courseName',
                key: 'courseName',
                align: 'center'
            },
            {
                title: '学分',
                dataIndex: 'credit',
                key: 'credit',
                align: 'center'
            },
            {
                title: '必/选',
                dataIndex: 'courseType',
                key: 'courseType',
                align: 'center'
            },
            {
                title: '教师',
                dataIndex: 'teacher',
                key: 'teacher',
                align: 'center',
                customRender: ({ text }: { text: teacherlet[] }) => text?.map(teacher => teacher.teacherName).join(', ')
            },
            {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                align: 'center',
            },
            {
                title: '操作',
                key: 'action',
                align: 'center'
            }
        ] as any[]),
        }
    },
    methods: {
        buildClickedCourseInfo(record: any) {
            const teacher0 = Array.isArray(record?.teacher) ? record.teacher[0] : undefined
            return {
                courseCode: record.courseCode,
                courseName: (record as any).courseNameReserved || record.courseName,
                teacherCode: teacher0?.teacherCode ? String(teacher0.teacherCode) : '',
                teacherName: teacher0?.teacherName ? String(teacher0.teacherName) : ''
            }
        },
        selectCourse(record: any) {
            this.$store.commit('setClickedCourseInfo', this.buildClickedCourseInfo(record));
        },
        async getCompulsoryCourses() {
            // 如果没选择专业
            if (!this.$store.getters.isMajorSelected) {
                // console.log("未选择专业");
                errorNotify("未选择专业");
                return;
            }
            // 如果专业没变，不重新获取
            if (this.$store.state.flags.majorNotChanged) {
                // console.log("专业未变");
                this.$emit('openOverview');
                return;
            }

            this.$store.commit('setSpin', true);

            try {
                // 并行获取必修课程和选修课程
                await Promise.all([
                    this.fetchCompulsoryCourses(),
                    this.fetchOptionalCourses()
                ]);
                
                // 所有课程加载完成后，才打开弹窗
                this.$emit('openOverview');
            }
            catch (error: unknown) {
                // console.log("error:", error);
                const err = error as { response?: { data?: { msg?: string } } };
                errorNotify(err.response?.data?.msg || '获取课程失败');
            }
            finally {
                this.$store.commit('setSpin', false);
            }
        },
        async fetchCompulsoryCourses() {
            // 获取必修课程
            const res = await axios({
                url: '/api/findCourseByMajor',
                method: 'post',
                data: {
                    grade: this.$store.state.majorSelected.grade,
                    code: this.$store.state.majorSelected.major,
                    calendarId: this.$store.state.majorSelected.calendarId
                }
            });
            this.$store.commit('setCompulsoryCourses', res.data.data);
        },
        async fetchOptionalCourses() {
            // 获取选修课程类型
            const typesRes = await axios({
                url: '/api/findOptionalCourseType',
                method: 'post',
                data: {
                    calendarId: this.$store.state.majorSelected.calendarId
                }
            });
            this.$store.commit('setOptionalTypes', typesRes.data.data);

            // 获取选修课程具体信息
            const coursesRes = await axios({
                url: '/api/findCourseByNatureId',
                method: 'post',
                data: {
                    calendarId: this.$store.state.majorSelected.calendarId,
                    ids: typesRes.data.data.map((type: any) => type.courseLabelId)
                }
            });
            this.$store.commit('setOptionalCourses', coursesRes.data.data);
        },
        getRowClass(record: { courseCode: string }, index: number) {
            // console.log(index);
            let className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

            if (record.courseCode === this.$store.state.clickedCourseInfo.courseCode) {
                className = 'bg-blue-400/60';
            }

            return className;
        },
        onRowEvent(record: any) {
            return {
                onClick: () => {
                    this.$store.commit('setClickedCourseInfo', this.buildClickedCourseInfo(record));
                },
            }
        },
        mapStatusToChinese,
        getStatusTextColor,
        handleSave() {
            this.$store.commit('saveSelectedCourses');
            this.$store.commit('solidify');
        },
        handleRemoveCourse(record: any) {
            // 只有退课(status === 2)时才需要二次确认
            if (record.status === 2) {
                Modal.confirm({
                    title: '确认退课',
                    content: `确定要退掉 ${record.courseName} 课程吗？`,
                    okText: '确认',
                    cancelText: '取消',
                    style: { top: '30%' },
                    onOk: () => {
                        this.$store.commit('popStagedCourse', record.courseCode);
                        // 退课后自动保存课表
                        this.$store.commit('saveSelectedCourses');
                        this.$store.commit('solidify');
                    }
                });
            } else {
                // 清除操作直接执行，无需确认
                this.$store.commit('popStagedCourse', record.courseCode);
                this.$store.commit('solidify');
            }
        }
    },
    emits: ['openOverview'],
    mounted() {
        this._cleanupMobile = onMobileChange((v: boolean) => { this.isMobile = v })
        this.isMobile = getIsMobile()
    },
    beforeUnmount() {
        if (this._cleanupMobile) this._cleanupMobile()
    }
}
</script>

<style scoped>
:deep(.ant-table-tbody > tr.ant-table-row:hover > td),
:deep(.ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: transparent !important;
}
</style>
