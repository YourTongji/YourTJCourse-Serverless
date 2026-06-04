import { Hono } from 'hono'
import { arrangementTextToObj, splitEndline } from './utils'

type PkBindings = {
  DB: D1Database
}

const MAX_SQL_VARS = 80
const OPTIONAL_LABEL_NAMES = [
  '通识选修课',
  '人文经典与审美素养',
  '工程能力与创新思维',
  '社会发展与国际视野',
  '科学探索与生命关怀',
]
const CROSS_DISCIPLINE_LABEL_NAMES = [
  '个性化课程',
  '个性课程',
  '任选课程',
  '专业选修课',
  '专业课选修',
  '专业特色模块',
  '领域基础课',
]
const PK_AUX_SCHEMA_VERSION = '20260605-pk-query-opt-v2'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function jsonOk(data: any) {
  return { code: 200, msg: '查询成功', data }
}

function jsonErr(code: number, msg: string, data?: any) {
  return { code, msg, data: data ?? {} }
}

function normalizeText(value: unknown) {
  return String(value || '').trim()
}

function uniqueText(values: unknown[]) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function isCrossDisciplineLabel(labelName: string) {
  return CROSS_DISCIPLINE_LABEL_NAMES.includes(normalizeText(labelName))
}

async function getTeachers(db: D1Database, teachingClassId: number) {
  const { results } = await db
    .prepare('SELECT teacherCode, teacherName, arrangeInfoText FROM teacher WHERE teachingClassId = ?')
    .bind(teachingClassId)
    .all<any>()
  return results || []
}

let pkAuxInitPromise: Promise<void> | null = null
let pkAuxReadyCache: { value: boolean; expiresAt: number } | null = null

function getPkTimeSlotsBySection(section: number) {
  if (section === 1) return [1, 2]
  if (section === 2) return [3, 4]
  if (section === 3) return [5, 6]
  if (section === 4) return [7, 8]
  if (section === 5) return [9]
  if (section === 6) return [10]
  return []
}

async function ensurePkAuxiliaryTables(db: D1Database) {
  if (!pkAuxInitPromise) {
    pkAuxInitPromise = (async () => {
      const row = await db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .bind('pk_aux_schema_version')
        .first<{ value: string }>()

      if (row?.value !== PK_AUX_SCHEMA_VERSION) {
        await db.prepare('DROP TABLE IF EXISTS teacher_timeslots').run()
      }

      await db.prepare(
        `CREATE TABLE IF NOT EXISTS teacher_timeslots (
          calendar_id INTEGER NOT NULL,
          teaching_class_id INTEGER NOT NULL,
          occupy_day INTEGER NOT NULL,
          occupy_section INTEGER NOT NULL,
          teacher_code TEXT DEFAULT '',
          teacher_name TEXT DEFAULT '',
          PRIMARY KEY (calendar_id, teaching_class_id, occupy_day, occupy_section, teacher_code, teacher_name)
        )`
      ).run()
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_timeslots_slot ON teacher_timeslots(calendar_id, occupy_day, occupy_section)').run()
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_timeslots_class ON teacher_timeslots(teaching_class_id)').run()
      if (row?.value === PK_AUX_SCHEMA_VERSION) {
        pkAuxReadyCache = { value: true, expiresAt: Date.now() + 30_000 }
        return
      }

      await db.prepare('DELETE FROM teacher_timeslots').run()
      const teacherRows = await db
        .prepare(
          `SELECT
             t.teachingClassId,
             t.teacherCode,
             t.teacherName,
             t.arrangeInfoText,
             cd.calendarId
           FROM teacher t
           JOIN coursedetail cd ON cd.id = t.teachingClassId`
        )
        .all<any>()

      const pending = new Set<string>()
      for (const row of teacherRows.results || []) {
        const teachingClassId = Number((row as any).teachingClassId || 0)
        const calendarId = Number((row as any).calendarId || 0)
        if (!Number.isFinite(teachingClassId) || teachingClassId <= 0) continue
        if (!Number.isFinite(calendarId) || calendarId <= 0) continue
        const teacherCode = String((row as any).teacherCode || '').trim()
        const teacherName = String((row as any).teacherName || '').trim()
        const lines = splitEndline(String((row as any).arrangeInfoText || ''))
        for (const line of lines) {
          const info = arrangementTextToObj(line)
          const occupyDay = Number(info.occupyDay || 0)
          const occupyTime = Array.isArray(info.occupyTime) ? info.occupyTime : []
          if (!Number.isFinite(occupyDay) || occupyDay <= 0 || occupyTime.length === 0) continue
          for (const occupySection of occupyTime) {
            if (!Number.isFinite(occupySection) || occupySection <= 0) continue
            pending.add([calendarId, teachingClassId, occupyDay, occupySection, teacherCode, teacherName].join('|'))
          }
        }
      }

      for (const key of pending) {
        const [calendarId, teachingClassId, occupyDay, occupySection, teacherCode, teacherName] = key.split('|')
        await db
          .prepare(
            `INSERT OR REPLACE INTO teacher_timeslots (
              calendar_id,
              teaching_class_id,
              occupy_day,
              occupy_section,
              teacher_code,
              teacher_name
            ) VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(Number(calendarId), Number(teachingClassId), Number(occupyDay), Number(occupySection), teacherCode, teacherName)
          .run()
      }

      await db
        .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind('pk_aux_schema_version', PK_AUX_SCHEMA_VERSION)
        .run()
      pkAuxReadyCache = { value: true, expiresAt: Date.now() + 30_000 }
    })()
  }
  await pkAuxInitPromise
}

async function ensurePkAuxiliarySchema(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS teacher_timeslots (
      calendar_id INTEGER NOT NULL,
      teaching_class_id INTEGER NOT NULL,
      occupy_day INTEGER NOT NULL,
      occupy_section INTEGER NOT NULL,
      teacher_code TEXT DEFAULT '',
      teacher_name TEXT DEFAULT '',
      PRIMARY KEY (calendar_id, teaching_class_id, occupy_day, occupy_section, teacher_code, teacher_name)
    )`
  ).run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_timeslots_slot ON teacher_timeslots(calendar_id, occupy_day, occupy_section)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_timeslots_class ON teacher_timeslots(teaching_class_id)').run()
}

async function isPkAuxiliaryReady(db: D1Database) {
  const now = Date.now()
  if (pkAuxReadyCache && pkAuxReadyCache.expiresAt > now) return pkAuxReadyCache.value

  await ensurePkAuxiliarySchema(db)
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('pk_aux_schema_version').first<{ value: string }>()
  const ready = row?.value === PK_AUX_SCHEMA_VERSION
  pkAuxReadyCache = { value: ready, expiresAt: now + 30_000 }
  return ready
}

function triggerPkAuxiliaryBuild(db: D1Database) {
  if (!pkAuxInitPromise) {
    pkAuxInitPromise = ensurePkAuxiliaryTables(db)
      .catch((error) => {
        pkAuxReadyCache = { value: false, expiresAt: Date.now() + 10_000 }
        console.error('Failed to build pk auxiliary data:', error)
      })
      .finally(() => {
        pkAuxInitPromise = null
      })
  }
  return pkAuxInitPromise
}

async function getTeachersByClassIds(db: D1Database, classIds: number[]) {
  const map = new Map<number, any[]>()
  const validClassIds = Array.from(new Set(classIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
  if (validClassIds.length === 0) return map

  for (const part of chunk(validClassIds, MAX_SQL_VARS)) {
    const placeholders = part.map(() => '?').join(',')
    const rows = await db
      .prepare(
        `SELECT teachingClassId, teacherCode, teacherName, arrangeInfoText
         FROM teacher
         WHERE teachingClassId IN (${placeholders})`
      )
      .bind(...part)
      .all<any>()
    for (const row of rows.results || []) {
      const teachingClassId = Number((row as any).teachingClassId || 0)
      if (!map.has(teachingClassId)) map.set(teachingClassId, [])
      map.get(teachingClassId)!.push(row)
    }
  }

  return map
}

function mergeArrangementInfo(teachers: any[]) {
  const lines: string[] = []
  for (const t of teachers) {
    const arr = splitEndline(String(t.arrangeInfoText || ''))
    for (const line of arr) lines.push(line)
  }
  const uniq = Array.from(new Set(lines))
  const objs = uniq.map((line) => arrangementTextToObj(line))
  // Sort by day then start section
  objs.sort((a, b) => {
    const ad = a.occupyDay ?? 99
    const bd = b.occupyDay ?? 99
    if (ad !== bd) return ad - bd
    const at = a.occupyTime?.[0] ?? 99
    const bt = b.occupyTime?.[0] ?? 99
    return at - bt
  })
  return objs
}

export function registerPkRoutes<T extends PkBindings>(app: Hono<{ Bindings: T }>) {
  // GET /api/getAllCalendar
  app.get('/api/getAllCalendar', async (c) => {
    const { results } = await c.env.DB.prepare(
      'SELECT calendarId as calendarId, calendarIdI18n as calendarName FROM calendar ORDER BY calendarId DESC LIMIT 8'
    ).all<any>()
    return c.json(jsonOk(results || []))
  })

  app.get('/api/getAllCampus', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT campus as campusId, campusI18n as campusName FROM campus').all<any>()
    return c.json(jsonOk(results || []))
  })

  app.get('/api/getAllFaculty', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT faculty as facultyId, facultyI18n as facultyName FROM faculty').all<any>()
    return c.json(jsonOk(results || []))
  })

  app.post('/api/findGradeByCalendarId', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const calendarId = Number(body?.calendarId)
    if (!Number.isFinite(calendarId)) return c.json(jsonErr(400, '参数错误: 缺少 calendarId'), 400)

    const { results } = await c.env.DB.prepare(
      `SELECT DISTINCT m.grade as grade
       FROM major m
       JOIN majorandcourse mac ON mac.majorId = m.id
       JOIN coursedetail c ON c.id = mac.courseId
       WHERE c.calendarId = ?
       ORDER BY m.grade DESC`
    )
      .bind(calendarId)
      .all<any>()

    const gradeList = (results || []).map((r: any) => r.grade)
    return c.json(jsonOk({ gradeList }))
  })

  app.post('/api/findMajorByGrade', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const grade = Number(body?.grade)
    if (!Number.isFinite(grade)) return c.json(jsonErr(400, '参数错误: 缺少 grade'), 400)

    const { results } = await c.env.DB.prepare('SELECT code, name FROM major WHERE grade = ? ORDER BY code ASC').bind(grade).all<any>()
    return c.json(jsonOk(results || []))
  })

  // /api/findCourseByMajor
  app.post('/api/findCourseByMajor', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const grade = Number(body?.grade)
    const code = String(body?.code || '').trim()
    const calendarId = Number(body?.calendarId)
    if (!Number.isFinite(grade) || !code || !Number.isFinite(calendarId)) return c.json(jsonErr(400, '参数错误'), 400)

    // 找到当前选择的专业记录，用于判断当前年级的专属课程
    const majorRow = await c.env.DB
      .prepare('SELECT id FROM major WHERE code = ? AND grade = ? ORDER BY grade DESC LIMIT 1')
      .bind(code, grade)
      .first<{ id: number }>()
    const targetMajorId = majorRow?.id ?? null

    // 和原版一致：展示当前入学年级及更早入学年级的计划内课程（如 2024/2023/2022）
    const majorRowsRes = await c.env.DB
      .prepare(
        `SELECT
           cd.*,
           m.grade as grade,
           f.facultyI18n as facultyI18n,
           ca.campusI18n as campusI18n,
           n.courseLabelName as courseLabelName,
           l.teachingLanguageI18n as teachingLanguageI18n,
           CASE
             WHEN ? IS NOT NULL AND EXISTS (
               SELECT 1 FROM majorandcourse mac2 WHERE mac2.majorId = ? AND mac2.courseId = cd.id
             ) THEN 1
             ELSE 0
           END as isExclusive
         FROM coursedetail cd
         JOIN majorandcourse mac ON mac.courseId = cd.id
         JOIN major m ON m.id = mac.majorId
         LEFT JOIN faculty f ON f.faculty = cd.faculty
         LEFT JOIN campus ca ON ca.campus = cd.campus
         LEFT JOIN coursenature_by_calendar n ON n.courseLabelId = cd.courseLabelId AND n.calendarId = cd.calendarId
         LEFT JOIN language l ON l.teachingLanguage = cd.teachingLanguage
         WHERE cd.calendarId = ?
           AND m.code = ?
           AND m.grade <= ?
         ORDER BY cd.courseCode ASC, cd.code ASC`
      )
      .bind(targetMajorId, targetMajorId, calendarId, code, grade)
      .all<any>()

    const majorRows: any[] = majorRowsRes.results || []
    if (majorRows.length === 0) return c.json(jsonOk([]))

    const courseGroupKeys: string[] = []
    const courseGroupMeta = new Map<string, { courseCode: string; grade: number }>()
    const courseCodeToGroupKeys = new Map<string, Set<string>>()
    const courseGroupToNature = new Map<string, Set<string>>()
    const courseGroupExclusiveIds = new Map<string, Set<number>>()

    for (const row of majorRows) {
      const courseCode = normalizeText(row.courseCode)
      if (!courseCode) continue
      const rowGrade = Number((row as any).grade || grade || 0)
      const labelName = normalizeText((row as any).courseLabelName)
      const groupKey = `${courseCode}__${rowGrade}`

      if (!courseGroupMeta.has(groupKey)) {
        courseGroupKeys.push(groupKey)
        courseGroupMeta.set(groupKey, { courseCode, grade: rowGrade })
      }
      if (!courseCodeToGroupKeys.has(courseCode)) courseCodeToGroupKeys.set(courseCode, new Set<string>())
      courseCodeToGroupKeys.get(courseCode)!.add(groupKey)

      if (labelName) {
        if (!courseGroupToNature.has(groupKey)) courseGroupToNature.set(groupKey, new Set<string>())
        courseGroupToNature.get(groupKey)!.add(labelName)
      }

      if (Number((row as any).isExclusive || 0) === 1) {
        if (!courseGroupExclusiveIds.has(groupKey)) courseGroupExclusiveIds.set(groupKey, new Set<number>())
        courseGroupExclusiveIds.get(groupKey)!.add(Number(row.id))
      }
    }

    const allCourseCodes = Array.from(new Set(courseGroupKeys.map((groupKey) => courseGroupMeta.get(groupKey)?.courseCode).filter(Boolean) as string[]))
    const cdRowsAll: any[] = []
    for (const part of chunk(allCourseCodes, MAX_SQL_VARS)) {
      const placeholders = part.map(() => '?').join(',')
      const rows = await c.env.DB
        .prepare(
          `SELECT
             cd.*,
             f.facultyI18n as facultyI18n,
             ca.campusI18n as campusI18n,
             n.courseLabelName as courseLabelName,
             l.teachingLanguageI18n as teachingLanguageI18n
           FROM coursedetail cd
           LEFT JOIN faculty f ON f.faculty = cd.faculty
           LEFT JOIN campus ca ON ca.campus = cd.campus
           LEFT JOIN coursenature_by_calendar n ON n.courseLabelId = cd.courseLabelId AND n.calendarId = cd.calendarId
           LEFT JOIN language l ON l.teachingLanguage = cd.teachingLanguage
           WHERE cd.calendarId = ?
             AND cd.courseCode IN (${placeholders})
           ORDER BY cd.courseCode ASC, cd.code ASC`
        )
        .bind(calendarId, ...part)
        .all<any>()
      if (rows.results?.length) cdRowsAll.push(...(rows.results || []))
    }

    const teachingClassIds = Array.from(
      new Set(
        (cdRowsAll || [])
          .map((r: any) => Number(r?.id))
          .filter((n: number) => Number.isFinite(n))
      )
    )

    const teachersByClass = new Map<number, any[]>()
    for (const part of chunk(teachingClassIds, MAX_SQL_VARS)) {
      const placeholders = part.map(() => '?').join(',')
      const { results } = await c.env.DB
        .prepare(
          `SELECT teachingClassId, teacherCode, teacherName, arrangeInfoText
           FROM teacher
           WHERE teachingClassId IN (${placeholders})`
        )
        .bind(...part)
        .all<any>()

      for (const t of results || []) {
        const tcId = Number((t as any).teachingClassId)
        if (!Number.isFinite(tcId)) continue
        if (!teachersByClass.has(tcId)) teachersByClass.set(tcId, [])
        teachersByClass.get(tcId)!.push(t)
      }
    }

    const rowsByCourseCode = new Map<string, any[]>()
    for (const row of cdRowsAll) {
      const courseCode = normalizeText(row.courseCode)
      if (!courseCode) continue
      if (!rowsByCourseCode.has(courseCode)) rowsByCourseCode.set(courseCode, [])
      rowsByCourseCode.get(courseCode)!.push(row)

      const labelName = normalizeText((row as any).courseLabelName)
      if (labelName) {
        for (const groupKey of courseCodeToGroupKeys.get(courseCode) || []) {
          if (!courseGroupToNature.has(groupKey)) courseGroupToNature.set(groupKey, new Set<string>())
          courseGroupToNature.get(groupKey)!.add(labelName)
        }
      }
    }

    const output: any[] = []
    for (const groupKey of courseGroupKeys) {
      const meta = courseGroupMeta.get(groupKey)
      if (!meta) continue
      const rows = rowsByCourseCode.get(meta.courseCode) || []
      if (rows.length === 0) continue

      const firstRow = rows[0]
      const courseNature = uniqueText([
        ...(courseGroupToNature.get(groupKey) ? Array.from(courseGroupToNature.get(groupKey)!) : []),
      ])

      const courseMap = new Map<string, any>()
      for (const row of rows) {
        const classCode = String(row.code || '')
        if (!classCode) continue

        const teachers = teachersByClass.get(Number(row.id)) || []
        const arrangementInfo = mergeArrangementInfo(teachers)
        const isExclusive = courseGroupExclusiveIds.get(groupKey)?.has(Number(row.id)) || false

        if (!courseMap.has(classCode)) {
          courseMap.set(classCode, {
            code: classCode,
            campus: String(row.campusI18n || ''),
            teachers: (teachers || []).map((t: any) => ({ teacherCode: String(t.teacherCode || ''), teacherName: String(t.teacherName || '') })),
            teachingLanguage: String(row.teachingLanguageI18n || ''),
            arrangementInfo,
            isExclusive,
          })
          continue
        }

        const existing = courseMap.get(classCode)
        const texts = new Set((existing.arrangementInfo || []).map((item: any) => item.arrangementText))
        for (const item of arrangementInfo || []) {
          if (!texts.has(item.arrangementText)) existing.arrangementInfo.push(item)
        }
      }

      output.push({
        courseCode: meta.courseCode,
        courseName: String(firstRow.courseName || ''),
        faculty: String(firstRow.facultyI18n || ''),
        facultyI18n: String(firstRow.facultyI18n || ''),
        credit: Number(firstRow.credit || 0),
        grade: meta.grade,
        courseNature,
        courses: Array.from(courseMap.values()).sort((left, right) => String(left.code).localeCompare(String(right.code))),
      })
    }

    return c.json(jsonOk(output))
  })

  app.post('/api/findOptionalCourseType', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const calendarId = Number(body?.calendarId)
    if (!Number.isFinite(calendarId)) return c.json(jsonErr(400, 'Missing calendarId'), 400)
    const placeholders = OPTIONAL_LABEL_NAMES.map(() => '?').join(',')
    const sqlByCalendar = `
      SELECT DISTINCT
        n.courseLabelId as courseLabelId,
        n.courseLabelName as courseLabelName
      FROM coursenature_by_calendar n
      JOIN coursedetail cd ON cd.courseLabelId = n.courseLabelId AND cd.calendarId = n.calendarId
      WHERE n.calendarId = ?
        AND n.courseLabelName IN (${placeholders})
      ORDER BY n.courseLabelId DESC
    `
    const sqlLegacy = `
      SELECT DISTINCT
        n.courseLabelId as courseLabelId,
        n.courseLabelName as courseLabelName
      FROM coursenature n
      JOIN coursedetail cd ON cd.courseLabelId = n.courseLabelId
      WHERE cd.calendarId = ?
        AND n.courseLabelName IN (${placeholders})
      ORDER BY n.courseLabelId DESC
    `

    try {
      const { results } = await c.env.DB.prepare(sqlByCalendar).bind(calendarId, ...OPTIONAL_LABEL_NAMES).all<any>()
      return c.json(jsonOk(results || []))
    } catch (_e) {
      const { results } = await c.env.DB.prepare(sqlLegacy).bind(calendarId, ...OPTIONAL_LABEL_NAMES).all<any>()
      return c.json(jsonOk(results || []))
    }
  })

  app.post('/api/findCourseByNatureId', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const calendarId = Number(body?.calendarId)
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : []
    if (!Number.isFinite(calendarId) || ids.length === 0) return c.json(jsonErr(400, 'ids 不能为空'), 400)

    // 课程列表：按 label 分组，返回用于搜索/添加的粗略信息（D1 变量上限较低，分块查询）
    const rowsAll: any[] = []
    for (const part of chunk(ids, MAX_SQL_VARS)) {
      const placeholders = part.map(() => '?').join(',')
      const rows = await c.env.DB
        .prepare(
          `SELECT
             cd.courseLabelId as courseLabelId,
             n.courseLabelName as courseLabelName,
             cd.courseCode as courseCode,
             cd.courseName as courseName,
             f.facultyI18n as facultyI18n,
             MAX(cd.credit) as credit,
             GROUP_CONCAT(DISTINCT ca.campusI18n) as campus_list
           FROM coursedetail cd
           LEFT JOIN coursenature_by_calendar n ON n.courseLabelId = cd.courseLabelId AND n.calendarId = cd.calendarId
           LEFT JOIN faculty f ON f.faculty = cd.faculty
           LEFT JOIN campus ca ON ca.campus = cd.campus
           WHERE cd.calendarId = ?
             AND cd.courseLabelId IN (${placeholders})
           GROUP BY cd.courseLabelId, cd.courseCode, cd.courseName, f.facultyI18n
           ORDER BY cd.courseLabelId DESC, cd.courseCode ASC`
        )
        .bind(calendarId, ...part)
        .all<any>()
      if (rows.results?.length) rowsAll.push(...(rows.results || []))
    }

    const map = new Map<number, { courseLabelId: number; courseLabelName: string; courses: any[] }>()
    for (const r of rowsAll) {
      const id = Number(r.courseLabelId)
      if (!map.has(id)) {
        map.set(id, { courseLabelId: id, courseLabelName: String(r.courseLabelName || ''), courses: [] })
      }
      map.get(id)!.courses.push({
        campus: String(r.campus_list || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        courseCode: String(r.courseCode || ''),
        courseName: String(r.courseName || ''),
        faculty: String(r.facultyI18n || ''),
        facultyI18n: String(r.facultyI18n || ''),
        credit: Number(r.credit || 0)
      })
    }
    const mergedByLabelName = new Map<string, { courseLabelName: string; courseLabelIds: number[]; courses: any[] }>()
    for (const item of map.values()) {
      const labelName = normalizeText(item.courseLabelName)
      if (!labelName) continue
      if (!mergedByLabelName.has(labelName)) {
        mergedByLabelName.set(labelName, {
          courseLabelName: labelName,
          courseLabelIds: [item.courseLabelId],
          courses: [],
        })
      } else {
        mergedByLabelName.get(labelName)!.courseLabelIds.push(item.courseLabelId)
      }

      const courseMap = new Map<string, any>()
      for (const existing of mergedByLabelName.get(labelName)!.courses) {
        courseMap.set(`${existing.courseCode}__${existing.faculty}__${existing.credit}`, existing)
      }

      for (const course of item.courses) {
        const key = `${course.courseCode}__${course.faculty}__${course.credit}`
        if (!courseMap.has(key)) {
          const nextCourse = {
            ...course,
            courseLabelName: labelName,
            crossDiscipline: isCrossDisciplineLabel(labelName),
            campus: Array.isArray(course.campus) ? [...course.campus] : []
          }
          courseMap.set(key, nextCourse)
          mergedByLabelName.get(labelName)!.courses.push(nextCourse)
          continue
        }
        const target = courseMap.get(key)
        target.campus = uniqueText([...(target.campus || []), ...(Array.isArray(course.campus) ? course.campus : [])])
        target.crossDiscipline = Boolean(target.crossDiscipline || isCrossDisciplineLabel(labelName))
      }
    }

    const merged = Array.from(mergedByLabelName.values())
      .map((item) => ({
        courseLabelId: Math.max(...item.courseLabelIds),
        courseLabelIds: Array.from(new Set(item.courseLabelIds)).sort((a, b) => b - a),
        courseLabelName: item.courseLabelName,
        crossDiscipline: isCrossDisciplineLabel(item.courseLabelName),
        courses: item.courses.sort((left, right) => String(left.courseCode).localeCompare(String(right.courseCode)))
      }))
      .sort((left, right) => right.courseLabelId - left.courseLabelId)

    return c.json(jsonOk(merged))
  })

  app.post('/api/findCourseDetailByCode', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const calendarId = Number(body?.calendarId)
    const courseCode = String(body?.courseCode || '').trim()
    const courseCodes: string[] = Array.isArray(body?.courseCodes) ? body.courseCodes.map((x: any) => String(x).trim()).filter(Boolean) : []
    if (!Number.isFinite(calendarId)) return c.json(jsonErr(400, '参数错误: 缺少 calendarId'), 400)

    const codes = courseCode ? [courseCode] : courseCodes
    if (codes.length === 0) return c.json(jsonErr(400, '参数错误: 缺少 courseCode(s)'), 400)

    const cdRowsAll: any[] = []
    for (const part of chunk(codes, MAX_SQL_VARS)) {
      const placeholders = part.map(() => '?').join(',')
      const cdRows = await c.env.DB
        .prepare(
          `SELECT
             cd.*,
             ca.campusI18n as campusI18n,
             l.teachingLanguageI18n as teachingLanguageI18n
           FROM coursedetail cd
           LEFT JOIN campus ca ON ca.campus = cd.campus
           LEFT JOIN language l ON l.teachingLanguage = cd.teachingLanguage
           WHERE cd.calendarId = ?
             AND cd.courseCode IN (${placeholders})
           ORDER BY cd.courseCode ASC, cd.code ASC`
        )
        .bind(calendarId, ...part)
        .all<any>()
      if (cdRows.results?.length) cdRowsAll.push(...(cdRows.results || []))
    }

    const byCourseCode = new Map<string, any[]>()
    for (const row of cdRowsAll) {
      const cc = String(row.courseCode || '')
      if (!cc) continue
      if (!byCourseCode.has(cc)) byCourseCode.set(cc, [])
    }

    const teachingClassIds = Array.from(
      new Set(
        (cdRowsAll || [])
          .map((r: any) => Number(r?.id))
          .filter((n: number) => Number.isFinite(n))
      )
    )

    const teachersByClass = new Map<number, any[]>()
    for (const part of chunk(teachingClassIds, MAX_SQL_VARS)) {
      const placeholders = part.map(() => '?').join(',')
      const { results } = await c.env.DB
        .prepare(
          `SELECT teachingClassId, teacherCode, teacherName, arrangeInfoText
           FROM teacher
           WHERE teachingClassId IN (${placeholders})`
        )
        .bind(...part)
        .all<any>()

      for (const t of results || []) {
        const tcId = Number((t as any).teachingClassId)
        if (!Number.isFinite(tcId)) continue
        if (!teachersByClass.has(tcId)) teachersByClass.set(tcId, [])
        teachersByClass.get(tcId)!.push(t)
      }
    }

    for (const row of cdRowsAll) {
      const cc = String(row.courseCode || '')
      if (!cc) continue

      const teachers = teachersByClass.get(Number(row.id)) || []
      const arrangementInfo = mergeArrangementInfo(teachers)

      byCourseCode.get(cc)!.push({
        code: String(row.code || ''),
        teachers: (teachers || []).map((t: any) => ({ teacherCode: String(t.teacherCode || ''), teacherName: String(t.teacherName || '') })),
        campusI18n: String(row.campusI18n || ''),
        teachingLanguageI18n: String(row.teachingLanguageI18n || ''),
        arrangementInfo
      })
    }

    // 输出格式：单个 -> list；批量 -> dict
    if (courseCode) {
      const list = byCourseCode.get(courseCode) || []
      // pk 后端会把 campusI18n/teachingLanguageI18n 映射为 campus/teachingLanguage（前端接口定义）
      const normalized = list.map((x) => ({
        code: x.code,
        teachers: x.teachers,
        campus: x.campusI18n,
        teachingLanguage: x.teachingLanguageI18n,
        arrangementInfo: x.arrangementInfo
      }))
      return c.json(jsonOk(normalized))
    }

    const out: Record<string, any[]> = {}
    for (const [k, list] of byCourseCode.entries()) {
      out[k] = list.map((x) => ({
        code: x.code,
        teachers: x.teachers,
        campus: x.campusI18n,
        teachingLanguage: x.teachingLanguageI18n,
        arrangementInfo: x.arrangementInfo
      }))
    }
    return c.json(jsonOk(out))
  })

  app.post('/api/findCourseBySearch', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const calendarId = Number(body?.calendarId)
    if (!Number.isFinite(calendarId)) return c.json(jsonErr(400, '参数错误: 缺少 calendarId'), 400)

    const courseName = String(body?.courseName || '').trim()
    const courseCode = String(body?.courseCode || '').trim()
    const teacherCode = String(body?.teacherCode || '').trim()
    const teacherName = String(body?.teacherName || '').trim()
    const campus = String(body?.campus || '').trim()
    const faculty = String(body?.faculty || '').trim()

    const where: string[] = ['cd.calendarId = ?']
    const args: any[] = [calendarId]

    if (courseName) {
      where.push('cd.courseName LIKE ?')
      args.push(`%${courseName}%`)
    }
    if (courseCode) {
      where.push('(cd.courseCode = ? OR cd.code = ?)')
      args.push(courseCode, courseCode)
    }
    if (campus) {
      where.push('(cd.campus = ? OR ca.campusI18n = ?)')
      args.push(campus, campus)
    }
    if (faculty) {
      where.push('(cd.faculty = ? OR f.facultyI18n = ?)')
      args.push(faculty, faculty)
    }
    if (teacherCode) {
      where.push('t.teacherCode = ?')
      args.push(teacherCode)
    }
    if (teacherName) {
      where.push('t.teacherName = ?')
      args.push(teacherName)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sizeLimit = 100

    const query = `
      SELECT
        cd.courseCode as courseCode,
        cd.courseName as courseName,
        f.facultyI18n as facultyI18n,
        GROUP_CONCAT(DISTINCT n.courseLabelName) as courseNature,
        GROUP_CONCAT(DISTINCT ca.campusI18n) as campus_list,
        MAX(cd.credit) as credit
      FROM coursedetail cd
      LEFT JOIN faculty f ON f.faculty = cd.faculty
      LEFT JOIN campus ca ON ca.campus = cd.campus
      LEFT JOIN coursenature_by_calendar n ON n.courseLabelId = cd.courseLabelId AND n.calendarId = cd.calendarId
      LEFT JOIN teacher t ON t.teachingClassId = cd.id
      ${whereSql}
      GROUP BY cd.courseCode, cd.courseName, f.facultyI18n
      ORDER BY cd.courseCode ASC
      LIMIT ${sizeLimit}
    `

    const { results } = await c.env.DB.prepare(query).bind(...args).all<any>()
    const courses = (results || []).map((r: any) => ({
      courseCode: String(r.courseCode || ''),
      courseName: String(r.courseName || ''),
      faculty: String(r.facultyI18n || ''),
      facultyI18n: String(r.facultyI18n || ''),
      courseNature: String(r.courseNature || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      campus: String(r.campus_list || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      campus_list: String(r.campus_list || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      credit: Number(r.credit || 0)
    }))

    return c.json(jsonOk({ courses, sizeLimit }))
  })

  app.post('/api/findCourseByTime', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const calendarId = Number(body?.calendarId)
    const day = Number(body?.day)
    const section = Number(body?.section)
    if (!Number.isFinite(calendarId) || !Number.isFinite(day) || !Number.isFinite(section)) return c.json(jsonErr(400, '输入参数有误'), 400)

    const slotSections = getPkTimeSlotsBySection(section)
    if (slotSections.length === 0) return c.json(jsonErr(400, '输入参数有误', []), 400)

    const labelPlaceholders = OPTIONAL_LABEL_NAMES.map(() => '?').join(',')
    const pkAuxReady = await isPkAuxiliaryReady(c.env.DB)

    let results: any[] = []
    if (pkAuxReady) {
      const slotPlaceholders = slotSections.map(() => '?').join(',')
      const query = `
        SELECT
          cd.courseCode as courseCode,
          cd.courseName as courseName,
          f.facultyI18n as faculty,
          MAX(cd.credit) as credit,
          GROUP_CONCAT(DISTINCT n.courseLabelName) as courseNature,
          GROUP_CONCAT(DISTINCT ca.campusI18n) as campus
        FROM coursedetail cd
        JOIN teacher_timeslots ts ON ts.teaching_class_id = cd.id
        LEFT JOIN faculty f ON f.faculty = cd.faculty
        LEFT JOIN campus ca ON ca.campus = cd.campus
        LEFT JOIN coursenature_by_calendar n ON n.courseLabelId = cd.courseLabelId AND n.calendarId = cd.calendarId
        WHERE cd.calendarId = ?
          AND ts.calendar_id = ?
          AND ts.occupy_day = ?
          AND ts.occupy_section IN (${slotPlaceholders})
          AND n.courseLabelName IN (${labelPlaceholders})
        GROUP BY cd.courseCode, cd.courseName, f.facultyI18n
        ORDER BY cd.courseCode ASC
      `

      const queryResult = await c.env.DB.prepare(query).bind(calendarId, calendarId, day, ...slotSections, ...OPTIONAL_LABEL_NAMES).all<any>()
      results = queryResult.results || []
    } else {
      const dayTextMap = ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
      const dayText = dayTextMap[day] || ''
      const likePatterns =
        section === 1 ? [`%${dayText}1-2%`]
        : section === 2 ? [`%${dayText}3-4%`]
        : section === 3 ? [`%${dayText}5-6%`]
        : section === 4 ? [`%${dayText}7-8%`]
        : section === 5 ? [`%${dayText}9-%`]
        : [`%${dayText}10-11%`, `%${dayText}10-12%`]
      const orLike = likePatterns.map(() => 't.arrangeInfoText LIKE ?').join(' OR ')
      const query = `
        SELECT
          cd.courseCode as courseCode,
          cd.courseName as courseName,
          f.facultyI18n as faculty,
          MAX(cd.credit) as credit,
          GROUP_CONCAT(DISTINCT n.courseLabelName) as courseNature,
          GROUP_CONCAT(DISTINCT ca.campusI18n) as campus
        FROM coursedetail cd
        JOIN teacher t ON t.teachingClassId = cd.id
        LEFT JOIN faculty f ON f.faculty = cd.faculty
        LEFT JOIN campus ca ON ca.campus = cd.campus
        LEFT JOIN coursenature_by_calendar n ON n.courseLabelId = cd.courseLabelId AND n.calendarId = cd.calendarId
        WHERE cd.calendarId = ?
          AND (${orLike})
          AND n.courseLabelName IN (${labelPlaceholders})
        GROUP BY cd.courseCode, cd.courseName, f.facultyI18n
        ORDER BY cd.courseCode ASC
      `
      const queryResult = await c.env.DB.prepare(query).bind(calendarId, ...likePatterns, ...OPTIONAL_LABEL_NAMES).all<any>()
      results = queryResult.results || []
    }

    const data = (results || []).map((r: any) => ({
      courseCode: String(r.courseCode || ''),
      courseName: String(r.courseName || ''),
      faculty: String(r.faculty || ''),
      facultyI18n: String(r.faculty || ''),
      credit: Number(r.credit || 0),
      courseNature: String(r.courseNature || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      campus: String(r.campus || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }))

    return c.json(jsonOk(data))
  })

  app.get('/api/getLatestUpdateTime', async (c) => {
    const row = await c.env.DB.prepare('SELECT fetchTime FROM fetchlog ORDER BY fetchTime DESC LIMIT 1').first<{ fetchTime: number }>()
    const v = row?.fetchTime ? new Date(row.fetchTime * 1000).toISOString().slice(0, 10) : null
    return c.json(jsonOk(v))
  })

  app.post('/api/getLatestCourseInfo', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const calendarId = Number(body?.calendarId)
    if (!Number.isFinite(calendarId)) return c.json(jsonErr(400, '参数错误: 缺少 calendarId'), 400)

    const majorCourseCodes: string[] = Array.isArray(body?.majorCourseCodes) ? body.majorCourseCodes.map((x: any) => String(x).trim()).filter(Boolean) : []
    const otherCourseCodes: string[] = Array.isArray(body?.otherCourseCodes) ? body.otherCourseCodes.map((x: any) => String(x).trim()).filter(Boolean) : []
    const majorInfo = body?.majorInfo && typeof body.majorInfo === 'object' ? body.majorInfo : null

    const allCodes = Array.from(new Set([...majorCourseCodes, ...otherCourseCodes]))
    const out: Record<string, any[]> = {}
    for (const cc of allCodes) out[cc] = []

    if (allCodes.length === 0) return c.json(jsonOk(out))

    const cdRowsAll: any[] = []
    for (const part of chunk(allCodes, MAX_SQL_VARS)) {
      const placeholders = part.map(() => '?').join(',')
      const cdRows = await c.env.DB
        .prepare(
          `SELECT
             cd.*,
             ca.campusI18n as campusI18n,
             l.teachingLanguageI18n as teachingLanguageI18n
           FROM coursedetail cd
           LEFT JOIN campus ca ON ca.campus = cd.campus
           LEFT JOIN language l ON l.teachingLanguage = cd.teachingLanguage
           WHERE cd.calendarId = ?
             AND cd.courseCode IN (${placeholders})
           ORDER BY cd.courseCode ASC, cd.code ASC`
        )
        .bind(calendarId, ...part)
        .all<any>()
      if (cdRows.results?.length) cdRowsAll.push(...(cdRows.results || []))
    }

    // target majorId for isExclusive
    let targetMajorId: number | null = null
    if (majorInfo?.grade && majorInfo?.code) {
      const row = await c.env.DB
        .prepare('SELECT id FROM major WHERE code = ? AND grade <= ? ORDER BY grade DESC LIMIT 1')
        .bind(String(majorInfo.code), Number(majorInfo.grade))
        .first<{ id: number }>()
      targetMajorId = row?.id ?? null
    }

    const classIds = cdRowsAll.map((row) => Number((row as any).id)).filter((id) => Number.isFinite(id) && id > 0)
    const teachersByClassId = await getTeachersByClassIds(c.env.DB, classIds)
    const exclusiveCourseIds = new Set<number>()

    if (targetMajorId && majorCourseCodes.length > 0 && classIds.length > 0) {
      for (const part of chunk(classIds, MAX_SQL_VARS)) {
        const placeholders = part.map(() => '?').join(',')
        const rows = await c.env.DB
          .prepare(
            `SELECT courseId
             FROM majorandcourse
             WHERE majorId = ?
               AND courseId IN (${placeholders})`
          )
          .bind(targetMajorId, ...part)
          .all<{ courseId: number }>()
        for (const row of rows.results || []) {
          exclusiveCourseIds.add(Number((row as any).courseId))
        }
      }
    }

    for (const row of cdRowsAll) {
      const cc = String(row.courseCode || '')
      if (!cc) continue

      const teachers = teachersByClassId.get(Number(row.id)) || []
      const arrangementInfo = mergeArrangementInfo(teachers)

      let isExclusive: boolean | undefined = undefined
      if (majorCourseCodes.includes(cc)) {
        isExclusive = targetMajorId ? exclusiveCourseIds.has(Number(row.id)) : false
      }

      out[cc] = out[cc] || []
      out[cc].push({
        code: String(row.code || ''),
        teachers: (teachers || []).map((t: any) => ({ teacherCode: String(t.teacherCode || ''), teacherName: String(t.teacherName || '') })),
        campusI18n: String(row.campusI18n || ''),
        teachingLanguageI18n: String(row.teachingLanguageI18n || ''),
        arrangementInfo,
        ...(typeof isExclusive === 'boolean' ? { isExclusive } : {})
      })
    }

    // normalize key fields for frontend
    for (const key of Object.keys(out)) {
      out[key] = (out[key] || []).map((x: any) => ({
        code: x.code,
        teachers: x.teachers,
        campus: x.campusI18n,
        teachingLanguage: x.teachingLanguageI18n,
        arrangementInfo: x.arrangementInfo,
        ...(typeof x.isExclusive === 'boolean' ? { isExclusive: x.isExclusive } : {})
      }))
    }

    return c.json(jsonOk(out))
  })
}
