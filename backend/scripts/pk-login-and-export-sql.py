import argparse
import os
import pathlib
import sys
import time
import traceback

try:
    import requests
except Exception as e:
    print("Missing python dependency: requests")
    print(str(e))
    print("Install:")
    print("  python -m pip install requests")
    raise SystemExit(1)


def sql_quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        # Keep NaN/inf out of SQL
        if isinstance(value, float) and (value != value or value == float("inf") or value == float("-inf")):
            return "NULL"
        return str(value)
    s = str(value)
    s = s.replace("\x00", "")
    s = s.replace("'", "''")
    return "'" + s + "'"


def parse_major_string(major: str):
    name = str(major or "").strip()
    grade = None
    grade_raw = name[:4]
    if grade_raw.isdigit():
        grade = int(grade_raw)

    code = None
    # Example: "2025(03074 土木工程(国际班))"
    import re

    # Example:
    # - "2025(03074 土木工程(国际班))"
    # - "2025(WF00020204 ... )"
    # We want to capture the leading major code inside the first parentheses.
    m = re.search(r"\(([0-9A-Za-z]{3,16})\s", name)
    if m:
        code = m.group(1)

    return {"grade": grade, "code": code, "name": name}


def compute_new_code(course: dict):
    new_course_code = str(course.get("newCourseCode") or "").strip() or None
    if not new_course_code:
        return (None, None)

    code = str(course.get("code") or "").strip()
    course_code = str(course.get("courseCode") or "").strip()
    if not code or not course_code or not code.startswith(course_code) or len(code) < 2:
        return (new_course_code, None)

    suffix = code[-2:]
    return (new_course_code, (new_course_code + suffix) if suffix else None)


def ensure_config_copy(config_path: pathlib.Path):
    # pk crawler utilities hard-code "config.ini"
    if config_path.name == "config.ini":
        return config_path

    tmp = config_path.parent / "config.ini"
    try:
        content = config_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = config_path.read_text(encoding="gbk")
    tmp.write_text(content, encoding="utf-8")
    return tmp


def disable_proxy_env():
    # GitHub runners (or user environments) may have proxy env vars set; requests will honor them by default.
    # Onesystem login is sensitive to proxies and may fail unpredictably, so we disable them explicitly.
    for key in [
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
    ]:
        os.environ.pop(key, None)


def fetch_manual_arrange_page(session: requests.Session, calendar_id: int, page_num: int, page_size: int):
    payload = {
        "condition": {
            "trainingLevel": "",
            "campus": "",
            "calendar": calendar_id,
            "college": "",
            "course": "",
            "ids": [],
            "isChineseTeaching": None,
        },
        "pageNum_": page_num,
        "pageSize_": page_size,
    }

    url = "https://1.tongji.edu.cn/api/arrangementservice/manualArrange/page?profile"
    headers = {
        "Content-Type": "application/json",
        "Referer": "https://1.tongji.edu.cn/taskResultQuery",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    }
    last_err = None
    for attempt in range(1, 6):
        try:
            res = session.post(url, json=payload, headers=headers, timeout=120)
            if res.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"HTTP {res.status_code}", response=res)
            res.raise_for_status()
            return res.json()
        except Exception as e:
            last_err = e
            sleep_s = min(10, 1 + attempt * 2)
            print(
                f"[warn] manualArrange/page failed (calendarId={calendar_id} page={page_num} attempt={attempt}): {e}. retry in {sleep_s}s",
                file=sys.stderr,
            )
            time.sleep(sleep_s)
    raise last_err  # type: ignore[misc]


def main() -> int:
    disable_proxy_env()

    parser = argparse.ArgumentParser(
        description="Login to Onesystem then export SQL files for syncing pk tables into D1 (for GitHub Actions)."
    )
    parser.add_argument("--calendarId", "--calendar", dest="calendar_id", type=int, required=True, help="Calendar id, e.g. 121")
    parser.add_argument("--depth", type=int, default=1, help="Sync depth")
    parser.add_argument("--page-size", type=int, default=200, help="Page size used by onesystem API")
    parser.add_argument("--out-dir", default=".tmp/pk-sync", help="Output directory for generated SQL files (relative to backend/)")
    parser.add_argument(
        "--config",
        default=str(pathlib.Path(__file__).resolve().parents[1] / "config.onesystem.ini"),
        help="Path to config.ini used by pk crawler login",
    )
    args = parser.parse_args()

    if args.calendar_id <= 0:
        print("Invalid --calendarId")
        return 1

    depth = max(1, int(args.depth))

    repo_root = pathlib.Path(__file__).resolve().parents[2]  # .../main
    pk_crawler_dir = pathlib.Path(__file__).resolve().parent / "pk_crawler"
    if not pk_crawler_dir.exists():
        print(f"Cannot find pk crawler runtime at: {pk_crawler_dir}")
        print("Expected folder: backend/scripts/pk_crawler/utils (vendored from pk project)")
        return 1

    config_path = pathlib.Path(args.config).resolve()
    if not config_path.exists():
        print("Missing config file for login.")
        print(f"Expected: {config_path}")
        print("Create it based on: backend/config.onesystem.example.ini (DO NOT COMMIT secrets)")
        return 1

    os.chdir(str(config_path.parent))
    ensure_config_copy(config_path)

    sys.path.insert(0, str(pk_crawler_dir))
    try:
        from utils import loginout  # type: ignore
    except Exception as e:
        print("Failed to import pk crawler login utilities.")
        print(str(e))
        traceback.print_exc()
        return 1

    try:
        session = loginout.login()
    except Exception as e:
        print("Login crashed.")
        print(str(e))
        traceback.print_exc()
        return 1
    if session is None:
        print("Login failed.")
        return 1

    out_dir = pathlib.Path(repo_root / "backend" / args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    calendar_ids = list(range(args.calendar_id - depth + 1, args.calendar_id + 1))
    summary = {"calendarIds": calendar_ids, "files": []}

    for cid in calendar_ids:
        t0 = time.time()
        first = fetch_manual_arrange_page(session, cid, 1, args.page_size)
        total = int(((first.get("data") or {}).get("total_") or 0))
        first_list = (first.get("data") or {}).get("list") or []
        if not isinstance(first_list, list):
            first_list = []

        total_pages = (total // args.page_size) + 1
        courses = list(first_list)
        for page in range(2, total_pages + 1):
            nxt = fetch_manual_arrange_page(session, cid, page, args.page_size)
            lst = (nxt.get("data") or {}).get("list") or []
            if isinstance(lst, list) and lst:
                courses.extend(lst)

        # generate sql
        file_path = out_dir / f"pk-sync-{cid}.sql"
        seen_language = set()
        seen_course_nature = set()
        seen_assessment = set()
        seen_campus = set()
        seen_faculty = set()
        seen_major = set()

        with file_path.open("w", encoding="utf-8", newline="\n") as f:
            f.write("-- generated by pk-login-and-export-sql.py\n")
            # NOTE: Cloudflare D1 (via wrangler d1 execute) does not allow explicit BEGIN/COMMIT statements.
            # Keep this file as plain sequential SQL statements.

            # Clear only this calendar data to avoid duplicates/stale rows (keep other semesters).
            f.write(f"DELETE FROM teacher_timeslots WHERE calendar_id = {cid};\n")
            f.write(f"DELETE FROM teacher WHERE teachingClassId IN (SELECT id FROM coursedetail WHERE calendarId = {cid});\n")
            f.write(f"DELETE FROM majorandcourse WHERE courseId IN (SELECT id FROM coursedetail WHERE calendarId = {cid});\n")
            f.write(f"DELETE FROM coursedetail WHERE calendarId = {cid};\n")
            f.write(f"DELETE FROM calendar WHERE calendarId = {cid};\n")
            f.write(f"DELETE FROM coursenature_by_calendar WHERE calendarId = {cid};\n")
            f.write("DELETE FROM settings WHERE key = 'pk_aux_schema_version';\n")

            inserted = 0
            for course in courses:
                if not isinstance(course, dict):
                    continue

                calendar_i18n = str(course.get("calendarIdI18n") or "").strip() or None
                f.write(
                    f"INSERT OR REPLACE INTO calendar (calendarId, calendarIdI18n) VALUES ({cid}, {sql_quote(calendar_i18n)});\n"
                )

                teaching_language = str(course.get("teachingLanguage") or "").strip() or None
                teaching_language_i18n = str(course.get("teachingLanguageI18n") or "").strip() or None
                if teaching_language and teaching_language not in seen_language:
                    seen_language.add(teaching_language)
                    f.write(
                        "INSERT INTO language (teachingLanguage, teachingLanguageI18n, calendarId) "
                        f"VALUES ({sql_quote(teaching_language)}, {sql_quote(teaching_language_i18n)}, {cid}) "
                        "ON CONFLICT(teachingLanguage) DO UPDATE SET "
                        "teachingLanguageI18n=excluded.teachingLanguageI18n, calendarId=excluded.calendarId;\n"
                    )

                course_label_id = course.get("courseLabelId")
                try:
                    course_label_id_i = int(course_label_id) if course_label_id is not None else None
                except Exception:
                    course_label_id_i = None
                course_label_name = str(course.get("courseLabelName") or "").strip() or None
                if course_label_id_i is not None and course_label_id_i not in seen_course_nature:
                    seen_course_nature.add(course_label_id_i)
                    f.write(
                        "INSERT INTO coursenature_by_calendar (calendarId, courseLabelId, courseLabelName) "
                        f"VALUES ({cid}, {course_label_id_i}, {sql_quote(course_label_name)}) "
                        "ON CONFLICT(calendarId, courseLabelId) DO UPDATE SET "
                        "courseLabelName=excluded.courseLabelName;\n"
                    )

                assessment_mode = str(course.get("assessmentMode") or "").strip() or None
                assessment_mode_i18n = str(course.get("assessmentModeI18n") or "").strip() or None
                if assessment_mode and assessment_mode not in seen_assessment:
                    seen_assessment.add(assessment_mode)
                    f.write(
                        "INSERT INTO assessment (assessmentMode, assessmentModeI18n, calendarId) "
                        f"VALUES ({sql_quote(assessment_mode)}, {sql_quote(assessment_mode_i18n)}, {cid}) "
                        "ON CONFLICT(assessmentMode) DO UPDATE SET "
                        "assessmentModeI18n=excluded.assessmentModeI18n, calendarId=excluded.calendarId;\n"
                    )

                campus = str(course.get("campus") or "").strip() or None
                campus_i18n = str(course.get("campusI18n") or "").strip() or None
                if campus and campus not in seen_campus:
                    seen_campus.add(campus)
                    f.write(
                        "INSERT INTO campus (campus, campusI18n, calendarId) "
                        f"VALUES ({sql_quote(campus)}, {sql_quote(campus_i18n)}, {cid}) "
                        "ON CONFLICT(campus) DO UPDATE SET "
                        "campusI18n=excluded.campusI18n, calendarId=excluded.calendarId;\n"
                    )

                faculty = str(course.get("faculty") or "").strip() or None
                faculty_i18n = str(course.get("facultyI18n") or "").strip() or None
                if faculty and faculty not in seen_faculty:
                    seen_faculty.add(faculty)
                    f.write(
                        "INSERT INTO faculty (faculty, facultyI18n, calendarId) "
                        f"VALUES ({sql_quote(faculty)}, {sql_quote(faculty_i18n)}, {cid}) "
                        "ON CONFLICT(faculty) DO UPDATE SET "
                        "facultyI18n=excluded.facultyI18n, calendarId=excluded.calendarId;\n"
                    )

                majors = course.get("majorList") or []
                if isinstance(majors, list):
                    for mj in majors:
                        mj_name = str(mj or "").strip()
                        if not mj_name or mj_name in seen_major:
                            continue
                        seen_major.add(mj_name)
                        parsed = parse_major_string(mj_name)
                        f.write(
                            "INSERT INTO major (code, grade, name, calendarId) "
                            f"VALUES ({sql_quote(parsed['code'])}, {sql_quote(parsed['grade'])}, {sql_quote(parsed['name'])}, {cid}) "
                            "ON CONFLICT(name) DO UPDATE SET "
                            "code=excluded.code, grade=excluded.grade, calendarId=excluded.calendarId;\n"
                        )

                teaching_class_id = course.get("id")
                try:
                    teaching_class_id_i = int(teaching_class_id) if teaching_class_id is not None else None
                except Exception:
                    teaching_class_id_i = None
                if teaching_class_id_i is None:
                    continue

                new_course_code, new_code = compute_new_code(course)

                f.write(
                    "INSERT OR REPLACE INTO coursedetail "
                    "(id, code, name, courseLabelId, assessmentMode, period, weekHour, campus, number, elcNumber, startWeek, endWeek, "
                    "courseCode, courseName, credit, teachingLanguage, faculty, calendarId, newCourseCode, newCode) VALUES ("
                    f"{teaching_class_id_i}, "
                    f"{sql_quote(str(course.get('code') or '').strip() or None)}, "
                    f"{sql_quote(str(course.get('name') or '').strip() or None)}, "
                    f"{sql_quote(course_label_id_i)}, "
                    f"{sql_quote(assessment_mode)}, "
                    f"{sql_quote(course.get('period'))}, "
                    f"{sql_quote(course.get('weekHour'))}, "
                    f"{sql_quote(campus)}, "
                    f"{sql_quote(course.get('number'))}, "
                    f"{sql_quote(course.get('elcNumber'))}, "
                    f"{sql_quote(course.get('startWeek'))}, "
                    f"{sql_quote(course.get('endWeek'))}, "
                    f"{sql_quote(str(course.get('courseCode') or '').strip() or None)}, "
                    f"{sql_quote(str(course.get('courseName') or '').strip() or None)}, "
                    f"{sql_quote(course.get('credits'))}, "
                    f"{sql_quote(teaching_language)}, "
                    f"{sql_quote(faculty)}, "
                    f"{cid}, "
                    f"{sql_quote(new_course_code)}, "
                    f"{sql_quote(new_code)}"
                    ");\n"
                )

                arrange_info = str(course.get("arrangeInfo") or "").strip() or None
                teachers = course.get("teacherList") or []
                if isinstance(teachers, list):
                    for t in teachers:
                        if not isinstance(t, dict):
                            continue
                        tid = t.get("id")
                        try:
                            tid_i = int(tid) if tid is not None else None
                        except Exception:
                            tid_i = None
                        if tid_i is None:
                            continue
                        f.write(
                            "INSERT OR REPLACE INTO teacher (id, teachingClassId, teacherCode, teacherName, arrangeInfoText) VALUES ("
                            f"{tid_i}, {teaching_class_id_i}, "
                            f"{sql_quote(str(t.get('teacherCode') or '').strip() or None)}, "
                            f"{sql_quote(str(t.get('teacherName') or '').strip() or None)}, "
                            f"{sql_quote(arrange_info)}"
                            ");\n"
                        )

                if isinstance(majors, list):
                    for mj in majors:
                        mj_name = str(mj or "").strip()
                        if not mj_name:
                            continue
                        f.write(
                            "INSERT OR IGNORE INTO majorandcourse (majorId, courseId) VALUES ("
                            f"(SELECT id FROM major WHERE name = {sql_quote(mj_name)}), {teaching_class_id_i}"
                            ");\n"
                        )

                inserted += 1

            f.write(
                "INSERT INTO fetchlog (fetchTime, msg) VALUES "
                f"({int(time.time())}, {sql_quote(f'sync calendarId={cid} via action')});\n"
            )
            # end

        elapsed = int(time.time() - t0)
        print(f"calendarId={cid} teachingClassInserted={inserted} elapsed={elapsed}s file={file_path}")
        summary["files"].append({"calendarId": cid, "file": str(file_path), "teachingClassInserted": inserted, "elapsedSec": elapsed})

    # Print a machine-readable summary for workflow parsing
    import json

    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
