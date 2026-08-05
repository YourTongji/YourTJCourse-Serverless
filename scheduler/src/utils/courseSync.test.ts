import { describe, it, expect } from 'vitest'
import { detectCourseChanges, applyCourseSync } from './courseSync'
import { insertOccupied } from './courseManipulate'
import { CourseChangeType } from './myInterface'
import type {
  arrangementInfolet,
  courseDetaillet,
  occupyCell,
  stagedCourse
} from './myInterface'

// ---- fixture helpers ----

function mkArrangement(day = 1, times = [1, 2], weeks = [1]): arrangementInfolet {
  return {
    arrangementText: `星期${day} 第${times[0]}-${times[times.length - 1]}节 [${weeks.join(',')}周]`,
    occupyDay: day,
    occupyTime: times,
    occupyWeek: weeks,
    occupyRoom: 'A101',
    teacherAndCode: '张三(10001)'
  }
}

function mkClass(code: string, arrangement: arrangementInfolet): courseDetaillet {
  return {
    arrangementInfo: [arrangement],
    campus: '四平路',
    code,
    status: 0,
    teachers: [{ teacherName: '张三', teacherCode: '10001' }],
    teachingLanguage: '中文'
  }
}

/** 构造一门课：courseCode 如 '100001'，classCodes 如 ['10000101', '10000102'] */
function mkCourse(
  courseCode: string,
  classes: Array<{ code: string; arrangement: arrangementInfolet }>
): stagedCourse {
  return {
    courseCode,
    courseName: `课程${courseCode}(${courseCode})`,
    courseNameReserved: `课程${courseCode}`,
    credit: 2,
    courseType: '选',
    teacher: [{ teacherName: '张三', teacherCode: '10001' }],
    status: 0,
    courseDetail: classes.map(c => mkClass(c.code, c.arrangement))
  }
}

function emptyOccupied(): occupyCell[][][] {
  return Array(12).fill(null).map(() => Array(7).fill(undefined).map(() => []))
}

// ---- tests ----

describe('detectCourseChanges + applyCourseSync', () => {
  it('整课关课：标记 Closed 并从备选列表移除（现有正确行为）', () => {
    const oldCourse = mkCourse('100001', [{ code: '10000101', arrangement: mkArrangement() }])
    const { changes } = detectCourseChanges([oldCourse], [], ['10000101'], emptyOccupied())

    expect(changes).toHaveLength(1)
    expect(changes[0].changeType).toBe(CourseChangeType.Closed)

    const { newStagedCourses, newSelectedCodes } = applyCourseSync(changes, [oldCourse], ['10000101'], [])
    expect(newStagedCourses).toHaveLength(0)
    expect(newSelectedCodes).toHaveLength(0)
  })

  it('所选班级关闭但课程仍有其他班级：不应按整课关课处理，课程应保留并重置为未选（N16）', () => {
    const oldCourse = mkCourse('100001', [
      { code: '10000101', arrangement: mkArrangement(1, [1, 2]) },
      { code: '10000102', arrangement: mkArrangement(2, [1, 2]) }
    ])
    // 最新数据中 01 班被关闭，02 班仍在
    const newCourse = mkCourse('100001', [
      { code: '10000102', arrangement: mkArrangement(2, [1, 2]) }
    ])

    const { changes } = detectCourseChanges([oldCourse], [newCourse], ['10000101'], emptyOccupied())

    expect(changes).toHaveLength(1)
    // 课程仍然存在，应归类为班级关闭而非整课关课
    expect(changes[0].changeType).toBe(CourseChangeType.ClassClosed)

    // 模拟 fetchLatestCourseInfo 的状态继承：新数据中残留的 detail 级已选状态
    newCourse.courseDetail[0].status = 2

    const { newStagedCourses, newSelectedCodes } = applyCourseSync(
      changes,
      [oldCourse],
      ['10000101'],
      [newCourse]
    )
    // 课程应保留在备选列表，课程级与全部班级级状态均重置为未选，已关闭班级的选中代码移除
    expect(newStagedCourses.map(c => c.courseCode)).toContain('100001')
    expect(newStagedCourses[0].status).toBe(0)
    expect(newStagedCourses[0].courseDetail.every(d => d.status === 0)).toBe(true)
    expect(newSelectedCodes).not.toContain('10000101')
  })

  it('时间变更后与已选课程冲突：标记 ConflictAfterUpdate，课程保留并重置为未选（现有先例）', () => {
    const oldA = mkCourse('200001', [{ code: '20000101', arrangement: mkArrangement(1, [1, 2]) }])
    const courseB = mkCourse('200002', [{ code: '20000201', arrangement: mkArrangement(1, [1, 2]) }])
    // A 的 01 班时间从周一1-2节改为周一2-3节，与 B（周一1-2节）在第2节冲突
    const newA = mkCourse('200001', [{ code: '20000101', arrangement: mkArrangement(1, [2, 3]) }])

    const occupied = emptyOccupied()
    insertOccupied(occupied, [mkArrangement(1, [1, 2])], '20000101', '课程200001')
    insertOccupied(occupied, [mkArrangement(1, [1, 2])], '20000201', '课程200002')

    const { changes } = detectCourseChanges([oldA, courseB], [newA, courseB], ['20000101', '20000201'], occupied)

    const changeA = changes.find(c => c.courseCode === '200001')
    expect(changeA?.changeType).toBe(CourseChangeType.ConflictAfterUpdate)

    const { newStagedCourses, newSelectedCodes } = applyCourseSync(
      changes,
      [oldA, courseB],
      ['20000101', '20000201'],
      [newA, courseB]
    )
    expect(newStagedCourses.map(c => c.courseCode)).toContain('200001')
    expect(newStagedCourses.find(c => c.courseCode === '200001')?.status).toBe(0)
    expect(newSelectedCodes).not.toContain('20000101')
    expect(newSelectedCodes).toContain('20000201')
  })

  it('信息变更但无冲突：课程保留且保持选中状态', () => {
    const oldCourse = mkCourse('300001', [{ code: '30000101', arrangement: mkArrangement(1, [1, 2]) }])
    // 时间从周一挪到周二，无其他课程占用
    const newCourse = mkCourse('300001', [{ code: '30000101', arrangement: mkArrangement(2, [1, 2]) }])

    const occupied = emptyOccupied()
    insertOccupied(occupied, [mkArrangement(1, [1, 2])], '30000101', '课程300001')

    const { changes } = detectCourseChanges([oldCourse], [newCourse], ['30000101'], occupied)

    expect(changes).toHaveLength(1)
    expect(changes[0].changeType).toBe(CourseChangeType.InfoChanged)

    const { newStagedCourses, newSelectedCodes } = applyCourseSync(
      changes,
      [oldCourse],
      ['30000101'],
      [newCourse]
    )
    expect(newStagedCourses).toHaveLength(1)
    expect(newSelectedCodes).toContain('30000101')
  })

  it('无变更：课程与选中状态原样保留', () => {
    const oldCourse = mkCourse('400001', [{ code: '40000101', arrangement: mkArrangement() }])
    const newCourse = mkCourse('400001', [{ code: '40000101', arrangement: mkArrangement() }])

    const { changes, hasChanges } = detectCourseChanges([oldCourse], [newCourse], ['40000101'], emptyOccupied())

    expect(hasChanges).toBe(false)
    expect(changes).toHaveLength(0)

    const { newStagedCourses, newSelectedCodes } = applyCourseSync(
      changes,
      [oldCourse],
      ['40000101'],
      [newCourse]
    )
    expect(newStagedCourses).toHaveLength(1)
    expect(newSelectedCodes).toContain('40000101')
  })
})
