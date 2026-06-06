<template>
    <div class="overflow-auto h-150">
        <a-table
            :columns="columns"
            :data-source="filteredCourses(optionalCourseData)"
            :pagination="false"
            :scroll="tableScroll"
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
export default {
    components: { ATable: Table },
    data() {
        return {
            columns: ([
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
                    align: 'center'
                },
                {
                    title: '学分',
                    dataIndex: 'credit',
                    align: 'center'
                },
                {
                    title: '课程性质',
                    dataIndex: 'courseNature',
                    key: 'courseNature',
                    align: 'center',
                    customRender: ({ text }: { text: string[] }) => text ? text.join('、') : ''
                },
                {
                    title: '校区',
                    dataIndex: 'campus',
                    align: 'center',
                    customRender: ({ text }: { text: string[] }) => text ? text.join('、') : ''
                }
            ] as any[]),
            tableScroll: { x: 1040 }
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
        }
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
