import MiniSearch from 'minisearch'
import { parseSemesterNames, uniqueText } from './db'
import {
  miniSearchOptions,
  type MiniCourseDocument
} from './course-mini-search'

export type CourseSearchSource = {
  courseRows: any[]
  aliasRows: any[]
  semesterRows: any[]
  pkRows: any[]
}

export async function loadCourseSearchSource(db: D1Database): Promise<CourseSearchSource> {
  const [courses, aliases, semesters, pk] = await Promise.all([
    db.prepare(
      `SELECT c.id, c.code, c.name, c.department, c.is_icu, c.is_legacy,
              t.name AS teacher_name, t.tid AS teacher_tid
       FROM courses c
       LEFT JOIN teachers t ON t.id = c.teacher_id
       WHERE NOT (c.is_legacy = 1 AND c.code LIKE '%AUTO%')
       ORDER BY c.id`
    ).all<any>(),
    db.prepare(
      `SELECT course_id, alias
       FROM course_aliases
       WHERE system = 'onesystem'
       ORDER BY course_id`
    ).all<any>(),
    db.prepare(
      `SELECT course_id, semester_names
       FROM course_semesters
       ORDER BY course_id`
    ).all<any>(),
    db.prepare(
      `SELECT cd.courseCode, cd.code, cd.newCourseCode, cd.newCode,
              cd.courseName, cd.name AS teachingClassName,
              t.teacherCode, t.teacherName
       FROM coursedetail cd
       LEFT JOIN teacher t ON t.teachingClassId = cd.id
       ORDER BY cd.courseCode, cd.courseName, t.teacherName`
    ).all<any>()
  ])

  return {
    courseRows: courses.results || [],
    aliasRows: aliases.results || [],
    semesterRows: semesters.results || [],
    pkRows: pk.results || []
  }
}

export function buildCourseSearchDocuments(source: CourseSearchSource, showIcu: boolean): MiniCourseDocument[] {
  const documents: MiniCourseDocument[] = []
  const semesterMap = new Map<number, string>()
  const aliasMap = new Map<number, string[]>()
  const codeToCourseIds = new Map<string, Set<number>>()

  for (const row of source.semesterRows) {
    semesterMap.set(Number(row.course_id), parseSemesterNames(row.semester_names).join(' '))
  }

  for (const row of source.aliasRows) {
    const courseId = Number(row.course_id)
    if (!Number.isFinite(courseId)) continue
    if (!aliasMap.has(courseId)) aliasMap.set(courseId, [])
    aliasMap.get(courseId)!.push(String(row.alias || '').trim())
  }

  const filteredCourses = source.courseRows.filter((row) => showIcu || Number(row.is_icu || 0) === 0)
  for (const row of filteredCourses) {
    const courseId = Number(row.id)
    if (!Number.isFinite(courseId)) continue
    const aliases = uniqueText(aliasMap.get(courseId) || [])
    const codes = uniqueText([row.code, ...aliases])
    for (const code of codes) {
      if (!codeToCourseIds.has(code)) codeToCourseIds.set(code, new Set<number>())
      codeToCourseIds.get(code)!.add(courseId)
    }

    documents.push({
      id: `course:${courseId}`,
      courseId,
      code: String(row.code || ''),
      name: String(row.name || ''),
      teacherName: String(row.teacher_name || ''),
      teacherCode: String(row.teacher_tid || ''),
      department: String(row.department || ''),
      aliases: aliases.join(' '),
      semesters: semesterMap.get(courseId) || ''
    })
  }

  const pkDocuments = new Map<string, MiniCourseDocument>()
  for (const row of source.pkRows) {
    const teacherName = String(row.teacherName || '').trim()
    const teacherCode = String(row.teacherCode || '').trim()
    if (!teacherName && !teacherCode) continue

    const rowCodes = uniqueText([row.courseCode, row.code, row.newCourseCode, row.newCode])
    const courseIds = new Set<number>()
    for (const code of rowCodes) {
      for (const courseId of codeToCourseIds.get(code) || []) courseIds.add(courseId)
    }

    for (const courseId of courseIds) {
      const name = uniqueText([row.courseName, row.teachingClassName]).join(' ')
      const key = `${courseId}|${rowCodes.join(' ')}|${name}|${teacherName}|${teacherCode}`
      if (pkDocuments.has(key)) continue
      pkDocuments.set(key, {
        id: `pk:${courseId}:${pkDocuments.size + 1}`,
        courseId,
        code: rowCodes.join(' '),
        name,
        teacherName,
        teacherCode,
        department: '',
        aliases: '',
        semesters: ''
      })
    }
  }

  documents.push(...pkDocuments.values())
  return documents
}

export async function buildCourseMiniSearchJson(source: CourseSearchSource, showIcu: boolean) {
  const documents = buildCourseSearchDocuments(source, showIcu)
  const search = new MiniSearch<MiniCourseDocument>(miniSearchOptions)
  await search.addAllAsync(documents, { chunkSize: 1_000 })
  return {
    json: JSON.stringify(search.toJSON()),
    docCount: documents.length
  }
}
