// 课程同步相关的工具函数

import type { 
    stagedCourse, 
    CourseChangeInfo, 
    CourseSyncResult,
    occupyCell,
    courseDetaillet,
    arrangementInfolet,
    teacherlet
} from "./myInterface";
import { CourseChangeType } from "./myInterface";
import { canAddCourse, deleteOccupied, insertOccupied } from "./courseManipulate";
import axios from "axios";

// 比较两个课程是否相同（深度比较）
function isCourseSame(oldCourse: stagedCourse, newCourse: stagedCourse): boolean {
    // 比较基本信息
    if (oldCourse.courseName !== newCourse.courseName ||
        oldCourse.credit !== newCourse.credit ||
        oldCourse.courseType !== newCourse.courseType) {
        return false;
    }

    // 比较教师信息
    if (oldCourse.teacher.length !== newCourse.teacher.length) {
        return false;
    }
    const oldTeachers = oldCourse.teacher.map(t => `${t.teacherName}(${t.teacherCode})`).sort();
    const newTeachers = newCourse.teacher.map(t => `${t.teacherName}(${t.teacherCode})`).sort();
    if (JSON.stringify(oldTeachers) !== JSON.stringify(newTeachers)) {
        return false;
    }

    // 比较课程详情
    if (oldCourse.courseDetail.length !== newCourse.courseDetail.length) {
        return false;
    }

    // 深度比较courseDetail（逐个班级比较）
    for (const oldDetail of oldCourse.courseDetail) {
        const newDetail = newCourse.courseDetail.find(d => d.code === oldDetail.code);
        if (!newDetail) return false;
        
        if (oldDetail.campus !== newDetail.campus ||
            oldDetail.teachingLanguage !== newDetail.teachingLanguage) {
            return false;
        }
        
        if (!areArrangementsSame(oldDetail.arrangementInfo, newDetail.arrangementInfo)) {
            return false;
        }
        
        // 比较 isExclusive（如果存在）
        if ('isExclusive' in oldDetail && 'isExclusive' in newDetail) {
            const oldExcl = oldDetail.isExclusive as boolean | number | undefined;
            const newExcl = (newDetail as unknown as { isExclusive?: boolean | number }).isExclusive;
            
            // 统一转换为 boolean 进行比较
            const oldExclBool = oldExcl === true || oldExcl === 1;
            const newExclBool = newExcl === true || newExcl === 1;
            
            if (oldExclBool !== newExclBool) {
                return false;
            }
        }
    }
    
    return true;
}

// 比较两个排课信息数组是否相同
function areArrangementsSame(arr1: arrangementInfolet[], arr2: arrangementInfolet[]): boolean {
    if (arr1.length !== arr2.length) return false;
    
    // 创建排序后的数组进行比较
    const sort = (arr: arrangementInfolet[]) => arr.slice().sort((a, b) => {
        if (a.occupyDay !== b.occupyDay) return a.occupyDay - b.occupyDay;
        if (a.occupyTime[0] !== b.occupyTime[0]) return a.occupyTime[0] - b.occupyTime[0];
        return 0;
    });
    
    const sorted1 = sort(arr1);
    const sorted2 = sort(arr2);
    
    // 逐个比较排课项
    for (let i = 0; i < sorted1.length; i++) {
        const a = sorted1[i];
        const b = sorted2[i];
        
        if (a.occupyDay !== b.occupyDay ||
            a.occupyRoom !== b.occupyRoom ||
            JSON.stringify(a.occupyTime) !== JSON.stringify(b.occupyTime) ||
            JSON.stringify(a.occupyWeek) !== JSON.stringify(b.occupyWeek)) {
            return false;
        }
    }
    
    return true;
}

// 生成排课变更的详细描述
function describeArrangementChanges(oldArr: arrangementInfolet[], newArr: arrangementInfolet[]): string {
    const changes: string[] = [];
    
    if (oldArr.length !== newArr.length) {
        changes.push(`排课数量: ${oldArr.length} → ${newArr.length}`);
    }
    
    // 简化描述，只说明有变更
    const oldDesc = oldArr.map(a => `${getDayName(a.occupyDay)}第${a.occupyTime.join(',')}节`).join(', ');
    const newDesc = newArr.map(a => `${getDayName(a.occupyDay)}第${a.occupyTime.join(',')}节`).join(', ');
    
    if (oldDesc !== newDesc) {
        changes.push(`时间: ${oldDesc} → ${newDesc}`);
    }
    
    return changes.join('; ') || '上课安排已变更';
}

// 获取星期名称
function getDayName(day: number): string {
    const days = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return days[day] || `周${day}`;
}

// 生成课程变更的详细描述
function generateChangeDetails(oldCourse: stagedCourse, newCourse: stagedCourse): string {
    const changes: string[] = [];

    if (oldCourse.courseName !== newCourse.courseName) {
        changes.push(`课程名称: ${oldCourse.courseName} → ${newCourse.courseName}`);
    }

    if (oldCourse.credit !== newCourse.credit) {
        changes.push(`学分: ${oldCourse.credit} → ${newCourse.credit}`);
    }

    if (oldCourse.courseType !== newCourse.courseType) {
        changes.push(`课程类型: ${oldCourse.courseType} → ${newCourse.courseType}`);
    }

    // 检查教师变更
    const oldTeachers = oldCourse.teacher.map(t => t.teacherName).sort().join(', ');
    const newTeachers = newCourse.teacher.map(t => t.teacherName).sort().join(', ');
    if (oldTeachers !== newTeachers) {
        changes.push(`授课教师: ${oldTeachers} → ${newTeachers}`);
    }

    // 检查排课信息变更（简化检查）
    if (oldCourse.courseDetail.length !== newCourse.courseDetail.length) {
        changes.push('可选班级数量已变更');
    } else {
        // 简单检查是否有任何班级的排课信息变化
        let hasArrangementChange = false;
        for (const oldDetail of oldCourse.courseDetail) {
            const newDetail = newCourse.courseDetail.find(d => d.code === oldDetail.code);
            if (newDetail && !areArrangementsSame(oldDetail.arrangementInfo, newDetail.arrangementInfo)) {
                hasArrangementChange = true;
                break;
            }
        }
        if (hasArrangementChange) {
            changes.push('上课时间或地点已变更');
        }
    }

    return changes.join('; ');
}

// 专业信息接口
interface MajorInfo {
    grade: number;
    code: string;
}

// 从后端获取最新课程信息
export async function fetchLatestCourseInfo(
    calendarId: number,
    oldStagedCourses: stagedCourse[],
    selectedCodes: string[],
    majorInfo?: MajorInfo  // 可选的专业信息
): Promise<stagedCourse[]> {
    try {
        // 根据 courseDetail 中是否有 isExclusive 字段，将课程分为两类
        const majorCourseCodes: string[] = [];
        const otherCourseCodes: string[] = [];

        oldStagedCourses.forEach(course => {
            // 检查该课程的 courseDetail 中是否有 isExclusive 字段
            const hasExclusive = course.courseDetail.some(d => 'isExclusive' in d);
            if (hasExclusive) {
                majorCourseCodes.push(course.courseCode);
            } else {
                otherCourseCodes.push(course.courseCode);
            }
        });

        // 分类完成
        
        // 构建请求参数
        const payload: {
            calendarId: number;
            majorCourseCodes: string[];
            otherCourseCodes: string[];
            majorInfo?: { grade: number; code: string };
        } = {
            calendarId,
            majorCourseCodes,
            otherCourseCodes
        };
        
        // 如果有专业课程且有专业信息，添加 majorInfo
        if (majorCourseCodes.length > 0) {
            if (!majorInfo) {
                throw new Error('需要专业课程但未提供专业信息');
            }
            payload.majorInfo = majorInfo;
        }
        
        const response = await axios.post('/api/getLatestCourseInfo', payload);

        if (response.data.code === 200) {
            const apiData = response.data.data; // 这是一个对象 { courseCode: [courseDetails] }
            const result: stagedCourse[] = [];
            
            // 合并两个课程代码列表
            const allCourseCodes = [...majorCourseCodes, ...otherCourseCodes];

            // 遍历所有请求的课程代码
            for (const courseCode of allCourseCodes) {
                const courseDetails = apiData[courseCode] || [];
                
                if (courseDetails.length === 0) {
                    // 课程已关课或无排课信息，不添加到结果中
                    continue;
                }

                // 从旧的 stagedCourses 中获取课程的元信息
                const oldCourse = oldStagedCourses.find(c => c.courseCode === courseCode);
                
                if (!oldCourse) {
                    // 理论上不应该发生，但为了安全起见
                    console.warn(`课程 ${courseCode} 在旧数据中不存在`);
                    continue;
                }

                // 查找用户选择的班级（如果有的话）
                const selectedClass = selectedCodes.find(code => code.startsWith(courseCode));
                const selectedClassDetail = selectedClass 
                    ? courseDetails.find((d: { code: string }) => d.code === selectedClass) 
                    : null;

                // teacher 字段存储用户选择的班级的教师
                // 如果用户没有选择班级，或者选择的班级不存在，则保留原 teacher
                let teacher = oldCourse.teacher;
                if (selectedClassDetail) {
                    teacher = selectedClassDetail.teachers || [];
                }

                // 构建 stagedCourse 格式
                const stagedCourse: stagedCourse = {
                    courseCode: courseCode,
                    courseName: oldCourse.courseName, // 保留原课程名称
                    courseNameReserved: oldCourse.courseNameReserved,
                    credit: oldCourse.credit, // 保留原学分
                    courseType: oldCourse.courseType, // 保留原课程类型
                    teacher: teacher,
                    status: oldCourse.status,
                    courseDetail: courseDetails.map((detail: {
                        code: string;
                        campusI18n: string;
                        teachers?: teacherlet[];
                        teachingLanguageI18n: string;
                        arrangementInfo?: arrangementInfolet[];
                        isExclusive?: boolean | number;
                    }) => {
                        // 为每个 arrangement 添加 teacherAndCode
                        const teacherAndCode = (detail.teachers || [])
                            .map((t: teacherlet) => `${t.teacherName}(${t.teacherCode})`)
                            .join(', ');
                        
                        const arrangementInfo = (detail.arrangementInfo || []).map((arr: arrangementInfolet) => ({
                            ...arr,
                            teacherAndCode
                        }));

                        const result: courseDetaillet & { isExclusive?: boolean | number } = {
                            code: detail.code,
                            campus: detail.campusI18n,
                            teachers: detail.teachers || [],
                            teachingLanguage: detail.teachingLanguageI18n,
                            arrangementInfo,
                            status: oldCourse.courseDetail.find((d: courseDetaillet) => d.code === detail.code)?.status || 0
                        };
                        
                        // 如果 API 返回了 isExclusive 字段，添加到结果中
                        if ('isExclusive' in detail) {
                            result.isExclusive = detail.isExclusive ? true : false;
                        }
                        
                        return result;
                    })
                };

                result.push(stagedCourse);
            }

            return result;
        } else {
            throw new Error(response.data.msg || '获取课程信息失败');
        }
    } catch (error) {
        console.error('获取最新课程信息失败:', error);
        throw error;
    }
}

// 比较单个班级的详细信息，返回变更描述数组
function compareClassDetails(
    oldCourse: stagedCourse,
    oldClassDetail: courseDetaillet,
    newClassDetail: courseDetaillet
): { details: string[], hasArrangementChange: boolean, newArrangementInfo?: arrangementInfolet[] } {
    const classDetails: string[] = [];
    let hasArrangementChange = false;
    let newArrangementInfo = undefined;
    
    // 比较教师
    const oldTeachers = (oldCourse.teacher || [])
        .map(t => `${t.teacherName}(${t.teacherCode})`)
        .sort()
        .join(', ');
    const newTeachers = (newClassDetail.teachers || [])
        .map(t => `${t.teacherName}(${t.teacherCode})`)
        .sort()
        .join(', ');
    if (oldTeachers !== newTeachers) {
        classDetails.push(`授课教师: ${oldTeachers} → ${newTeachers}`);
    }
    
    // 比较校区
    if (oldClassDetail.campus !== newClassDetail.campus) {
        classDetails.push(`校区: ${oldClassDetail.campus} → ${newClassDetail.campus}`);
    }
    
    // 比较排课信息
    if (!areArrangementsSame(oldClassDetail.arrangementInfo, newClassDetail.arrangementInfo)) {
        const changeDesc = describeArrangementChanges(oldClassDetail.arrangementInfo, newClassDetail.arrangementInfo);
        classDetails.push(changeDesc);
        hasArrangementChange = true;
        newArrangementInfo = newClassDetail.arrangementInfo;
    }
    
    // 比较 isExclusive
    if ('isExclusive' in oldClassDetail && 'isExclusive' in newClassDetail) {
        const oldExcl = oldClassDetail.isExclusive as boolean | number | undefined;
        const newExcl = (newClassDetail as unknown as { isExclusive?: boolean | number }).isExclusive;
        
        const oldExclBool = oldExcl === true || oldExcl === 1;
        const newExclBool = newExcl === true || newExcl === 1;
        
        if (oldExclBool !== newExclBool) {
            const oldExclText = oldExclBool ? '在专业课表' : '不在专业课表';
            const newExclText = newExclBool ? '在专业课表' : '不在专业课表';
            classDetails.push(`专业课表状态: ${oldExclText} → ${newExclText}`);
        }
    }
    
    return { details: classDetails, hasArrangementChange, newArrangementInfo };
}

// 检测变更后的课程之间的相互冲突
function detectMutualConflicts(
    changedCourses: Map<string, { arrangementInfo: arrangementInfolet[], courseName: string }>,
    occupied: occupyCell[][][]
): Map<string, string> {
    // 返回 Map<classCode, conflictWithClassCode>
    const conflicts = new Map<string, string>();
    
    // 复制 occupied，结构是 [time][day][] 三维数组
    const tempOccupied: occupyCell[][][] = occupied.map(timeSlot => 
        timeSlot.map(daySlot => [...daySlot])
    );
    
    // 移除所有有时间变更的课程
    changedCourses.forEach((_, classCode) => {
        deleteOccupied(tempOccupied, classCode);
    });
    
    // 按顺序添加变更后的课程，检测冲突
    const processedCourses: string[] = [];
    changedCourses.forEach((courseInfo, classCode) => {
        const checkResult = canAddCourse(courseInfo.arrangementInfo, tempOccupied, classCode);
        
        if (!checkResult.canAdd) {
            // 发生冲突
            const conflictCode = checkResult.collideCourse?.split(' ')[0] || '';
            conflicts.set(classCode, conflictCode);
            
            // 检查是否与同样变更的课程冲突（双向标记）
            if (conflictCode && processedCourses.includes(conflictCode)) {
                // 冲突的课程也在变更列表中，标记为互相冲突
                conflicts.set(conflictCode, classCode);
            }
        } else {
            // 没有冲突，添加到 tempOccupied
            insertOccupied(tempOccupied, courseInfo.arrangementInfo, classCode, courseInfo.courseName);
            processedCourses.push(classCode);
        }
    });
    
    return conflicts;
}

// 检测课程变更
export function detectCourseChanges(
    oldCourses: stagedCourse[],
    newCourses: stagedCourse[],
    selectedCodes: string[],
    occupied: occupyCell[][][]
): CourseSyncResult {
    const changes: CourseChangeInfo[] = [];
    
    // 创建新课程的映射
    const newCourseMap = new Map<string, stagedCourse>();
    newCourses.forEach(course => {
        newCourseMap.set(course.courseCode, course);
    });

    // 记录有时间变更的课程 Map<classCode, { arrangementInfo, courseName }>
    const changedCourseArrangements = new Map<string, { arrangementInfo: arrangementInfolet[], courseName: string }>();

    // 第一阶段：收集所有变更信息
    oldCourses.forEach(oldCourse => {
        const newCourse = newCourseMap.get(oldCourse.courseCode);

        if (!newCourse) {
            // 课程已关课
            changes.push({
                courseCode: oldCourse.courseCode,
                courseName: oldCourse.courseName,
                changeType: CourseChangeType.Closed
            });
        } else {
            // 检查是否在已选课程中
            const selectedClass = selectedCodes.find(code => code.startsWith(oldCourse.courseCode));
            
            if (selectedClass) {
                // 用户选择了具体班级
                const oldClassDetail = oldCourse.courseDetail.find(d => d.code === selectedClass);
                const newClassDetail = newCourse.courseDetail.find(d => d.code === selectedClass);
                
                if (!newClassDetail) {
                    // 选择的班级已关闭
                    changes.push({
                        courseCode: oldCourse.courseCode,
                        courseName: oldCourse.courseName,
                        changeType: CourseChangeType.Closed,
                        details: `班级 ${selectedClass} 已关闭`
                    });
                } else if (oldClassDetail) {
                    // 比较班级详细信息
                    const comparison = compareClassDetails(oldCourse, oldClassDetail, newClassDetail);
                    
                    if (comparison.details.length > 0) {
                        // 有变更
                        changes.push({
                            courseCode: oldCourse.courseCode,
                            courseName: oldCourse.courseName,
                            changeType: CourseChangeType.InfoChanged,
                            details: comparison.details.join('; ')
                        });
                        
                        // 如果有时间变更，记录下来
                        if (comparison.hasArrangementChange && comparison.newArrangementInfo) {
                            changedCourseArrangements.set(selectedClass, {
                                arrangementInfo: comparison.newArrangementInfo,
                                courseName: oldCourse.courseName
                            });
                        }
                    }
                }
            } else {
                // 未选课程，比较整体信息
                if (!isCourseSame(oldCourse, newCourse)) {
                    const details = generateChangeDetails(oldCourse, newCourse);
                    changes.push({
                        courseCode: oldCourse.courseCode,
                        courseName: oldCourse.courseName,
                        changeType: CourseChangeType.InfoChanged,
                        details
                    });
                }
            }
        }
    });

    // 第二阶段：检测有时间变更的课程之间的冲突
    if (changedCourseArrangements.size > 0) {
        const conflicts = detectMutualConflicts(changedCourseArrangements, occupied);
        
        // 更新变更类型为冲突
        conflicts.forEach((conflictWithCode, classCode) => {
            const courseCode = classCode.substring(0, classCode.length - 2);
            const change = changes.find(c => c.courseCode === courseCode);
            
            if (change) {
                change.changeType = CourseChangeType.ConflictAfterUpdate;
                
                // 获取冲突课程的名称
                const conflictCourseCode = conflictWithCode.substring(0, conflictWithCode.length - 2);
                const conflictCourse = oldCourses.find(c => c.courseCode === conflictCourseCode);
                const conflictCourseName = conflictCourse ? conflictCourse.courseName : conflictCourseCode;
                change.conflictWith = conflictCourseName;
                
                // 检查是否与同样变更的课程冲突
                if (changedCourseArrangements.has(conflictWithCode)) {
                    const conflictChange = changes.find(c => c.courseCode === conflictCourseCode);
                    if (conflictChange) {
                        change.details = `${change.details}\n 与同样变更的课程 ${conflictChange.courseName} 冲突`;
                    }
                }
            }
        });
    }

    return {
        changes,
        hasChanges: changes.length > 0
    };
}

// 应用课程同步（更新缓存）
export function applyCourseSync(
    changes: CourseChangeInfo[],
    oldStagedCourses: stagedCourse[],
    oldSelectedCodes: string[],
    newCourses: stagedCourse[]
): {
    newStagedCourses: stagedCourse[],
    newSelectedCodes: string[]
} {
    const newCourseMap = new Map<string, stagedCourse>();
    newCourses.forEach(course => {
        newCourseMap.set(course.courseCode, course);
    });

    const newStagedCourses: stagedCourse[] = [];
    const newSelectedCodes: string[] = [];

    // 处理每个旧课程
    oldStagedCourses.forEach(oldCourse => {
        const change = changes.find(c => c.courseCode === oldCourse.courseCode);
        
        if (!change) {
            // 没有变更，保持原样
            newStagedCourses.push(oldCourse);
        } else if (change.changeType === CourseChangeType.Closed) {
            // 课程已关课，不添加到新列表中（即删除）
            // 不需要做任何事
        } else {
            // 课程信息有变更，使用新的课程信息
            const newCourse = newCourseMap.get(oldCourse.courseCode);
            if (newCourse) {
                // 如果是冲突课程，需要将状态改为未选（status=0）
                if (change.changeType === CourseChangeType.ConflictAfterUpdate) {
                    newCourse.status = 0;
                    // 找到对应的 courseDetail 并设置为未选状态
                    const selectedCode = oldSelectedCodes.find(code => code.startsWith(oldCourse.courseCode));
                    if (selectedCode) {
                        const detail = newCourse.courseDetail.find(d => d.code === selectedCode);
                        if (detail) {
                            detail.status = 0;
                        }
                    }
                }
                newStagedCourses.push(newCourse);
            }
        }
    });

    // 处理已选课程
    oldSelectedCodes.forEach(selectedCode => {
        const courseCode = selectedCode.substring(0, selectedCode.length - 2);
        const change = changes.find(c => c.courseCode === courseCode);

        if (!change) {
            // 没有变更，保持原样
            newSelectedCodes.push(selectedCode);
        } else if (change.changeType === CourseChangeType.Closed) {
            // 课程已关课，不添加（即删除）
        } else if (change.changeType === CourseChangeType.ConflictAfterUpdate) {
            // 发生冲突，不添加到已选课程（会在stagedCourses中）
        } else {
            // 信息变更但无冲突，保持选中状态
            // 但需要检查班级代码是否还存在
            const newCourse = newCourseMap.get(courseCode);
            if (newCourse) {
                const classExists = newCourse.courseDetail.some(d => d.code === selectedCode);
                if (classExists) {
                    newSelectedCodes.push(selectedCode);
                } else {
                    // 原来的班级不存在了，使用第一个班级
                    if (newCourse.courseDetail.length > 0) {
                        newSelectedCodes.push(newCourse.courseDetail[0].code);
                    }
                }
            }
        }
    });

    return {
        newStagedCourses,
        newSelectedCodes
    };
}


