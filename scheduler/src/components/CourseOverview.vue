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
            <div class="max-h-[60vh] md:h-150 overflow-auto">
                <a-table
                :columns="columns.compulsory"
                v-for="courses in $store.getters.sortCompulsoryCoursesByGrade"
                :key="courses.grade"
                :data-source="filteredCourses(courses.courses)"
                :pagination="false"
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
                    <div class="max-h-[60vh] md:h-150 overflow-auto">
                        <a-table
                        :columns="columns.optional"
                        :data-source="filteredCourses(type.courses)"
                        :pagination="false"
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
                        align: 'center'
                    },
                    {
                        title: '课程名称',
                        dataIndex: 'courseName',
                        align: 'center'
                    },
                    {
                        title: '开课学院',
                        dataIndex: 'faculty',
                        align: 'center',
                        responsive: ['md']
                    },
                    {
                        title: '学分',
                        dataIndex: 'credit',
                        align: 'center'
                    },
                    {
                        title: '课程性质',
                        dataIndex: 'courseNature',
                        align: 'center',
                        customRender: ({ text }: { text: string[] }) => text ? text.join('、') : '',
                        responsive: ['md']
                    }
                ] as any[]),
                optional: ([
                    {
                        title: '课程代码',
                        dataIndex: 'courseCode',
                        align: 'center'
                    },
                    {
                        title: '课程名称',
                        dataIndex: 'courseName',
                        align: 'center'
                    },
                    {
                        title: '开课学院',
                        dataIndex: 'faculty',
                        align: 'center',
                        responsive: ['md']
                    },
                    {
                        title: '学分',
                        dataIndex: 'credit',
                        align: 'center'
                    },
                    {
                        title: '校区',
                        dataIndex: 'campus',
                        align: 'center',
                        customRender: ({ text }: { text: string[] }) => text ? text.join('、') : '',
                        responsive: ['md']
                    }
                ] as any[])
            },

            // 搜索
            searchValue: ''
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
