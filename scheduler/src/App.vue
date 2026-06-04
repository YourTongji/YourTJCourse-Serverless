<template>
  <a-config-provider :locale="locale">
    <a-layout class="space-y-4">
      <!-- 所有 layout 放在了组件里, 不要嵌套! -->
      <a-spin :spinning="$store.state.isSpin" :indicator="myIndicator" tip="Loading" size="large" wrapperClassName="fixed-spin">  
        <MyHeader />
        <MajorInfo @changeMajor="resetSelectedRows" />
        <a-layout class="m-2">
          <!-- Mobile: tabbed layout for density (do NOT mount desktop panes on mobile) -->
          <div v-if="isMobile">
            <a-tabs v-model:activeKey="mobileTab" size="small" centered :destroyInactiveTabPane="true">
              <a-tab-pane key="timetable" tab="课表">
                <TimeTable v-if="mobileTab === 'timetable'" @cellClick="findCourseByTime" />
              </a-tab-pane>
              <a-tab-pane key="list" tab="选课">
                <CourseRoughList v-if="mobileTab === 'list'" @openOverview="handleOpen"/>
              </a-tab-pane>
              <a-tab-pane key="detail" tab="详情">
                <CourseDetailList v-if="mobileTab === 'detail'" />
              </a-tab-pane>
            </a-tabs>
          </div>

          <!-- Desktop: original two-pane layout -->
          <div v-else class="flex flex-row gap-4 h-max">
            <CourseRoughList @openOverview="handleOpen"/>
            <CourseDetailList />
          </div>
        </a-layout>

        <div v-if="!isMobile">
          <TimeTable @cellClick="findCourseByTime" />
        </div>
        <MyFooter />
      </a-spin>
    </a-layout>
    <a-modal
    title="选择课程"
    okText="提交"
    v-model:open="openOverview"
      @ok="stageCourses"
      @cancel="handleCancel"
      :centered="true"
      :maskClosable="true"
      :bodyStyle="{ maxHeight: '70vh', overflow: 'auto' }"
      style="width: 100%; max-width: 960px"
      >
      <CourseOverview v-if="openOverview" v-model:selectedRowKeys="selectedRowKeys" />
    </a-modal>

    <a-modal
      title="选修课"
      okText="提交"
      v-model:open="openOptional"
      @ok="stageCourses"
      @cancel="handleCancel"
      :centered="true"
      :maskClosable="true"
      :bodyStyle="{ maxHeight: '70vh', overflow: 'auto' }"
      style="width: 100%; max-width: 960px"
    >
      <OptionalCourseTimeOverview
        v-if="openOptional"
        v-model:selectedRowKeys="selectedRowKeys"
        v-model:optionalCourseData="optionalCourseData"
      />
    </a-modal>
  </a-config-provider>
</template>

<script lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import axios from 'axios';
import { h } from 'vue';
import { errorNotify } from './utils/notify';
import { getRowSection } from './utils/timetable';
import { defineAsyncComponent } from 'vue';
import type { courseInfo } from './utils/myInterface';
import MyHeader from './components/MyHeader.vue';
import MajorInfo from './components/MajorInfo.vue';
import TimeTable from './components/TimeTable.vue';

dayjs.locale('zh-cn');

export default {
  name: 'App',
  components: {
    MyHeader,
    MajorInfo,
    TimeTable,
    MyFooter: defineAsyncComponent(() => import('./components/MyFooter.vue')),
    CourseRoughList: defineAsyncComponent(() => import('./components/CourseRoughList.vue')),
    CourseDetailList: defineAsyncComponent(() => import('./components/CourseDetailList.vue')),
    CourseOverview: defineAsyncComponent(() => import('./components/CourseOverview.vue')),
    OptionalCourseTimeOverview: defineAsyncComponent(() => import('./components/OptionalCourseTimeOverview.vue'))
  },
  data() {
    return {
      locale: zhCN,
      selectedRowKeys: [] as string[],
      openOverview: false,
      openOptional: false,
      optionalCourseData: [],
      mobileTab: 'timetable',
      isMobile: (typeof window !== 'undefined' ? window.innerWidth < 768 : false) as boolean
    }
  },
  mounted() {
    const update = () => {
      this.isMobile = window.innerWidth < 768
    }
    ;(this as any).__onResize__ = update
    update()
    window.addEventListener('resize', update, { passive: true } as any)
  },
  beforeUnmount() {
    const fn = (this as any).__onResize__
    if (fn) window.removeEventListener('resize', fn as any)
  },
  computed: {
    myIndicator() {
      return h('svg', {
        class: 'anticon-spin',
        viewBox: '0 0 1024 1024',
        xmlns: 'http://www.w3.org/2000/svg'
      }, [
        h('path', {
          fill: 'currentColor',
          d: 'M512 64a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V96a32 32 0 0 1 32-32m0 640a32 32 0 0 1 32 32v192a32 32 0 1 1-64 0V736a32 32 0 0 1 32-32m448-192a32 32 0 0 1-32 32H736a32 32 0 1 1 0-64h192a32 32 0 0 1 32 32m-640 0a32 32 0 0 1-32 32H96a32 32 0 0 1 0-64h192a32 32 0 0 1 32 32M195.2 195.2a32 32 0 0 1 45.248 0L376.32 331.008a32 32 0 0 1-45.248 45.248L195.2 240.448a32 32 0 0 1 0-45.248m452.544 452.544a32 32 0 0 1 45.248 0L828.8 783.552a32 32 0 0 1-45.248 45.248L647.744 692.992a32 32 0 0 1 0-45.248M828.8 195.264a32 32 0 0 1 0 45.184L692.992 376.32a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0m-452.544 452.48a32 32 0 0 1 0 45.248L240.448 828.8a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0'
        })
      ]);
    }
  },
  methods: {
    normalizeDetailCourse(detail: Record<string, unknown>) {
      const teachers = Array.isArray(detail?.teachers) ? detail.teachers : [];
      const teacherAndCode = teachers
        .map((teacher: any) => `${String(teacher?.teacherName || '')}(${String(teacher?.teacherCode || '')})`)
        .filter((value: string) => value !== '()')
        .join(', ');

      const arrangementInfo = Array.isArray(detail?.arrangementInfo)
        ? detail.arrangementInfo.map((arrangement: any) => ({
          ...arrangement,
          teacherAndCode: String(arrangement?.teacherAndCode || teacherAndCode || '').trim()
        }))
        : [];

      return {
        ...detail,
        status: 0,
        arrangementInfo,
      };
    },
    findCompulsoryCourseByRowKey(rowKey: string) {
      const parts = String(rowKey || '').split('_');
      const gradeText = parts[1] || '';
      const courseCode = parts.slice(2).join('_');
      const grade = Number(gradeText);

      return this.$store.state.commonLists.compulsoryCourses.find((course: any) => {
        return String(course?.courseCode || '') === courseCode
          && Number(course?.grade || 0) === grade;
      });
    },
    handleOpen() {
      this.openOverview = true;
      // console.log("openOverview", this.openOverview);
    },
    handleCancel() {
      this.openOverview = false;
      this.selectedRowKeys = []; // 清空一下，不然动画会保持原来的状态
      // console.log("清空！", this.selectedRowKeys);
    },
    handleCancelOptional() {
      this.openOptional = false;
      this.selectedRowKeys = [];
    },
    resetSelectedRows() {
      // console.log("resetSelectedRows");
      this.selectedRowKeys = [];
    },
    async stageCourses() {
      this.openOverview = false;
      this.openOptional = false;
      this.$store.commit("setSpin", true);
      
      // 收集所有需要请求课程详情的课程代码
      const optionalCodes: string[] = [];
      const searchCodes: string[] = [];
      const compulsoryCourses: string[] = [];

      // 第一步：分类所有选中的课程
      for (const key of this.selectedRowKeys) {
        const type = key[0];

        if (type === '必') {
          compulsoryCourses.push(key);
        }
        else if (type === '选') {
          const _courseCode = key.split('_').slice(2).join('_');
          optionalCodes.push(_courseCode);
        }
        else if (type === '查') {
          const _courseCode = key.split('_')[1];
          searchCodes.push(_courseCode);
        }
      }

      // 第二步：处理必修课（直接从 vuex 获取）
      for (const key of compulsoryCourses) {
        const originalCourse = this.findCompulsoryCourseByRowKey(key);
        if (!originalCourse) {
          errorNotify(`找不到计划内课程 ${key} 的基本信息`);
          continue;
        }
        
        const _courseObject = {
          courseCode: originalCourse.courseCode,
          courseName: originalCourse.courseName + '(' + originalCourse.courseCode + ')',
          courseNameReserved: originalCourse.courseName,
          credit: originalCourse.credit,
          courseType: "必",
          teacher: [],
          status: 0,
          grade: Number((originalCourse as any).grade || this.$store.state.majorSelected.grade || 0),
          courseDetail: (originalCourse.courses || []).map((course: Record<string, unknown>) => this.normalizeDetailCourse(course))
        }

        this.$store.commit("pushStagedCourse", _courseObject);
      }

      // 第三步：批量请求选修课详情
      if (optionalCodes.length > 0) {
        try {
          const res = await axios({
            url: '/api/findCourseDetailByCode',
            method: 'post',
            data: {
              courseCodes: optionalCodes,
              calendarId: this.$store.state.majorSelected.calendarId
            }
          });

          const courseDetailMap = res.data.data; // { courseCode: [details] }

          for (const courseCode of optionalCodes) {
            try {
              // 优先从 optionalCourses 查找，如果找不到则从 optionalCourseData 查找
              let _roughCourse = this.$store.state.commonLists.optionalCourses
                .find((courseGroup: { courses: Array<{ courseCode: string }> }) => courseGroup.courses.some((course: { courseCode: string }) => course.courseCode === courseCode))
                ?.courses.find((course: { courseCode: string }) => course.courseCode === courseCode);
              
              if (!_roughCourse) {
                _roughCourse = this.optionalCourseData.find((course: { courseCode: string }) => course.courseCode === courseCode);
              }
              
              if (!_roughCourse) {
                throw new Error(`找不到课程 ${courseCode} 的基本信息`);
              }
              
              const _detailCourse = courseDetailMap[courseCode] || [];

              const _courseObject = {
                courseCode: _roughCourse.courseCode,
                courseName: _roughCourse.courseName + '(' + _roughCourse.courseCode + ')',
                courseNameReserved: _roughCourse.courseName,
                credit: _roughCourse.credit,
                courseType: String((_roughCourse as any).crossDiscipline ? '跨' : '选'),
                teacher: [],
                status: 0,
                grade: Number((_roughCourse as any).grade || 0),
                courseDetail: _detailCourse.map((course: Record<string, unknown>) => this.normalizeDetailCourse(course))
              }

              this.$store.commit("pushStagedCourse", _courseObject);
            }
            catch (error: unknown) {
              const err = error as Error;
              errorNotify(err.message || `添加课程 ${courseCode} 失败`);
            }
          }
        }
        catch (error: unknown) {
          const err = error as { response?: { data?: { msg?: string } }; message?: string };
          errorNotify(err.response?.data?.msg || err.message || '批量添加选修课失败');
        }
      }

      // 第四步：批量请求搜索课程详情
      if (searchCodes.length > 0) {
        try {
          const res = await axios({
            url: '/api/findCourseDetailByCode',
            method: 'post',
            data: {
              courseCodes: searchCodes,
              calendarId: this.$store.state.majorSelected.calendarId
            }
          });

          const courseDetailMap = res.data.data;

          for (const courseCode of searchCodes) {
            try {
              const _roughCourse = this.$store.state.commonLists.searchCourses
                .find((course: courseInfo) => course.courseCode === courseCode);
              
              if (!_roughCourse) {
                throw new Error(`找不到课程 ${courseCode} 的基本信息`);
              }

              const _detailCourse = courseDetailMap[courseCode] || [];

              const _courseObject = {
                courseCode: _roughCourse.courseCode,
                courseName: _roughCourse.courseName + '(' + _roughCourse.courseCode + ')',
                courseNameReserved: _roughCourse.courseName,
                credit: _roughCourse.credit,
                courseType: "查",
                teacher: [],
                status: 0,
                grade: Number((_roughCourse as any).grade || 0),
                courseDetail: _detailCourse.map((course: Record<string, unknown>) => this.normalizeDetailCourse(course))
              }

              this.$store.commit("pushStagedCourse", _courseObject);
            }
            catch (error: unknown) {
              const err = error as Error;
              errorNotify(err.message || `添加课程 ${courseCode} 失败`);
            }
          }
        }
        catch (error: unknown) {
          const err = error as { response?: { data?: { msg?: string } }; message?: string };
          errorNotify(err.response?.data?.msg || err.message || '批量添加搜索课程失败');
        }
      }

      // 清空 selectedRowKeys
      this.selectedRowKeys = [];
      this.$store.commit("setSpin", false);
    },
    async findCourseByTime(cell: { day: number; class: number; calendarId: number }) {
      this.$store.commit("setSpin", true);
      console.log("cell", cell);

      try {
        const res = await axios({
          url: '/api/findCourseByTime',
          method: 'post',
          data: {
            calendarId: cell.calendarId,
            day: cell.day,
            section: getRowSection(cell.class, cell.calendarId)
          }
        });

        // console.log("res", res.data.data);

        this.optionalCourseData = res.data.data;
        this.openOptional = true;
      }
      catch (error: unknown) {
        // console.log("error:", error);
        const err = error as { response?: { data?: { msg?: string } } };
        errorNotify(err.response?.data?.msg || '查询课程失败');
      }
      finally {
        this.$store.commit("setSpin", false);
      }
    }
  }
}
</script>

<style scoped>
/* Loading 图标固定定位 */
:deep(.fixed-spin .ant-spin) {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  z-index: 9999 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
}

:deep(.fixed-spin .ant-spin-blur) {
  pointer-events: none;
}

/* Loading 图标样式 */
:deep(.fixed-spin .ant-spin-dot) {
  font-size: 42px !important;
  width: 42px !important;
  height: 42px !important;
  position: static !important;
  inset-inline-start: auto !important;
  display: block !important;
  margin: 0 !important;
}

:deep(.fixed-spin .ant-spin svg) {
  width: 42px !important;
  height: 42px !important;
  display: block !important;
  animation: loading-rotate 2s linear infinite;
}

:deep(.fixed-spin .ant-spin svg path) {
  fill: #409eff !important;
}

:deep(.fixed-spin .ant-spin-text) {
  color: #409eff !important;
  font-size: 14px !important;
  margin-top: 32px !important;
  padding-top: 0 !important;
}

@keyframes loading-rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
