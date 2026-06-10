DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS review_reports;
DROP TABLE IF EXISTS review_likes;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS course_aliases;

-- pk (排课模拟器) 数据域
DROP TABLE IF EXISTS majorandcourse;
DROP TABLE IF EXISTS teacher_timeslots;
DROP TABLE IF EXISTS teacher;
DROP TABLE IF EXISTS coursedetail;
DROP TABLE IF EXISTS major;
DROP TABLE IF EXISTS faculty;
DROP TABLE IF EXISTS campus;
DROP TABLE IF EXISTS assessment;
DROP TABLE IF EXISTS coursenature;
DROP TABLE IF EXISTS language;
DROP TABLE IF EXISTS calendar;
DROP TABLE IF EXISTS fetchlog;

DROP TABLE IF EXISTS meta_mappings;
DROP TABLE IF EXISTS meta_fields;

-- 课程类别
CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- 教师表
CREATE TABLE teachers (
    id INTEGER PRIMARY KEY,
    tid TEXT,
    name TEXT NOT NULL,
    title TEXT,
    pinyin TEXT,
    department TEXT
);

-- 课程表
CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    credit REAL DEFAULT 0,
    department TEXT,
    teacher_id INTEGER,
    review_count INTEGER DEFAULT 0,
    review_avg REAL DEFAULT 0,
    search_keywords TEXT,
    is_legacy INTEGER DEFAULT 0,
    is_icu INTEGER DEFAULT 0,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

-- 评价表
CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    semester TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 5),
    comment TEXT,
    score TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    approve_count INTEGER DEFAULT 0,
    disapprove_count INTEGER DEFAULT 0,
    is_hidden BOOLEAN DEFAULT 0,
    is_legacy INTEGER DEFAULT 0,
    is_icu INTEGER DEFAULT 0,
    reviewer_name TEXT DEFAULT '',
    reviewer_avatar TEXT DEFAULT '',
    wallet_user_hash TEXT,
    edit_token TEXT,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- 点赞记录（用于 UI 与防刷；积分结算由 Credit(Turso) 侧负责）
CREATE TABLE review_likes (
    review_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (review_id, client_id),
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);
CREATE INDEX idx_review_likes_review_id ON review_likes(review_id);
CREATE INDEX idx_review_likes_client_id ON review_likes(client_id);

-- 评价举报记录（App Store UGC 合规）
CREATE TABLE review_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    admin_note TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    resolved_at INTEGER,
    UNIQUE(review_id, client_id),
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);
CREATE INDEX idx_review_reports_review_id ON review_reports(review_id);
CREATE INDEX idx_review_reports_status ON review_reports(status);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 默认设置：乌龙茶评论不显示
INSERT OR IGNORE INTO settings (key, value) VALUES ('show_legacy_reviews', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance_mode', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance_config', '');

-- 索引
CREATE INDEX idx_courses_code ON courses(code);
CREATE INDEX idx_courses_search ON courses(search_keywords);
CREATE INDEX idx_courses_legacy ON courses(is_legacy);
CREATE INDEX idx_courses_icu ON courses(is_icu);
CREATE INDEX idx_reviews_course ON reviews(course_id);
CREATE INDEX idx_reviews_created ON reviews(created_at);
CREATE INDEX idx_reviews_legacy ON reviews(is_legacy);
CREATE INDEX idx_reviews_icu ON reviews(is_icu);

-- =========================
-- 课程别名映射（用于一系统/新课号等多套 code 统一到 courses.id）
-- =========================
CREATE TABLE course_aliases (
    system TEXT NOT NULL,
    alias TEXT NOT NULL,
    course_id INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (system, alias),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX idx_course_aliases_course_id ON course_aliases(course_id);

-- =========================
-- 元数据字典（计划用）
-- =========================
CREATE TABLE meta_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_type TEXT NOT NULL,
    nullable INTEGER DEFAULT 1,
    description TEXT DEFAULT '',
    example TEXT DEFAULT ''
);
CREATE UNIQUE INDEX idx_meta_fields_unique ON meta_fields(source, field_name);

CREATE TABLE meta_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_field TEXT NOT NULL,
    target TEXT NOT NULL,
    target_field TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    transform TEXT DEFAULT ''
);
CREATE INDEX idx_meta_mappings_source ON meta_mappings(source, source_field);

-- =========================
-- pk (排课模拟器) 数据域（与 pk/crawler/utils/tjSql.py 对齐）
-- =========================
CREATE TABLE calendar (
    calendarId INTEGER PRIMARY KEY,
    calendarIdI18n TEXT
);

CREATE TABLE language (
    teachingLanguage TEXT PRIMARY KEY,
    teachingLanguageI18n TEXT,
    calendarId INTEGER
);

CREATE TABLE coursenature (
    courseLabelId INTEGER PRIMARY KEY,
    courseLabelName TEXT,
    calendarId INTEGER
);

-- Per-semester course nature mapping (avoid overwriting between semesters)
CREATE TABLE IF NOT EXISTS coursenature_by_calendar (
    calendarId INTEGER NOT NULL,
    courseLabelId INTEGER NOT NULL,
    courseLabelName TEXT,
    PRIMARY KEY (calendarId, courseLabelId)
);
CREATE INDEX IF NOT EXISTS idx_coursenature_by_calendar_calendar ON coursenature_by_calendar(calendarId);
CREATE INDEX IF NOT EXISTS idx_coursenature_by_calendar_label ON coursenature_by_calendar(courseLabelId);

CREATE TABLE assessment (
    assessmentMode TEXT PRIMARY KEY,
    assessmentModeI18n TEXT,
    calendarId INTEGER
);

CREATE TABLE campus (
    campus TEXT PRIMARY KEY,
    campusI18n TEXT,
    calendarId INTEGER
);

CREATE TABLE faculty (
    faculty TEXT PRIMARY KEY,
    facultyI18n TEXT,
    calendarId INTEGER
);

CREATE TABLE major (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    grade INTEGER,
    name TEXT UNIQUE,
    calendarId INTEGER
);
CREATE INDEX idx_major_grade ON major(grade);
CREATE INDEX idx_major_code ON major(code);

CREATE TABLE coursedetail (
    id INTEGER PRIMARY KEY,
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
CREATE INDEX idx_coursedetail_calendar ON coursedetail(calendarId);
CREATE INDEX idx_coursedetail_courseCode ON coursedetail(courseCode);
CREATE INDEX idx_coursedetail_code ON coursedetail(code);
CREATE INDEX idx_coursedetail_newCourseCode ON coursedetail(newCourseCode);
CREATE INDEX idx_coursedetail_newCode ON coursedetail(newCode);

CREATE TABLE teacher (
    id INTEGER PRIMARY KEY,
    teachingClassId INTEGER,
    teacherCode TEXT,
    teacherName TEXT,
    arrangeInfoText TEXT
);
CREATE INDEX idx_teacher_teachingClassId ON teacher(teachingClassId);
CREATE INDEX idx_teacher_teacherCode ON teacher(teacherCode);
CREATE INDEX idx_teacher_teacherName ON teacher(teacherName);

CREATE TABLE teacher_timeslots (
    calendar_id INTEGER NOT NULL,
    teaching_class_id INTEGER NOT NULL,
    occupy_day INTEGER NOT NULL,
    occupy_section INTEGER NOT NULL,
    teacher_code TEXT DEFAULT '',
    teacher_name TEXT DEFAULT '',
    PRIMARY KEY (calendar_id, teaching_class_id, occupy_day, occupy_section, teacher_code, teacher_name)
);
CREATE INDEX idx_teacher_timeslots_slot ON teacher_timeslots(calendar_id, occupy_day, occupy_section);
CREATE INDEX idx_teacher_timeslots_class ON teacher_timeslots(teaching_class_id);

CREATE TABLE majorandcourse (
    majorId INTEGER NOT NULL,
    courseId INTEGER NOT NULL,
    PRIMARY KEY (majorId, courseId)
);
CREATE INDEX idx_majorandcourse_courseId ON majorandcourse(courseId);

CREATE TABLE fetchlog (
    fetchTime INTEGER DEFAULT (strftime('%s', 'now')),
    msg TEXT
);
