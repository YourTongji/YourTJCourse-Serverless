-- Materialize pk (onesystem) course list into review site's courses/teachers tables
-- This is idempotent: it only inserts missing teachers/courses and updates alias mapping.

-- Insert teachers (review site teachers table) by name if missing
INSERT INTO teachers (name)
SELECT DISTINCT TRIM(t.teacherName) AS name
FROM teacher t
WHERE TRIM(COALESCE(t.teacherName, '')) != ''
  AND NOT EXISTS (
    SELECT 1 FROM teachers tt WHERE tt.name = TRIM(t.teacherName)
  );

-- Insert courses (one row per courseCode) if missing
WITH
  course_teacher AS (
    SELECT
      cd.courseCode AS courseCode,
      MIN(TRIM(t.teacherName)) AS teacherName
    FROM coursedetail cd
    LEFT JOIN teacher t ON t.teachingClassId = cd.id
    WHERE TRIM(COALESCE(cd.courseCode, '')) != ''
    GROUP BY cd.courseCode
  ),
  course_base AS (
    SELECT
      cd.courseCode AS courseCode,
      MAX(COALESCE(NULLIF(TRIM(cd.courseName), ''), NULLIF(TRIM(cd.name), ''), cd.courseCode)) AS courseName,
      MAX(COALESCE(cd.credit, 0)) AS credit,
      MAX(COALESCE(f.facultyI18n, cd.faculty, '')) AS department
    FROM coursedetail cd
    LEFT JOIN faculty f ON f.faculty = cd.faculty
    WHERE TRIM(COALESCE(cd.courseCode, '')) != ''
    GROUP BY cd.courseCode
  )
INSERT INTO courses (
  code,
  name,
  credit,
  department,
  teacher_id,
  review_count,
  review_avg,
  search_keywords,
  is_legacy,
  is_icu
)
SELECT
  cb.courseCode AS code,
  cb.courseName AS name,
  cb.credit AS credit,
  cb.department AS department,
  tt.id AS teacher_id,
  0 AS review_count,
  0 AS review_avg,
  TRIM(cb.courseCode || ' ' || cb.courseName || ' ' || COALESCE(ct.teacherName, '')) AS search_keywords,
  0 AS is_legacy,
  0 AS is_icu
FROM course_base cb
LEFT JOIN course_teacher ct ON ct.courseCode = cb.courseCode
LEFT JOIN teachers tt ON tt.name = ct.teacherName
WHERE NOT EXISTS (
  SELECT 1 FROM courses c WHERE c.code = cb.courseCode AND c.is_legacy = 0
);

-- Fill old ICU/imported split-course rows like 12200402 from onesystem base code 122004.
-- Onesystem keeps the credit on the base courseCode, while reviews may use class-suffixed codes.
UPDATE courses
SET credit = (
  SELECT MAX(CAST(cd.credit AS REAL))
  FROM coursedetail cd
  WHERE cd.courseName = courses.name
    AND CAST(COALESCE(cd.credit, 0) AS REAL) > 0
    AND TRIM(COALESCE(cd.courseCode, '')) != ''
    AND LENGTH(courses.code) > LENGTH(cd.courseCode)
    AND SUBSTR(courses.code, 1, LENGTH(cd.courseCode)) = cd.courseCode
)
WHERE is_legacy = 0
  AND CAST(COALESCE(credit, 0) AS REAL) <= 0
  AND EXISTS (
    SELECT 1
    FROM coursedetail cd
    WHERE cd.courseName = courses.name
      AND CAST(COALESCE(cd.credit, 0) AS REAL) > 0
      AND TRIM(COALESCE(cd.courseCode, '')) != ''
      AND LENGTH(courses.code) > LENGTH(cd.courseCode)
      AND SUBSTR(courses.code, 1, LENGTH(cd.courseCode)) = cd.courseCode
  );

-- Ensure onesystem aliases (courseCode and newCourseCode) map to the materialized course row
INSERT INTO course_aliases (system, alias, course_id)
SELECT DISTINCT
  'onesystem' AS system,
  TRIM(alias.alias) AS alias,
  c.id AS course_id
FROM (
  SELECT courseCode AS alias, courseCode AS courseCode
  FROM coursedetail
  WHERE TRIM(COALESCE(courseCode, '')) != ''
  UNION ALL
  SELECT newCourseCode AS alias, courseCode AS courseCode
  FROM coursedetail
  WHERE TRIM(COALESCE(newCourseCode, '')) != '' AND TRIM(COALESCE(courseCode, '')) != ''
) AS alias
JOIN courses c ON c.code = alias.courseCode AND c.is_legacy = 0
WHERE TRIM(COALESCE(alias.alias, '')) != ''
ON CONFLICT(system, alias) DO UPDATE SET course_id = excluded.course_id;
