#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${D1_DATABASE_NAME:-jcourse-db}"
WRANGLER_ENV="${WRANGLER_ENV:-}"
BATCH_SIZE="${REFRESH_REVIEW_INDEX_BATCH_SIZE:-500}"
AUX_SCHEMA_VERSION="20260609-pk-materialize-v1"
NO_FTS=0

if [ "${1:-}" = "--no-fts" ]; then
  NO_FTS=1
elif [ -n "${1:-}" ]; then
  echo "Usage: $0 [--no-fts]" >&2
  exit 1
fi

wrangler_args=(d1 execute "$DB_NAME" --remote)
if [ -n "$WRANGLER_ENV" ]; then
  wrangler_args+=(--env "$WRANGLER_ENV")
fi

run_sql() {
  local label="$1"
  local sql="$2"
  local attempt

  for attempt in 1 2 3; do
    echo "[$label] attempt $attempt"
    if npx wrangler "${wrangler_args[@]}" --command "$sql"; then
      return 0
    fi
    sleep $((attempt * 2))
  done

  echo "[$label] failed after retries" >&2
  return 1
}

run_sql "ensure-pk-new-code-index" "CREATE INDEX IF NOT EXISTS idx_coursedetail_newCode ON coursedetail(newCode);"

run_sql "materialize-teachers" "INSERT INTO teachers (name) SELECT DISTINCT TRIM(t.teacherName) AS name FROM teacher t WHERE TRIM(COALESCE(t.teacherName, '')) != '' AND NOT EXISTS (SELECT 1 FROM teachers tt WHERE tt.name = TRIM(t.teacherName));"

run_sql "materialize-courses" "WITH course_teacher AS ( SELECT cd.courseCode AS courseCode, MIN(TRIM(t.teacherName)) AS teacherName, GROUP_CONCAT(DISTINCT TRIM(t.teacherName)) AS teacherNames, GROUP_CONCAT(DISTINCT TRIM(t.teacherCode)) AS teacherCodes FROM coursedetail cd LEFT JOIN teacher t ON t.teachingClassId = cd.id WHERE TRIM(COALESCE(cd.courseCode, '')) != '' GROUP BY cd.courseCode ), course_base AS ( SELECT cd.courseCode AS courseCode, MAX(COALESCE(NULLIF(TRIM(cd.courseName), ''), NULLIF(TRIM(cd.name), ''), cd.courseCode)) AS courseName, MAX(COALESCE(cd.credit, 0)) AS credit, MAX(COALESCE(f.facultyI18n, cd.faculty, '')) AS department, GROUP_CONCAT(DISTINCT TRIM(cd.code)) AS teachingClassCodes, GROUP_CONCAT(DISTINCT TRIM(cd.newCourseCode)) AS newCourseCodes, GROUP_CONCAT(DISTINCT TRIM(cd.newCode)) AS newCodes FROM coursedetail cd LEFT JOIN faculty f ON f.faculty = cd.faculty WHERE TRIM(COALESCE(cd.courseCode, '')) != '' GROUP BY cd.courseCode ) INSERT INTO courses ( code, name, credit, department, teacher_id, review_count, review_avg, search_keywords, is_legacy, is_icu ) SELECT cb.courseCode AS code, cb.courseName AS name, cb.credit AS credit, cb.department AS department, tt.id AS teacher_id, 0 AS review_count, 0 AS review_avg, TRIM( cb.courseCode || ' ' || cb.courseName || ' ' || COALESCE(ct.teacherName, '') || ' ' || COALESCE(ct.teacherNames, '') || ' ' || COALESCE(ct.teacherCodes, '') || ' ' || COALESCE(cb.teachingClassCodes, '') || ' ' || COALESCE(cb.newCourseCodes, '') || ' ' || COALESCE(cb.newCodes, '') ) AS search_keywords, 0 AS is_legacy, 0 AS is_icu FROM course_base cb LEFT JOIN course_teacher ct ON ct.courseCode = cb.courseCode LEFT JOIN teachers tt ON tt.name = ct.teacherName WHERE NOT EXISTS ( SELECT 1 FROM courses c WHERE c.code = cb.courseCode AND c.is_legacy = 0 );"

run_sql "refresh-course-keywords" "UPDATE courses SET search_keywords = ( SELECT TRIM( courses.code || ' ' || courses.name || ' ' || COALESCE(courses.department, '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(cd.code)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(cd.newCourseCode)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(cd.newCode)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(t.teacherCode)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(t.teacherName)), '') ) FROM coursedetail cd LEFT JOIN teacher t ON t.teachingClassId = cd.id WHERE cd.courseCode = courses.code OR cd.newCourseCode = courses.code OR cd.code = courses.code OR cd.newCode = courses.code ) WHERE is_legacy = 0 AND EXISTS ( SELECT 1 FROM coursedetail cd WHERE cd.courseCode = courses.code OR cd.newCourseCode = courses.code OR cd.code = courses.code OR cd.newCode = courses.code );"

run_sql "refresh-split-course-credit" "UPDATE courses SET credit = ( SELECT MAX(CAST(cd.credit AS REAL)) FROM coursedetail cd WHERE cd.courseName = courses.name AND CAST(COALESCE(cd.credit, 0) AS REAL) > 0 AND TRIM(COALESCE(cd.courseCode, '')) != '' AND LENGTH(courses.code) > LENGTH(cd.courseCode) AND SUBSTR(courses.code, 1, LENGTH(cd.courseCode)) = cd.courseCode ) WHERE is_legacy = 0 AND CAST(COALESCE(credit, 0) AS REAL) <= 0 AND EXISTS ( SELECT 1 FROM coursedetail cd WHERE cd.courseName = courses.name AND CAST(COALESCE(cd.credit, 0) AS REAL) > 0 AND TRIM(COALESCE(cd.courseCode, '')) != '' AND LENGTH(courses.code) > LENGTH(cd.courseCode) AND SUBSTR(courses.code, 1, LENGTH(cd.courseCode)) = cd.courseCode );"

run_sql "refresh-course-aliases" "INSERT INTO course_aliases (system, alias, course_id) SELECT DISTINCT 'onesystem' AS system, TRIM(alias.alias) AS alias, c.id AS course_id FROM ( SELECT courseCode AS alias, courseCode AS courseCode FROM coursedetail WHERE TRIM(COALESCE(courseCode, '')) != '' UNION ALL SELECT code AS alias, courseCode AS courseCode FROM coursedetail WHERE TRIM(COALESCE(code, '')) != '' AND TRIM(COALESCE(courseCode, '')) != '' UNION ALL SELECT newCourseCode AS alias, courseCode AS courseCode FROM coursedetail WHERE TRIM(COALESCE(newCourseCode, '')) != '' AND TRIM(COALESCE(courseCode, '')) != '' UNION ALL SELECT newCode AS alias, courseCode AS courseCode FROM coursedetail WHERE TRIM(COALESCE(newCode, '')) != '' AND TRIM(COALESCE(courseCode, '')) != '' ) AS alias JOIN courses c ON c.code = alias.courseCode AND c.is_legacy = 0 WHERE TRIM(COALESCE(alias.alias, '')) != '' ON CONFLICT(system, alias) DO UPDATE SET course_id = excluded.course_id;"

if [ "$NO_FTS" -eq 1 ]; then
  run_sql "ensure-review-index-tables-no-fts" "CREATE TABLE IF NOT EXISTS course_semesters (course_id INTEGER PRIMARY KEY, semester_names TEXT DEFAULT ''); CREATE INDEX IF NOT EXISTS idx_course_semesters_course_id ON course_semesters(course_id); INSERT OR REPLACE INTO settings (key, value) VALUES ('aux_schema_version', '$AUX_SCHEMA_VERSION');"
else
  run_sql "ensure-review-index-tables" "CREATE TABLE IF NOT EXISTS course_semesters (course_id INTEGER PRIMARY KEY, semester_names TEXT DEFAULT ''); CREATE INDEX IF NOT EXISTS idx_course_semesters_course_id ON course_semesters(course_id); CREATE VIRTUAL TABLE IF NOT EXISTS course_search USING fts5(course_id UNINDEXED, search_doc, tokenize='trigram'); INSERT OR REPLACE INTO settings (key, value) VALUES ('aux_schema_version', '$AUX_SCHEMA_VERSION');"
fi

range_json="$(npx wrangler "${wrangler_args[@]}" --json --command "SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS course_count FROM courses;")"
read -r min_id max_id course_count < <(
  node -e "
const payload = JSON.parse(process.argv[1]);
const row = payload?.[0]?.results?.[0] || {};
console.log([row.min_id || 0, row.max_id || 0, row.course_count || 0].join(' '));
" "$range_json"
)

if [ "$course_count" -eq 0 ]; then
  if [ "$NO_FTS" -eq 1 ]; then
    fts_count_json="$(npx wrangler "${wrangler_args[@]}" --json --command "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'course_search%';")"
    fts_count="$(node -e "const payload = JSON.parse(process.argv[1]); const row = payload?.[0]?.results?.[0] || {}; console.log(row.count || 0);" "$fts_count_json")"
    if [ "$fts_count" -ne 0 ]; then
      echo "No-FTS mode found $fts_count course_search/FTS object(s)" >&2
      exit 1
    fi
  fi
  echo "No courses found, skip review index refresh"
  exit 0
fi

start=$(( (min_id / BATCH_SIZE) * BATCH_SIZE ))
while [ "$start" -le "$max_id" ]; do
  end=$((start + BATCH_SIZE - 1))
  run_sql "refresh-semesters-$start-$end" "WITH course_codes AS ( SELECT id AS course_id, TRIM(code) AS code FROM courses WHERE id BETWEEN $start AND $end AND TRIM(COALESCE(code, '')) != '' UNION SELECT ca.course_id, TRIM(ca.alias) AS code FROM course_aliases ca JOIN courses c ON c.id = ca.course_id WHERE c.id BETWEEN $start AND $end AND ca.system = 'onesystem' AND TRIM(COALESCE(ca.alias, '')) != '' ), semester_rows AS ( SELECT cc.course_id, ca.calendarIdI18n AS name, ca.calendarId FROM course_codes cc JOIN coursedetail cd ON cd.courseCode = cc.code JOIN calendar ca ON ca.calendarId = cd.calendarId UNION ALL SELECT cc.course_id, ca.calendarIdI18n AS name, ca.calendarId FROM course_codes cc JOIN coursedetail cd ON cd.code = cc.code JOIN calendar ca ON ca.calendarId = cd.calendarId UNION ALL SELECT cc.course_id, ca.calendarIdI18n AS name, ca.calendarId FROM course_codes cc JOIN coursedetail cd ON cd.newCourseCode = cc.code JOIN calendar ca ON ca.calendarId = cd.calendarId UNION ALL SELECT cc.course_id, ca.calendarIdI18n AS name, ca.calendarId FROM course_codes cc JOIN coursedetail cd ON cd.newCode = cc.code JOIN calendar ca ON ca.calendarId = cd.calendarId ), semester_ranked AS ( SELECT course_id, TRIM(name) AS name, MAX(calendarId) AS calendarId FROM semester_rows WHERE TRIM(COALESCE(name, '')) != '' GROUP BY course_id, TRIM(name) ) INSERT OR REPLACE INTO course_semesters (course_id, semester_names) SELECT c.id, COALESCE(( SELECT GROUP_CONCAT(name, '||') FROM ( SELECT sr.name FROM semester_ranked sr WHERE sr.course_id = c.id ORDER BY sr.calendarId DESC, sr.name ) ), '') AS semester_names FROM courses c WHERE c.id BETWEEN $start AND $end;"
  if [ "$NO_FTS" -eq 0 ]; then
    run_sql "refresh-search-$start-$end" "DELETE FROM course_search WHERE course_id IN (SELECT id FROM courses WHERE id BETWEEN $start AND $end); WITH alias_keywords AS ( SELECT ca.course_id, GROUP_CONCAT(DISTINCT TRIM(ca.alias)) AS aliases FROM course_aliases ca JOIN courses c ON c.id = ca.course_id WHERE c.id BETWEEN $start AND $end AND ca.system = 'onesystem' AND TRIM(COALESCE(ca.alias, '')) != '' GROUP BY ca.course_id ), course_codes AS ( SELECT id AS course_id, TRIM(code) AS code FROM courses WHERE id BETWEEN $start AND $end AND TRIM(COALESCE(code, '')) != '' UNION SELECT ca.course_id, TRIM(ca.alias) AS code FROM course_aliases ca JOIN courses c ON c.id = ca.course_id WHERE c.id BETWEEN $start AND $end AND ca.system = 'onesystem' AND TRIM(COALESCE(ca.alias, '')) != '' ), pk_rows AS ( SELECT cc.course_id, cd.* FROM course_codes cc JOIN coursedetail cd ON cd.courseCode = cc.code UNION ALL SELECT cc.course_id, cd.* FROM course_codes cc JOIN coursedetail cd ON cd.code = cc.code UNION ALL SELECT cc.course_id, cd.* FROM course_codes cc JOIN coursedetail cd ON cd.newCourseCode = cc.code UNION ALL SELECT cc.course_id, cd.* FROM course_codes cc JOIN coursedetail cd ON cd.newCode = cc.code ), pk_keywords AS ( SELECT pr.course_id, TRIM( COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.courseCode)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.code)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.newCourseCode)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.newCode)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.courseName)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.name)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.faculty)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(pr.campus)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(t.teacherCode)), '') || ' ' || COALESCE(GROUP_CONCAT(DISTINCT TRIM(t.teacherName)), '') ) AS keywords FROM pk_rows pr LEFT JOIN teacher t ON t.teachingClassId = pr.id GROUP BY pr.course_id ) INSERT INTO course_search (course_id, search_doc) SELECT c.id, TRIM( c.code || ' ' || c.name || ' ' || COALESCE(c.department, '') || ' ' || COALESCE(t.name, '') || ' ' || COALESCE(t.tid, '') || ' ' || COALESCE(c.search_keywords, '') || ' ' || COALESCE(ak.aliases, '') || ' ' || COALESCE(pk.keywords, '') ) AS search_doc FROM courses c LEFT JOIN teachers t ON t.id = c.teacher_id LEFT JOIN alias_keywords ak ON ak.course_id = c.id LEFT JOIN pk_keywords pk ON pk.course_id = c.id WHERE c.id BETWEEN $start AND $end;"
  fi
  start=$((start + BATCH_SIZE))
done

if [ "$NO_FTS" -eq 1 ]; then
  run_sql "cleanup-stale-review-index-no-fts" "DELETE FROM course_semesters WHERE course_id NOT IN (SELECT id FROM courses); INSERT OR REPLACE INTO settings (key, value) VALUES ('aux_schema_version', '$AUX_SCHEMA_VERSION');"
  fts_count_json="$(npx wrangler "${wrangler_args[@]}" --json --command "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'course_search%';")"
  fts_count="$(node -e "const payload = JSON.parse(process.argv[1]); const row = payload?.[0]?.results?.[0] || {}; console.log(row.count || 0);" "$fts_count_json")"
  if [ "$fts_count" -ne 0 ]; then
    echo "No-FTS mode found $fts_count course_search/FTS object(s)" >&2
    exit 1
  fi
  npx wrangler "${wrangler_args[@]}" --command "SELECT key,value FROM settings WHERE key='aux_schema_version'; SELECT COUNT(*) AS course_count FROM courses; SELECT COUNT(*) AS course_semester_count FROM course_semesters; SELECT COUNT(*) AS nonempty_semester_count FROM course_semesters WHERE TRIM(COALESCE(semester_names,'')) != ''; SELECT COUNT(*) AS course_search_object_count FROM sqlite_master WHERE name LIKE 'course_search%';"
  exit 0
fi

run_sql "cleanup-stale-review-index" "DELETE FROM course_semesters WHERE course_id NOT IN (SELECT id FROM courses); DELETE FROM course_search WHERE course_id NOT IN (SELECT id FROM courses); INSERT OR REPLACE INTO settings (key, value) VALUES ('aux_schema_version', '$AUX_SCHEMA_VERSION');"
npx wrangler "${wrangler_args[@]}" --command "SELECT key,value FROM settings WHERE key='aux_schema_version'; SELECT COUNT(*) AS course_count FROM courses; SELECT COUNT(*) AS course_semester_count FROM course_semesters; SELECT COUNT(*) AS course_search_count FROM course_search; SELECT COUNT(*) AS nonempty_semester_count FROM course_semesters WHERE TRIM(COALESCE(semester_names,'')) != '';"
