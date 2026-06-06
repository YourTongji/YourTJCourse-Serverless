<template>
    <div
        class="flex flex-col w-full"
    >
        <div class="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 mt-4 mb-4">
            <div>
                <a-radio-group v-model:value="selectedType" @change="$emit('update:selectedRowKeys', [])" class="w-full">
                <a-radio-button value="compulsory">计划内课程</a-radio-button>
                <a-radio-button value="optional">通识选修课</a-radio-button>
                <a-radio-button value="search">高级检索</a-radio-button>
            </a-radio-group>
            </div>
            <div>
                <a-input
                    placeholder="请输入课程代码或课程名称"
                    v-model:value="searchValue"
                    class="w-full md:w-[250px]"
                    allow-clear
                >
                    <template #prefix>
                        <SearchOutlined />
                    </template>
                </a-input>
            </div>
        </div>
        <div v-if="selectedType === 'compulsory'">
            <div class="h-[60vh] md:h-150 overflow-auto">
                <template v-if="isMobile">
                    <div
                        v-for="courses in $store.getters.sortCompulsoryCoursesByGrade"
                        :key="courses.grade"
                        class="space-y-3 pb-4"
                    >
                        <div class="sticky top-0 z-10 bg-white/95 px-1 py-2 text-sm font-bold text-slate-700">
                            {{ courses.grade }}级
                        </div>
                        <button
                            v-for="course in filteredCourses(courses.courses)"
                            :key="'mobile_必_' + courses.grade + '_' + course.courseCode"
                            type="button"
                            class="w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.99]"
                            :class="isCompulsorySelected(courses.grade, course) ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200'"
                            @click="toggleCompulsoryCourse(courses.grade, course)"
                        >
                            <div class="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    class="mt-1 h-4 w-4 shrink-0 accent-cyan-600"
                                    :checked="isCompulsorySelected(courses.grade, course)"
                                    @click.stop
                                    @change="toggleCompulsoryCourse(courses.grade, course)"
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
                                    <div v-if="formatList((course as any).courseNature)" class="mt-2 text-xs leading-relaxed text-slate-500">
                                        {{ formatList((course as any).courseNature) }}
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </template>
                <a-table
                v-else
                class="min-w-[900px]"
                :columns="columns.compulsory"
                v-for="courses in $store.getters.sortCompulsoryCoursesByGrade"
                :key="courses.grade"
                :data-source="filteredCourses(courses.courses)"
                :pagination="false"
                :scroll="courseTableScroll"
                :title="() => courses.grade + '级'"
                :row-selection="{ 
                    selectedRowKeys: localSelectedRowKeys.filter((key: string) => key.startsWith('必_' + courses.grade + '_')), 
                    onChange: (keys: any[]) => onCompulsorySelectChange(courses.grade, keys)
                }"
                :row-key="(record: any) => '必_' + courses.grade + '_' + record.courseCode"
                :row-class-name="(_record: any, index: number) => index % 2 === 1 ? 'bg-gray-50' : ''"
            >
            </a-table>
            </div>
        </div>
        <div v-else-if="selectedType === 'optional'">
            <a-tabs v-model:activeKey="selectedOptionalType">
                <a-tab-pane v-for="type in mergedOptionalTypes" :key="type.courseLabelName" :tab="type.courseLabelName">
                    <div class="h-[60vh] md:h-150 overflow-auto">
                        <template v-if="isMobile">
                            <div class="space-y-3 pb-4">
                                <button
                                    v-for="course in filteredCourses(type.courses)"
                                    :key="'mobile_选_' + type.courseLabelName + '_' + course.courseCode"
                                    type="button"
                                    class="w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.99]"
                                    :class="isOptionalSelected(type.courseLabelName, course) ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200'"
                                    @click="toggleOptionalCourse(type.courseLabelName, course)"
                                >
                                    <div class="flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            class="mt-1 h-4 w-4 shrink-0 accent-cyan-600"
                                            :checked="isOptionalSelected(type.courseLabelName, course)"
                                            @click.stop
                                            @change="toggleOptionalCourse(type.courseLabelName, course)"
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
                                            <div v-if="formatList((course as any).campus)" class="mt-2 text-xs leading-relaxed text-slate-500">
                                                校区：{{ formatList((course as any).campus) }}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </template>
                        <a-table
                        v-else
                        class="min-w-[900px]"
                        :columns="columns.optional"
                        :data-source="filteredCourses(type.courses)"
                        :pagination="false"
                        :scroll="courseTableScroll"
                        :row-selection="{ 
                            selectedRowKeys: localSelectedRowKeys.filter((key: string) => key.startsWith('选_' + type.courseLabelName + '_')), 
                            onChange: (keys: any[]) => onOptionalSelectChange(type.courseLabelName, keys) 
                        }"
                        :row-key="(record: any) => '选_' + type.courseLabelName + '_' + record.courseCode"
                        :row-class-name="(_record: any, index: number) => index % 2 === 1 ? 'bg-gray-50' : ''"
                    >
                    </a-table>
                    </div>
                </a-tab-pane>
            </a-tabs>
        </div>
        <div v-else-if="selectedType === 'search'">
            <div>
                <AdvancedSearch :searchValue="searchValue"  v-model:selectedRowKeys="localSelectedRowKeys" />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue';
import { Input, Radio, Table } from 'ant-design-vue';
import type { stagedCourse, courseInfo } from '@/utils/myInterface';
import { defineAsyncComponent } from 'vue';
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
    data() {
        return {
            // 最外层选项卡
            selectedType: 'compulsory', // 必修 | 选修
            selectedOptionalType: '', // 选修课类型
            
            // 表格
            columns: {
                compulsory: ([
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
                        width: 300
                    },
                    {
                        title: '开课学院',
                        dataIndex: 'faculty',
                        align: 'center',
                        width: 220,
                        responsive: ['md']
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
                        align: 'center',
                        width: 180,
                        customRender: ({ text }: { text: string[] | string }) => formatCourseList(text),
                        responsive: ['md']
                    }
                ] as any[]),
                optional: ([
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
                        width: 300
                    },
                    {
                        title: '开课学院',
                        dataIndex: 'faculty',
                        align: 'center',
                        width: 220,
                        responsive: ['md']
                    },
                    {
                        title: '学分',
                        dataIndex: 'credit',
                        align: 'center',
                        width: 80
                    },
                    {
                        title: '校区',
                        dataIndex: 'campus',
                        align: 'center',
                        width: 180,
                        customRender: ({ text }: { text: string[] | string }) => formatCourseList(text),
                        responsive: ['md']
                    }
                ] as any[])
            },

            // 搜索
            searchValue: '',
            isMobile: getIsMobile(),
            _cleanupMobile: null as (() => void) | null,
            courseTableScroll: { x: 900 }
        }
    },
    props: ['selectedRowKeys'],
    methods: {
        replaceKeysByPrefix(prefix: string, localSelectedRowKeys: any[]) {
            const nextKeys = (localSelectedRowKeys || []).map((key: any) => String(key));
            const remainedKeys = (this.localSelectedRowKeys || []).filter((key: string) => !key.startsWith(prefix));
            this.localSelectedRowKeys = [...remainedKeys, ...nextKeys];
        },
        onCompulsorySelectChange(grade: string | number, localSelectedRowKeys: any[]) {
            this.replaceKeysByPrefix(`必_${grade}_`, localSelectedRowKeys);
        },
        onOptionalSelectChange(labelName: string, localSelectedRowKeys: any[]) {
            this.replaceKeysByPrefix(`选_${labelName}_`, localSelectedRowKeys);
        },
        formatList(value: unknown) {
            return formatCourseList(value);
        },
        isKeySelected(key: string) {
            return (this.localSelectedRowKeys || []).map((item: any) => String(item)).includes(key);
        },
        toggleSelectionKey(key: string) {
            if (this.isKeySelected(key)) {
                this.localSelectedRowKeys = (this.localSelectedRowKeys || []).filter((item: string) => String(item) !== key);
                return;
            }
            this.localSelectedRowKeys = [...(this.localSelectedRowKeys || []), key];
        },
        compulsoryKey(grade: string | number, course: any) {
            return `必_${grade}_${course.courseCode}`;
        },
        optionalKey(labelName: string, course: any) {
            return `选_${labelName}_${course.courseCode}`;
        },
        isCompulsorySelected(grade: string | number, course: any) {
            return this.isKeySelected(this.compulsoryKey(grade, course));
        },
        isOptionalSelected(labelName: string, course: any) {
            return this.isKeySelected(this.optionalKey(labelName, course));
        },
        toggleCompulsoryCourse(grade: string | number, course: any) {
            this.toggleSelectionKey(this.compulsoryKey(grade, course));
        },
        toggleOptionalCourse(labelName: string, course: any) {
            this.toggleSelectionKey(this.optionalKey(labelName, course));
        },
        filteredCourses(courses: courseInfo[]) {
            const safeCourses = Array.isArray(courses) ? courses : [];
            // 根据已选课程来过滤，德摩根律啊！思考一下为什么是 && 而不是 ||
            const visibleCourses = safeCourses.filter((course: courseInfo) => {
                return !this.$store.state.commonLists.stagedCourses.some((stagedCourse: stagedCourse) => stagedCourse.courseCode === course.courseCode);
                // && !this.$store.state.commonLists.selectedCourses.some(selectedCourse => selectedCourse.courseCode === course.courseCode) // 这句不需要，因为被上面的包含了
            });

            // 保留表格中和 this.searchValue 代码或者名称匹配的课程
            if (this.searchValue === '') {
                return visibleCourses;
            }
            else {
                // 根据检索条件过滤课程
                return visibleCourses.filter(course => course.courseCode.includes(this.searchValue) || course.courseName.includes(this.searchValue));
            }
        }
    },
    mounted() {
        this._cleanupMobile = onMobileChange((v: boolean) => { this.isMobile = v });
        this.isMobile = getIsMobile();
    },
    beforeUnmount() {
        if (this._cleanupMobile) this._cleanupMobile();
    },
    components: {
        SearchOutlined,
        AdvancedSearch: defineAsyncComponent(() => import('@/components/AdvancedSearch.vue')),
        AInput: Input,
        ATable: Table,
        ARadioGroup: (Radio as any).Group,
        ARadioButton: (Radio as any).Button
    },
    watch: {
        mergedOptionalTypes: {
            handler(newTypes: any[]) {
                if (!newTypes || newTypes.length === 0) {
                    this.selectedOptionalType = ''
                    return
                }
                if (!newTypes.some((item: any) => item.courseLabelName === this.selectedOptionalType)) {
                    this.selectedOptionalType = newTypes[0].courseLabelName
                }
            },
            immediate: true
        }
    },
    computed: {
        mergedOptionalTypes() {
            const rawOptionalCourses = this.$store.state.commonLists.optionalCourses || []
            const rawOptionalTypes = this.$store.state.commonLists.optionalTypes || []
            const mergedMap: Record<string, Map<string, any>> = {}
            const orderedLabels: string[] = []

            for (const typeItem of rawOptionalTypes) {
                const labelName = String(typeItem?.courseLabelName || '').trim()
                if (!labelName || orderedLabels.includes(labelName)) continue
                orderedLabels.push(labelName)
            }

            for (const typeItem of rawOptionalCourses) {
                const labelName = String(typeItem.courseLabelName || '').trim()
                if (!labelName) continue
                if (!orderedLabels.includes(labelName)) {
                    orderedLabels.push(labelName)
                }

                if (!mergedMap[labelName]) {
                    mergedMap[labelName] = new Map()
                }

                const courseMap = mergedMap[labelName]
                const currentCourses = Array.isArray(typeItem.courses) ? typeItem.courses : []

                for (const course of currentCourses) {
                    const uniqueKey = `${course.courseCode}_${course.faculty}_${course.credit}`
                    if (!courseMap.has(uniqueKey)) {
                        courseMap.set(uniqueKey, {
                            ...course,
                            campus: Array.isArray(course.campus) ? [...course.campus] : []
                        })
                        continue
                    }

                    const existingCourse = courseMap.get(uniqueKey)
                    const nextCampus = Array.isArray(course.campus) ? course.campus : []
                    existingCourse.campus = Array.from(new Set([...(existingCourse.campus || []), ...nextCampus]))
                }
            }

            return orderedLabels
                .filter((labelName) => Boolean(mergedMap[labelName]))
                .map((courseLabelName) => ({
                    courseLabelName,
                    courses: Array.from(mergedMap[courseLabelName].values()).sort((a, b) => String(a.courseCode).localeCompare(String(b.courseCode)))
                }))
        },
        localSelectedRowKeys: {
            get() {
                // console.log("本地的！", this.selectedRowKeys);
                return this.selectedRowKeys;
            },
            set(value: string[]) {
                // console.log("我也更新：", value);
                this.$emit('update:selectedRowKeys', value);
            }
        }
    }
}
</script>
