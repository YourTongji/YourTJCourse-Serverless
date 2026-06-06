<template>
    <div>
        <div class="flex flex-row flex-wrap gap-4 mb-4">
            <div class="w-90">
                <p>课程名称</p>
                <a-input v-model:value="searchBody.courseName" placeholder="请输入"/>
            </div>
            <div class="w-90">
                <p>课程代码</p>
                <a-input v-model:value="searchBody.courseCode" placeholder="请输入"/>
            </div>
            <div class="w-90">
                <p>教师工号</p>
                <a-input v-model:value="searchBody.teacherCode" placeholder="请输入"/>
            </div>
            <div class="w-90">
                <p>教师姓名</p>
                <a-input v-model:value="searchBody.teacherName" placeholder="请输入"/>
            </div>
            <div class="w-90">
                <p>校区</p>
                <a-select v-model:value="searchBody.campus" placeholder="请选择" class="w-full" show-search allow-clear>
                    <a-select-option v-for="campus in rawList.campus" :key="campus.campusId || campus.campusName" :value="campus.campusName">{{ campus.campusName }}</a-select-option>
                </a-select>
            </div>
            <div class="w-90">
                <p>开课学院</p>
                <a-select v-model:value="searchBody.faculty" placeholder="请选择" class="w-full" show-search allow-clear>
                    <a-select-option v-for="faculty in rawList.faculty" :key="faculty.facultyId || faculty.facultyName" :value="faculty.facultyName">{{ faculty.facultyName }}</a-select-option>
                </a-select>
            </div>
        </div>
        <div class="mb-4">
            <a-button type="primary" @click="findCourseBySearch">搜索</a-button>
        </div>
        <div class="h-110 overflow-auto">
            <a-table
                        :columns="searchColumn"
                        :data-source="filteredCourses($store.state.commonLists.searchCourses)"
                        :pagination="false"
                        :scroll="searchTableScroll"
                        :row-selection="{ 
                            selectedRowKeys: localSelectedRowKeys.filter((key: string) => key.startsWith('查' + '_')), 
                            onChange: (keys: any[]) => onSearchSelectChange(keys) 
                        }"
                        :row-key="(record: any) => '查' + '_' + record.courseCode"
                        :row-class-name="(_record: string, index: number) => index % 2 === 1 ? 'bg-gray-50' : ''"
                    >
                    </a-table>
        </div>
    </div>
</template>


<script lang="ts">
import axios from 'axios';
import { Input, Table } from 'ant-design-vue';
import { errorNotify } from '@/utils/notify';
import type { courseInfo, stagedCourse, rawCampus, rawFaculty } from '@/utils/myInterface';

export default {
    components: { AInput: Input, ATable: Table },
    data() {
        return {
            searchBody: {
                calendarId: this.$store.state.majorSelected.calendarId,
                courseName: '',
                courseCode: '',
                teacherCode: '',
                teacherName: '',
                campus: undefined,
                faculty: undefined
            },
            rawList: {
                campus: [] as rawCampus[],
                faculty: [] as rawFaculty[]
            },
            searchColumn: ([
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
            searchTableScroll: { x: 1040 }
        }
    },
    methods: {
        ensureCampusList(value: unknown) {
            return Array.isArray(value) ? value : [];
        },
        ensureFacultyList(value: unknown) {
            return Array.isArray(value) ? value : [];
        },
        async getAllCampus () {
            this.$store.commit('setSpin', true);

            try {
                const res = await axios.get('/api/getAllCampus');
                this.rawList.campus = this.ensureCampusList(res.data?.data);
            }
            catch (error: unknown) {
                const err = error as { response?: { data?: { msg?: string } } };
                errorNotify(err.response?.data?.msg || '获取校区失败');
            }
            finally {
                this.$store.commit('setSpin', false);
            }
        },

        async getAllFaculty () {
            this.$store.commit('setSpin', true);

            try {
                const res = await axios.get('/api/getAllFaculty');
                this.rawList.faculty = this.ensureFacultyList(res.data?.data);
            }
            catch (error: unknown) {
                const err = error as { response?: { data?: { msg?: string } } };
                errorNotify(err.response?.data?.msg || '获取院系失败');
            }
            finally {
                this.$store.commit('setSpin', false);
            }
        },
        
        async findCourseBySearch() {
            this.$store.commit('setSpin', true);

            try {
                const searchData = { ...this.searchBody } as Record<string, string | undefined>;
                for (const key in searchData) {
                    if (searchData[key] === undefined) {
                        searchData[key] = '';
                    }
                }
                const res = await axios({
                    url: '/api/findCourseBySearch',
                    method: 'post',
                    data: searchData
                });
                // console.log(res.data.data);
                const courses = Array.isArray(res.data?.data?.courses) ? res.data.data.courses : [];
                const sizeLimit = Number(res.data?.data?.sizeLimit || 0);
                this.$store.commit('setSearchedCourses', courses);

                if (sizeLimit > 0 && courses.length >= sizeLimit) {
                    errorNotify('搜索结果过多，只展示了前' + sizeLimit + '条');
                }
            }
            catch (error: unknown) {
                const err = error as { response?: { data?: { msg?: string } } };
                errorNotify(err.response?.data?.msg || '搜索失败');
            }
            finally {
                this.$store.commit('setSpin', false);
            }
        },
        filteredCourses(courses: courseInfo[]) {
            const safeCourses = Array.isArray(courses) ? courses : [];
            // console.log(courses);
            // 根据已选课程来过滤，德摩根律啊！思考一下为什么是 && 而不是 ||
            const visibleCourses = safeCourses.filter((course) => {
                return !this.$store.state.commonLists.stagedCourses.some((stagedCourse: stagedCourse) => stagedCourse.courseCode === course.courseCode);
            });

            // 保留表格中和 this.searchValue 代码或者名称匹配的课程
            if (this.searchValue === '') {
                return visibleCourses;
            }
            else {
                // 根据检索条件过滤课程
                return visibleCourses.filter(course => course.courseCode.includes(this.searchValue) || course.courseName.includes(this.searchValue));
            }
        },
        onSearchSelectChange(localSelectedRowKeys: any[]) {
            this.localSelectedRowKeys = (localSelectedRowKeys || []).map((key: any) => String(key));
        },
    },
    mounted() {
        this.getAllCampus();
        this.getAllFaculty();
    },
    props: ['searchValue', 'selectedRowKeys'],
    computed: {
        localSelectedRowKeys: {
            get() {
                return this.selectedRowKeys;
            },
            set(val: string[]) {
                // console.log("更新：", val);
                this.$emit('update:selectedRowKeys', val);
            }
        }
    }   
}

</script>
