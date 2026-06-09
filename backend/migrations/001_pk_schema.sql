-- PK (鎺掕妯℃嫙鍣? 鏁版嵁鍩燂細鐢ㄤ簬鏀寔 /api/getAllCalendar 绛夊吋瀹规帴鍙?-- 璁捐鐩爣锛氬敖閲忓鐢?pk 椤圭洰閲?MySQL 鐨勮〃缁撴瀯涓庡瓧娈佃涔夛紝渚夸簬鏃犳崯杩佺Щ涓?API 鍏煎銆?
-- 璇剧▼鍒悕鏄犲皠锛氱敤浜庢妸涓€绯荤粺/鏂拌鍙风瓑澶氬 code 缁熶竴鍒伴€夎绔欑殑 courses.id
CREATE TABLE IF NOT EXISTS course_aliases (
  system TEXT NOT NULL,
  alias TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (system, alias),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_aliases_course_id ON course_aliases(course_id);

-- 鍏冩暟鎹瓧鍏革紙璁″垝鐢級
CREATE TABLE IF NOT EXISTS meta_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,           -- onesystem / pk / main
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL,       -- string/number/json/...
  nullable INTEGER DEFAULT 1,
  description TEXT DEFAULT '',
  example TEXT DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_fields_unique ON meta_fields(source, field_name);

CREATE TABLE IF NOT EXISTS meta_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,           -- onesystem
  source_field TEXT NOT NULL,
  target TEXT NOT NULL,           -- pk / main / normalized
  target_field TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  transform TEXT DEFAULT ''       -- 绠€瑕佽鏄?瑙勫垯锛堜笉鍋氭墽琛屽紩鎿庯級
);

CREATE INDEX IF NOT EXISTS idx_meta_mappings_source ON meta_mappings(source, source_field);

-- =========================
-- pk 鏁版嵁琛紙涓?pk/crawler/utils/tjSql.py 瀵归綈锛?-- =========================

CREATE TABLE IF NOT EXISTS calendar (
  calendarId INTEGER PRIMARY KEY,
  calendarIdI18n TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS language (
  teachingLanguage TEXT PRIMARY KEY,
  teachingLanguageI18n TEXT,
  calendarId INTEGER
);

CREATE TABLE IF NOT EXISTS coursenature (
  courseLabelId INTEGER PRIMARY KEY,
  courseLabelName TEXT,
  calendarId INTEGER
);

CREATE TABLE IF NOT EXISTS assessment (
  assessmentMode TEXT PRIMARY KEY,
  assessmentModeI18n TEXT,
  calendarId INTEGER
);

CREATE TABLE IF NOT EXISTS campus (
  campus TEXT PRIMARY KEY,
  campusI18n TEXT,
  calendarId INTEGER
);

CREATE TABLE IF NOT EXISTS faculty (
  faculty TEXT PRIMARY KEY,
  facultyI18n TEXT,
  calendarId INTEGER
);

CREATE TABLE IF NOT EXISTS major (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  grade INTEGER,
  name TEXT UNIQUE,
  calendarId INTEGER
);

CREATE INDEX IF NOT EXISTS idx_major_grade ON major(grade);
CREATE INDEX IF NOT EXISTS idx_major_code ON major(code);

-- teaching class
CREATE TABLE IF NOT EXISTS coursedetail (
  id INTEGER PRIMARY KEY,         -- teachingClassId
  code TEXT,
  name TEXT,
  courseLabelId INTEGER,
  assessmentMode TEXT,
  period REAL,
  weekHour REAL,
  campus TEXT,
  number INTEGER,
  elcNumber INTEGER,
  startWeek INTEGER,
  endWeek INTEGER,
  courseCode TEXT,
  courseName TEXT,
  credit REAL,
  teachingLanguage TEXT,
  faculty TEXT,
  calendarId INTEGER,
  newCourseCode TEXT,
  newCode TEXT
);

CREATE INDEX IF NOT EXISTS idx_coursedetail_calendar ON coursedetail(calendarId);
CREATE INDEX IF NOT EXISTS idx_coursedetail_courseCode ON coursedetail(courseCode);
CREATE INDEX IF NOT EXISTS idx_coursedetail_code ON coursedetail(code);
CREATE INDEX IF NOT EXISTS idx_coursedetail_newCourseCode ON coursedetail(newCourseCode);
CREATE INDEX IF NOT EXISTS idx_coursedetail_newCode ON coursedetail(newCode);

CREATE TABLE IF NOT EXISTS teacher (
  id INTEGER PRIMARY KEY,
  teachingClassId INTEGER,
  teacherCode TEXT,
  teacherName TEXT,
  arrangeInfoText TEXT
);

CREATE INDEX IF NOT EXISTS idx_teacher_teachingClassId ON teacher(teachingClassId);

-- deploy-trigger: keep file change minimal so dev deploy workflow can be re-run
CREATE INDEX IF NOT EXISTS idx_teacher_teacherCode ON teacher(teacherCode);
CREATE INDEX IF NOT EXISTS idx_teacher_teacherName ON teacher(teacherName);

CREATE TABLE IF NOT EXISTS teacher_timeslots (
  calendar_id INTEGER NOT NULL,
  teaching_class_id INTEGER NOT NULL,
  occupy_day INTEGER NOT NULL,
  occupy_section INTEGER NOT NULL,
  teacher_code TEXT DEFAULT '',
  teacher_name TEXT DEFAULT '',
  PRIMARY KEY (calendar_id, teaching_class_id, occupy_day, occupy_section, teacher_code, teacher_name)
);

CREATE INDEX IF NOT EXISTS idx_teacher_timeslots_slot ON teacher_timeslots(calendar_id, occupy_day, occupy_section);
CREATE INDEX IF NOT EXISTS idx_teacher_timeslots_class ON teacher_timeslots(teaching_class_id);

CREATE TABLE IF NOT EXISTS majorandcourse (
  majorId INTEGER NOT NULL,
  courseId INTEGER NOT NULL,
  PRIMARY KEY (majorId, courseId)
);

CREATE INDEX IF NOT EXISTS idx_majorandcourse_courseId ON majorandcourse(courseId);

CREATE TABLE IF NOT EXISTS fetchlog (
  fetchTime INTEGER DEFAULT (strftime('%s', 'now')),
  msg TEXT
);
