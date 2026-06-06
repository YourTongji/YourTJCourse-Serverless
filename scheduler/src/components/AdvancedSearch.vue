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
            <template v-if="isMobile">
                <div class="space-y-3 pb-4">
                    <button
                        v-for="course in filteredCourses($store.state.commonLists.searchCourses)"
                        :key="'mobile_查_' + course.courseCode"
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
                        :columns="searchColumn"
                        :data-source="filteredCourses($store.state.commonLists.searchCourses)"
                        :pagination="false"
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
            isMobile: getIsMobile(),
            _cleanupMobile: null as (() => void) | null,
            searchColumn: ([
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
        formatList(value: unknown) {
            return formatCourseList(value);
        },
        courseKey(course: any) {
            return `查_${course.courseCode}`;
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
        },
        onSearchSelectChange(localSelectedRowKeys: any[]) {
            this.localSelectedRowKeys = (localSelectedRowKeys || []).map((key: any) => String(key));
        },
    },
    mounted() {
        this._cleanupMobile = onMobileChange((v: boolean) => { this.isMobile = v });
        this.isMobile = getIsMobile();
        this.getAllCampus();
        this.getAllFaculty();
    },
    beforeUnmount() {
        if (this._cleanupMobile) this._cleanupMobile();
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
