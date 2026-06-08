// occupy 三维数组一个单元的数据结构
export interface occupyCell {
    code: string;
    courseName: string;
    occupyWeek: number[];
}

// timeTable 中的元素
export interface courseOnTable {
    showText: string;
    courseName: string;
    code: string;
    occupyTime: number[];
    occupyDay: number;
    occupyWeek: number[];
}

// 课程安排
export interface arrangementInfolet {
    arrangementText: string;
    occupyDay: number;
    occupyTime: number[];
    occupyWeek: number[];
    occupyRoom: string;
    teacherAndCode: string;
}

// 教师
export interface teacherlet {
    teacherName: string;
    teacherCode: string;
}

// 课程详情
export interface courseDetaillet {
    arrangementInfo: arrangementInfolet[];
    campus: string;
    code: string;
    isExclusive?: boolean;
    status?: number;
    teachers: teacherlet[];
    teachingLanguage: string;
}

// 课程信息，最上位的
export interface courseInfo {
    courseName: string;
    courseNameReserved: string;
    courseCode: string;
    courseType: string;
    faculty?: string;
    credit: number;
    courseNature?: string[];
    campus?: string[];
    status: number,
    teacher: string[];
    courseDetail: courseDetaillet[];
    grade?: number;
}

// 专业信息
export interface baseInfoTriplet {
    calendarId: number | undefined;
    grade: number | undefined;
    major: string | undefined;
}

// 选修课类型
export interface optionalCourseType {
    courseLabelId: number;
    courseLabelName: string;
}

// 鼠标点击的课程

export interface clickedCourseInfo {
    courseCode: string;
    courseName: string;
    teacherCode?: string;
    teacherName?: string;
}

// 待选/已选课程
export interface stagedCourse {
    courseCode: string;
    courseName: string;
    courseNameReserved: string;
    credit: number;
    courseType: string;
    courseNature?: string[];
    teacher: teacherlet[];
    status: number;
    courseDetail: courseDetaillet[];
}

// csv 中一门课的信息
export interface csvCourse {
    courseName: string; // 课程名称
    occupyDay: number | string, // 星期
    start: number | string, // 开始节数
    end: number | string, // 结束节数
    teacherName: string, // 老师
    occupyRoom: string, // 地点
    occucpyWeek: string; // 周数 用、分隔
}

// xls 中一门课的信息
export interface xlsCourse {
    code: string; // 课程代码
    courseName: string; // 课程名称
    teacherName: string; // 老师
}

// vue 组件中的接口

export interface rawCampus {
    campusId: string;
    campusName: string;
}

export interface rawFaculty {
    facultyId: string;
    facultyName: string;
}

// 课程同步变更类型
export enum CourseChangeType {
    NoChange = 'noChange', // 无变化
    Closed = 'closed', // 课程关课
    InfoChanged = 'infoChanged', // 信息变更
    ConflictAfterUpdate = 'conflictAfterUpdate' // 更新后发生冲突
}

// 课程变更信息
export interface CourseChangeInfo {
    courseCode: string;
    courseName: string;
    changeType: CourseChangeType;
    details?: string; // 变更详情描述
    conflictWith?: string; // 冲突的课程
}

// 课程同步结果
export interface CourseSyncResult {
    changes: CourseChangeInfo[];
    hasChanges: boolean;
}
