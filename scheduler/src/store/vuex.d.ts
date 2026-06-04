import type { 
    baseInfoTriplet, 
    courseInfo, 
    stagedCourse,
    optionalCourseType,
    occupyCell,
    courseOnTable
} from "@/utils/myInterface";

// 这个文件存在原因是：https://github.com/vuejs/vuex/issues/2213#issuecomment-1592267216
declare module "vuex" {
  export * from "vuex/types/index";
  export * from "vuex/types/helpers";
  export * from "vuex/types/logger";
  export * from "vuex/types/vue";
}

declare module 'vue' {
  import type { Store } from "vuex/types/index";
  // 声明自己的 store state
    interface State {
        majorSelected: baseInfoTriplet, /* 持久化 */
        commonLists: {
            compulsoryCourses: courseInfo[],
            optionalTypes: optionalCourseType[],
            optionalCourses: courseInfo[],
            stagedCourses: stagedCourse[], /* 持久化 */
            selectedCourses: string[], /* 持久化 */
            searchCourses: courseInfo[]
        },
        clickedCourseInfo: {
            courseCode: string,
            courseName: string,
            teacherCode?: string,
            teacherName?: string
        },
        occupied: Array<Array<occupyCell[]>>, /* 持久化 */
        timeTableData: courseOnTable[], /* 持久化 */
        flags: {
            majorNotChanged: boolean,
            isDataOutdated: boolean
        },
        updateTime: string,
        latestUpdateTime: string,
        isSpin: boolean
    }

  // 为 `this.$store` 提供类型声明
  interface ComponentCustomProperties {
    $store: Store<State>
  }
}
