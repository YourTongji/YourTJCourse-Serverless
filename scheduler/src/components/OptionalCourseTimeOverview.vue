<template>
    <div class="overflow-auto h-150">
        <template v-if="isMobile">
            <div class="space-y-3 pb-4">
                <button
                    v-for="course in filteredCourses(optionalCourseData)"
                    :key="'mobile_opt_' + course.courseCode"
                    type="button"
                    class="w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.99]"
                    :class="isCourseSelected(course) ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200'"
                    @click="toggleCourse(course)"
                >
                    <div class="flex items-start gap-3">
                        <input
                            type="checkbox"
                            class="mt-1 h-4 w-4 shrink-0 accent-cyan-600"
                            :checked="isCourseSelected(course)"
                            @click.stop
                            @change="toggleCourse(course)"
                        />
                        <div class="min-w-0 flex-1">
                            <div class="text-sm font-semibold leading-snug text-slate-900">
                                {{ course.courseName }}
                            </div>
                            <div class="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-mono">{{ course.courseCode }}</span>
                                <span class="rounded-full bg-cyan-50 px-2 py-0.5 text-cyan-800">{{ course.credit }} 学分</span>
                                <span v-if="course.faculty" class="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">{{ course.faculty }}</span>
                            </div>
                            <div class="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
                                <div v-if="formatList((course as any).courseNature)">性质：{{ formatList((course as any).courseNature) }}</div>
                                <div v-if="formatList((course as any).campus)">校区：{{ formatList((course as any).campus) }}</div>
                            </div>
                        </div>
                    </div>
                </button>
            </div>
        </template>
        <a-table
            v-else
            class="min-w-[1040px]"
            :columns="columns"
            :data-source="filteredCourses(optionalCourseData)"
            :pagination="false"
            :row-selection="{ 
                selectedRowKeys: localSelectedRowKeys,
                onChange: (keys: any[]) => onOptionalSelectChange(keys) 
            }"
            :row-key="(record: any) => 'opt_' + (Array.isArray(record.courseNature) ? record.courseNature.filter(Boolean).join('-') : String(record.courseNature || '')) + '_' + record.courseCode"
            :row-class-name="(_record: any, index: number) => index % 2 === 1 ? 'bg-gray-50' : ''"
        >
        </a-table>
    </div>
</template>

<script lang="ts">
    import { Table } from 'ant-design-vue';
    import type { stagedCourse, courseInfo } from '@/utils/myInterface';
    import { isMobile as getIsMobile, onMobileChange } from '@/utils/responsive';

function formatCourseList(value: unknown): string {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === '[]' || trimmed === '[""]') return '';
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                return formatCourseList(JSON.parse(trimmed));
            } catch {
                return trimmed;
            }
        }
        return trimmed;
    }
    if (Array.isArray(value)) {
        return value
            .flatMap((item) => formatCourseList(item).split('、'))
            .map((item) => item.trim())
            .filter(Boolean)
            .join('、');
    }
    return '';
}

export default {
    components: { ATable: Table },
    data() {
        return {
            isMobile: getIsMobile(),
            _cleanupMobile: null as (() => void) | null,
            columns: ([
                {
                    title: '课程代码',
                    dataIndex: 'courseCode',
                    align: 'center',
                    width: 120
                },
                {
                    title: '课程名称',
                    dataIndex: 'courseName',
                    align: 'center',
                    width: 280
                },
                {
                    title: '开课学院',
                    dataIndex: 'faculty',
                    align: 'center',
                    width: 220
                },
                {
                    title: '学分',
                    dataIndex: 'credit',
                    align: 'center',
                    width: 80
                },
                {
                    title: '课程性质',
                    dataIndex: 'courseNature',
                    key: 'courseNature',
                    align: 'center',
                    width: 170,
                    customRender: ({ text }: { text: string[] | string }) => formatCourseList(text)
                },
                {
                    title: '校区',
                    dataIndex: 'campus',
                    align: 'center',
                    width: 170,
                    customRender: ({ text }: { text: string[] | string }) => formatCourseList(text)
                }
            ] as any[])
        }
    },
    methods: {
        filteredCourses(courses: courseInfo[]) {
            const safeCourses = Array.isArray(courses) ? courses : [];
            return safeCourses.filter((course: courseInfo) => {
                return !this.$store.state.commonLists.stagedCourses.some((stagedCourse: stagedCourse) => stagedCourse.courseCode === course.courseCode);
            });
        },
        onOptionalSelectChange(keys: any[]) {
            this.localSelectedRowKeys = (keys || []).map((k: any) => String(k));
        },
        formatList(value: unknown) {
            return formatCourseList(value);
        },
        courseKey(course: any) {
            return 'opt_' + (Array.isArray(course.courseNature) ? course.courseNature.filter(Boolean).join('-') : String(course.courseNature || '')) + '_' + course.courseCode;
        },
        isCourseSelected(course: any) {
            const key = this.courseKey(course);
            return (this.localSelectedRowKeys || []).map((item: any) => String(item)).includes(key);
        },
        toggleCourse(course: any) {
            const key = this.courseKey(course);
            if (this.isCourseSelected(course)) {
                this.localSelectedRowKeys = (this.localSelectedRowKeys || []).filter((item: string) => String(item) !== key);
                return;
            }
            this.localSelectedRowKeys = [...(this.localSelectedRowKeys || []), key];
        }
    },
    mounted() {
        this._cleanupMobile = onMobileChange((v: boolean) => { this.isMobile = v });
        this.isMobile = getIsMobile();
    },
    beforeUnmount() {
        if (this._cleanupMobile) this._cleanupMobile();
    },
    computed: {
        localSelectedRowKeys: {
            get() {
                // console.log('localSelectedRowKeys', this.selectedRowKeys);
                return this.selectedRowKeys;
            },
            set(value: string[]) {
                this.$emit('update:selectedRowKeys', value);
            }
        }
    },
    props: ['selectedRowKeys', 'optionalCourseData'],
}
</script>
