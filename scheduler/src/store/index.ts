import { createStore } from "vuex";
import { canAddCourse, insertOccupied, deleteOccupied, getCourseBaseCode, isClassOfCourse, isSameCourse } from "@/utils/courseManipulate";
import type { 
    courseDetaillet, 
    baseInfoTriplet, 
    courseInfo, 
    clickedCourseInfo,
    stagedCourse,
    optionalCourseType,
    occupyCell,
    courseOnTable,
    teacherlet,
    arrangementInfolet
 } from "@/utils/myInterface";
import { errorNotify } from "@/utils/notify";
import type { State } from "vue";

type StoreState = State;

function safeParseJson<T = unknown>(value: string | null): T | undefined {
    if (!value) return undefined;
    try {
        return JSON.parse(value) as T;
    }
    catch {
        return undefined;
    }
}

function createEmptyOccupied() {
    return Array(12).fill(null).map(() => Array(7).fill(undefined).map(() => []));
}

function ensureArray<T = unknown>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
}

function normalizeStringList(value: unknown): string[] {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "[]" || trimmed === "[\"\"]") return [];
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            const parsed = safeParseJson<unknown>(trimmed);
            if (parsed !== undefined) return normalizeStringList(parsed);
        }
        return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    }
    if (Array.isArray(value)) {
        return value
            .flatMap((item) => normalizeStringList(item))
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeCredit(value: unknown): number {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
    return Number.isFinite(n) ? n : 0;
}

function sanitizeTeachers(raw: unknown): teacherlet[] {
    return ensureArray(raw).map((item: any) => ({
        teacherName: typeof item?.teacherName === "string" ? item.teacherName : "",
        teacherCode: typeof item?.teacherCode === "string" ? item.teacherCode : ""
    })).filter((item) => item.teacherName || item.teacherCode);
}

function sanitizeArrangementInfo(raw: unknown): arrangementInfolet[] {
    return ensureArray(raw).map((item: any) => ({
        arrangementText: typeof item?.arrangementText === "string" ? item.arrangementText : "",
        occupyDay: typeof item?.occupyDay === "number" ? item.occupyDay : 0,
        occupyTime: ensureArray<number>(item?.occupyTime).filter((slot) => typeof slot === "number" && slot >= 1 && slot <= 12),
        occupyWeek: ensureArray(item?.occupyWeek).filter((week: unknown) => typeof week === "number"),
        occupyRoom: typeof item?.occupyRoom === "string" ? item.occupyRoom : "",
        teacherAndCode: typeof item?.teacherAndCode === "string" ? item.teacherAndCode : ""
    })).filter((item) => item.occupyDay >= 1 && item.occupyDay <= 7 && item.occupyTime.length > 0);
}

function sanitizeCourseDetail(raw: unknown): courseDetaillet[] {
    return ensureArray(raw).map((detail: any) => ({
        arrangementInfo: sanitizeArrangementInfo(detail?.arrangementInfo),
        campus: normalizeStringList(detail?.campus).join("、"),
        code: typeof detail?.code === "string" ? detail.code : "",
        isExclusive: typeof detail?.isExclusive === "boolean" ? detail.isExclusive : undefined,
        status: typeof detail?.status === "number" ? detail.status : 0,
        teachers: sanitizeTeachers(detail?.teachers),
        teachingLanguage: typeof detail?.teachingLanguage === "string" ? detail.teachingLanguage : ""
    })).filter((detail) => detail.code);
}

function sanitizeMajorSelected(value: unknown) {
    const input = (value && typeof value === "object") ? value as Record<string, unknown> : {};
    return {
        calendarId: typeof input.calendarId === "number" ? input.calendarId : undefined,
        grade: typeof input.grade === "number" ? input.grade : undefined,
        major: typeof input.major === "string" ? input.major : undefined
    };
}

function sanitizeStagedCourse(raw: unknown) {
    const input = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
    return {
        ...input,
        courseCode: typeof input.courseCode === "string" ? input.courseCode : "",
        courseName: typeof input.courseName === "string" ? input.courseName : "",
        courseNameReserved: typeof input.courseNameReserved === "string" ? input.courseNameReserved : "",
        credit: normalizeCredit(input.credit),
        courseType: typeof input.courseType === "string" ? input.courseType : "",
        teacher: sanitizeTeachers(input.teacher),
        status: typeof input.status === "number" ? input.status : 0,
        courseDetail: sanitizeCourseDetail(input.courseDetail)
    };
}

function sanitizeTimeTableData(raw: unknown) {
    return ensureArray(raw).map((item: any) => ({
        ...item,
        showText: typeof item?.showText === "string" ? item.showText : "",
        courseName: typeof item?.courseName === "string" ? item.courseName : "",
        code: typeof item?.code === "string" ? item.code : "",
        occupyTime: ensureArray(item?.occupyTime).filter((slot: unknown) => typeof slot === "number" && slot >= 1 && slot <= 12),
        occupyDay: typeof item?.occupyDay === "number" && item.occupyDay >= 1 && item.occupyDay <= 7 ? item.occupyDay : 0
    })).filter((item) => item.code && item.courseName && item.occupyDay > 0 && item.occupyTime.length > 0);
}

function sanitizeOccupied(raw: unknown) {
    const rows = ensureArray(raw);
    if (rows.length !== 12) return createEmptyOccupied();
    return rows.map((row: any) => {
        const cols = ensureArray(row);
        if (cols.length !== 7) return Array(7).fill(undefined).map(() => []);
        return cols.map((cell: any) => ensureArray(cell).map((item: any) => ({
            code: typeof item?.code === "string" ? item.code : "",
            courseName: typeof item?.courseName === "string" ? item.courseName : "",
            occupyWeek: ensureArray(item?.occupyWeek).filter((week: unknown) => typeof week === "number")
        })).filter((item: any) => item.code));
    });
}

function sanitizeOptionalTypes(raw: unknown) {
    return ensureArray(raw).map((item: any) => ({
        courseLabelId: typeof item?.courseLabelId === "number" ? item.courseLabelId : 0,
        courseLabelName: typeof item?.courseLabelName === "string" ? item.courseLabelName : ""
    })).filter((item) => item.courseLabelId > 0 && item.courseLabelName);
}

function sanitizeCourseCollection(raw: unknown) {
    return ensureArray(raw).map((item: any) => ({
        ...item,
        courseCode: typeof item?.courseCode === "string" ? item.courseCode : "",
        courseName: typeof item?.courseName === "string" ? item.courseName : "",
        courseNameReserved: typeof item?.courseNameReserved === "string" ? item.courseNameReserved : "",
        faculty: typeof item?.faculty === "string" ? item.faculty : "",
        credit: normalizeCredit(item?.credit),
        courseNature: normalizeStringList(item?.courseNature),
        campus: normalizeStringList(item?.campus),
        courses: ensureArray(item?.courses).map((course: any) => ({
            ...course,
            code: typeof course?.code === "string" ? course.code : "",
            courseNature: normalizeStringList(course?.courseNature),
            campus: normalizeStringList(course?.campus),
            teachers: sanitizeTeachers(course?.teachers),
            arrangementInfo: sanitizeArrangementInfo(course?.arrangementInfo)
        }))
    })).filter((item) => item.courseCode || ensureArray(item?.courses).length > 0);
}

const store = createStore<StoreState>({
    state() {
        return {
            // 检索的基本信息
            majorSelected: {
                calendarId: undefined,
                grade: undefined,
                major: undefined
            },
            // 通用列表
            commonLists: {
                // 显示在 courseOverview 页面的课程列表
                compulsoryCourses: [], // 必修课
                optionalTypes: [], // 选修课类型
                optionalCourses: [], // 选修课
                searchCourses: [], // 通过搜索得到的课程

                // 选择课程时的课程列表
                stagedCourses: [], // 备选课程
                selectedCourses: [], // 已选课程
            },
            // 点击的课程信息
            clickedCourseInfo: {
                courseCode: '',
                courseName: '',
                teacherCode: '',
                teacherName: ''
            },
            // 课程表数据
            occupied: createEmptyOccupied(), // 12 * 7 的二维数组，每个元素是一个数组
            timeTableData: [], // 课程表数据
            // 标志位
            flags: {
                majorNotChanged: false, // 专业是否被改变，如果改变了，需要重新向后端请求数据
                isDataOutdated: false // 数据是否过期
            },
            updateTime: '',
            latestUpdateTime: '', // 后端的最新更新时间
            isSpin: false
        }
    },
    mutations: {
        setMajorInfo(state: StoreState, payload: baseInfoTriplet) {
            state.majorSelected = payload;
            state.flags.majorNotChanged = false;
        },
        setCompulsoryCourses(state: StoreState, payload: courseInfo[]) {
            state.commonLists.compulsoryCourses = sanitizeCourseCollection(payload);
            state.flags.majorNotChanged = true;
        },
        setOptionalTypes(state: StoreState, payload: optionalCourseType[]) {
            // console.log(payload);
            state.commonLists.optionalTypes = sanitizeOptionalTypes(payload);
        },
        setOptionalCourses(state: StoreState, payload: courseInfo[]) {
            state.commonLists.optionalCourses = sanitizeCourseCollection(payload);
            // console.log(state.commonLists.optionalCourses);
        },
        setSearchedCourses(state: StoreState, payload: courseInfo[]) {
            // console.log(payload);
            state.commonLists.searchCourses = sanitizeCourseCollection(payload);
        },
        pushStagedCourse(state: StoreState, payload: stagedCourse) {
            state.commonLists.stagedCourses.push(sanitizeStagedCourse(payload));
            // console.log(state.commonLists.stagedCourses.length);
        },
        popStagedCourse(state: StoreState, payload: string) {
            // 清除和退课共用一个方法
            // payload = base course code (e.g. "XM104032"), code with suffix = "XM104032.01"
            // console.log("退课", payload);
            state.commonLists.stagedCourses = state.commonLists.stagedCourses.filter((course: stagedCourse) => course.courseCode !== payload);
            state.commonLists.selectedCourses = state.commonLists.selectedCourses.filter((course: string) => !isClassOfCourse(course, payload));
            state.timeTableData = state.timeTableData.filter((course: courseOnTable) => !isClassOfCourse(course.code, payload));
            const codeOfCourse = state.occupied.flat().flat().find((item: occupyCell) => isClassOfCourse(item.code, payload))?.code;

            if (codeOfCourse) {
                deleteOccupied(state.occupied, codeOfCourse); // deleteOccupied 接收的是包含班号的课号，所以对于 courseCode，需要找到班号
            }

            // 点击课程清空
            state.clickedCourseInfo = {
                courseCode: '',
                courseName: '',
                teacherCode: '',
                teacherName: ''
            };

            // console.log(state.clickedCourseInfo);
        },
        setClickedCourseInfo(state: StoreState, payload: clickedCourseInfo) {
            // console.log(payload);
            state.clickedCourseInfo = payload;
        },
        clearStagednSelectedCourses(state: StoreState) {
            state.commonLists.stagedCourses = [];
            state.commonLists.selectedCourses = [];
            state.timeTableData = [];
            state.occupied = createEmptyOccupied();
            state.clickedCourseInfo = {
                courseCode: '',
                courseName: '',
                teacherCode: '',
                teacherName: ''
            };
        },
        updateTimeTable(state: StoreState, payload: courseDetaillet) {      
            // console.log("排课信息:", payload)

            const retOfCanAddCourse = canAddCourse(payload.arrangementInfo, state.occupied, payload.code);

            if (retOfCanAddCourse.canAdd) {
                const sameCodeCourse = state.timeTableData?.find((course: courseOnTable) => isSameCourse(course.code, payload.code));

                // 规定相同课号的课只能有一个
                if (sameCodeCourse) {
                    state.timeTableData = state.timeTableData.filter((course: courseOnTable) => !isSameCourse(course.code, payload.code));
                    deleteOccupied(state.occupied, sameCodeCourse.code);

                    // console.log("stagedCourses:", state.commonLists.stagedCourses);

                    // 修改状态文字
                    const stagedCourse = state.commonLists.stagedCourses
                                        .find((course: stagedCourse) => course.courseCode === getCourseBaseCode(payload.code));
                    if (stagedCourse) {
                        // console.log("目标", stagedCourse);
                        const targetCourse = stagedCourse.courseDetail.find((course: courseDetaillet) => isSameCourse(course.code, payload.code) && course.status === 1);
                        if (targetCourse) {
                            // console.log("找到了！");
                            targetCourse.status = 0;
                        }
                    }
                }

                // 存到课表数据中
                payload.arrangementInfo.forEach(
                    (arrangement) => {
                        const courseOnTable = { // 每次需要重新创建一个对象，否则会出现引用问题
                            showText: arrangement.teacherAndCode + ' ' 
                                      + state.clickedCourseInfo.courseName + '(' + payload.code + ') ' 
                                      + arrangement.arrangementText,
                            courseName: state.clickedCourseInfo.courseName,
                            code: payload.code,
                            occupyTime: arrangement.occupyTime,
                            occupyDay: arrangement.occupyDay,
                        }
                        // console.log("push 了星期", courseOnTable.occupyDay);
                        state.timeTableData.push(courseOnTable);
                    }
                );

                // console.log("当前课表数据：", state.timeTableData);

                // 更新占用情况
                insertOccupied(state.occupied, payload.arrangementInfo, payload.code, state.clickedCourseInfo.courseName);

                // 修改状态文字
                payload.status = 1;
                const stagedCourse = state.commonLists.stagedCourses.find((course: stagedCourse) => course.courseCode === getCourseBaseCode(payload.code));
                if (stagedCourse) {
                    stagedCourse.status = 1;
                    stagedCourse.teacher = payload.teachers;
                }

                // 修改教师信息
            }
            else {
                errorNotify("课程与「" + retOfCanAddCourse.collideCourse + "」冲突");
                // console.log("课程冲突");
            }
        },
        saveSelectedCourses(state: StoreState) {
            // 要修改两件事：1. stagedCourses 的 status 2. 添加新的 selectedCourses
            state.commonLists.stagedCourses.forEach((course: stagedCourse) => {
                // console.log(course);
                if (course.status === 1) {
                    // 修改状态为 2
                    course.status = 2;
                    
                    // 把 courseDetail 中的 status 也修改为 2，并且 push 到 selectedCourses 中
                    course.courseDetail.forEach((detail: courseDetaillet) => {
                        if (detail.status === 1) {
                            detail.status = 2;
                            state.commonLists.selectedCourses.push(detail.code);
                        }
                        else if (detail.status === 2) {
                            detail.status = 0; // 如果是之前选的课，要修改状态为未选
                            state.commonLists.selectedCourses = state.commonLists.selectedCourses.filter((code: string) => code !== detail.code);
                        }
                    });
                }
            });
        },
        setSpin(state: StoreState, payload: boolean) {
            state.isSpin = payload;
        },
        setUpdateTime(state: StoreState, payload: string) {
            state.updateTime = payload;
            localStorage.setItem("updateTime", state.updateTime);
        },
        setLatestUpdateTime(state: StoreState, payload: string) {
            state.latestUpdateTime = payload;
        },
        setDataOutdated(state: StoreState, payload: boolean) {
            state.flags.isDataOutdated = payload;
        },
        syncLatestData(state: StoreState) {
            // 同步最新数据：清除课程缓存并更新时间
            localStorage.removeItem("stagedCourses");
            localStorage.removeItem("selectedCourses");
            localStorage.removeItem("occupied");
            localStorage.removeItem("timeTableData");
            state.commonLists.stagedCourses = [];
            state.commonLists.selectedCourses = [];
            state.timeTableData = [];
            state.occupied = createEmptyOccupied();
            state.clickedCourseInfo = {
                courseCode: '',
                courseName: '',
                teacherCode: '',
                teacherName: ''
            };
            state.updateTime = state.latestUpdateTime;
            localStorage.setItem("updateTime", state.updateTime);
            state.flags.isDataOutdated = false;
        },
        smartSyncCourses(state: StoreState, payload: { 
            newStagedCourses: stagedCourse[], 
            newSelectedCodes: string[],
            newOccupied: occupyCell[][][],
            newTimeTableData: courseOnTable[]
        }) {
            // 智能同步：更新课程信息但保留用户选择
            state.commonLists.stagedCourses = payload.newStagedCourses;
            state.commonLists.selectedCourses = payload.newSelectedCodes;
            state.occupied = payload.newOccupied;
            state.timeTableData = payload.newTimeTableData;
            state.updateTime = state.latestUpdateTime;
            
            // 更新localStorage
            localStorage.setItem("stagedCourses", JSON.stringify(state.commonLists.stagedCourses));
            localStorage.setItem("selectedCourses", JSON.stringify(state.commonLists.selectedCourses));
            localStorage.setItem("occupied", JSON.stringify(state.occupied));
            localStorage.setItem("timeTableData", JSON.stringify(state.timeTableData));
            localStorage.setItem("updateTime", state.updateTime);
            
            state.flags.isDataOutdated = false;
        },
        solidify(state: StoreState) {
            localStorage.setItem("majorSelected", JSON.stringify(state.majorSelected));
            localStorage.setItem("stagedCourses", JSON.stringify(state.commonLists.stagedCourses));
            localStorage.setItem("selectedCourses", JSON.stringify(state.commonLists.selectedCourses));
            localStorage.setItem("occupied", JSON.stringify(state.occupied));
            localStorage.setItem("timeTableData", JSON.stringify(state.timeTableData));
        },
        loadSolidify(state: StoreState) {
            const majorSelected = safeParseJson(localStorage.getItem("majorSelected"));
            if (majorSelected) {
                state.majorSelected = sanitizeMajorSelected(majorSelected);
            }
            const stagedCourses = safeParseJson(localStorage.getItem("stagedCourses"));
            if (stagedCourses) {
                state.commonLists.stagedCourses = ensureArray(stagedCourses).map(sanitizeStagedCourse);
            }
            const selectedCourses = safeParseJson(localStorage.getItem("selectedCourses"));
            if (selectedCourses) {
                state.commonLists.selectedCourses = ensureArray(selectedCourses).filter((item: unknown) => typeof item === "string");
            }
            const occupied = safeParseJson(localStorage.getItem("occupied"));
            if (occupied) {
                state.occupied = sanitizeOccupied(occupied);
            }
            const timeTableData = safeParseJson(localStorage.getItem("timeTableData"));
            if (timeTableData) {
                state.timeTableData = sanitizeTimeTableData(timeTableData);
            }
        },
        clearSolidify() {
            localStorage.removeItem("majorSelected");
            localStorage.removeItem("stagedCourses");
            localStorage.removeItem("selectedCourses");
            localStorage.removeItem("occupied");
            localStorage.removeItem("timeTableData");
        },
        clearSolidifyCourse() {
            localStorage.removeItem("stagedCourses");
            localStorage.removeItem("selectedCourses");
            localStorage.removeItem("occupied");
            localStorage.removeItem("timeTableData");
        },
        loadSolidifyTime(state: StoreState) {
            const updateTime = localStorage.getItem("updateTime");
            if (updateTime) {
                state.updateTime = updateTime;
            }
        }
    },
    getters: {
        isMajorSelected(state: StoreState) {
            // console.log(',', state.majorSelected);
            return state.majorSelected.calendarId && state.majorSelected.grade && state.majorSelected.major;
        },
        sortCompulsoryCoursesByGrade(state: StoreState) {
            // 返回一个数组
            // 每个元素是一个对象，对象的key是年级，value是一个数组，数组中是这个年级的必修课
            // value 按照课程号排序
            // 年级按降序排序
            const sortedCourses: { [key: number]: courseInfo[] } = {};
            state.commonLists.compulsoryCourses.forEach((course: courseInfo) => {
                if (course.grade !== undefined) {
                    if (!sortedCourses[course.grade]) {
                        sortedCourses[course.grade] = [];
                    }
                    sortedCourses[course.grade].push(course);
                }
            });
            
            for (const key in sortedCourses) {
                sortedCourses[key].sort((a, b) => a.courseCode.localeCompare(b.courseCode));
            }

            // 把对象转换成数组
            const sortedCoursesArray = [];
            for (const key in sortedCourses) {
                sortedCoursesArray.push({
                    grade: key,
                    courses: sortedCourses[key]
                });
            }

            sortedCoursesArray.sort((a, b) => b.grade.localeCompare(a.grade));

            // console.log(sortedCoursesArray);

            return sortedCoursesArray;
        },
    }
});

export default store;
