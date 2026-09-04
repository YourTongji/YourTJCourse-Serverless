import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCourseMiniSearchJson,
  buildCourseSearchDocuments,
  type CourseSearchSource
} from '../src/helpers/course-search-build'
import { loadCourseSearchIndexJsonAsync } from '../src/helpers/course-mini-search'

const source: CourseSearchSource = {
  courseRows: [
    { id: 1, code: 'C1', name: '普通数学', department: '基础', is_icu: 0, is_legacy: 0, teacher_name: '张老师', teacher_tid: 'T1' },
    { id: 2, code: 'C2', name: 'ICU 数学', department: '基础', is_icu: 1, is_legacy: 0, teacher_name: '李老师', teacher_tid: 'T2' }
  ],
  aliasRows: [{ course_id: 1, alias: '高数' }],
  semesterRows: [{ course_id: 1, semester_names: '122||121' }],
  pkRows: [{ courseCode: 'C1', courseName: '普通数学', teachingClassName: '数学一班', teacherCode: 'T1', teacherName: '张老师' }]
}

test('offline builder preserves ICU filtering and PK teacher documents', () => {
  const normal = buildCourseSearchDocuments(source, false)
  const all = buildCourseSearchDocuments(source, true)

  assert.equal(normal.some((item) => item.courseId === 2), false)
  assert.equal(all.some((item) => item.courseId === 2), true)
  assert.equal(normal.some((item) => item.id.startsWith('pk:') && item.teacherName === '张老师'), true)
  assert.equal(normal.find((item) => item.id === 'course:1')?.semesters, '122 121')
  assert.equal(normal.find((item) => item.id === 'course:1')?.aliases, '高数')
})

test('offline builder output round-trips through the online loader', async () => {
  const { json, docCount } = await buildCourseMiniSearchJson(source, false)
  const search = await loadCourseSearchIndexJsonAsync(json)
  assert.equal(docCount, 2)
  assert.equal(search.search('张老师').some((item) => item.id.startsWith('pk:')), true)
})
