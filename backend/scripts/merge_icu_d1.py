#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import sqlite3
import shutil
import tempfile
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
import traceback


ROOT = Path(__file__).resolve().parents[3]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_SQL = PROJECT_ROOT / "backend" / "generated" / "merged_d1.sql"
DEFAULT_OUTPUT_DB = PROJECT_ROOT / "backend" / "generated" / "merged_d1.sqlite3"
DEFAULT_REPORT = PROJECT_ROOT / "backend" / "generated" / "merged_d1_report.json"

SUPPORTED_MARKDOWN_HEADINGS = (
    "课程内容：",
    "上课自由度：",
    "考核标准：",
    "授课质量：",
    "教材：",
    "答疑：",
    "课程收获：",
    "对于本课程给学弟学妹的学习建议：",
    "如果你是优，你是怎么拿到的：",
    "作业形式、主要内容和作业评价方式：",
    "考核和成绩占比：",
)


def log_stage(message: str) -> None:
    print(f"[merge_icu_d1] {time.strftime('%Y-%m-%d %H:%M:%S')} {message}", flush=True)


@dataclass
class TeacherInfo:
    pk: int
    name: str
    tid: Optional[str]
    pinyin: Optional[str]
    title: Optional[str]
    department_name: str


@dataclass
class CourseCandidate:
    pk: int
    code: str
    name: str
    department_name: str
    credit: float
    main_teacher_id: Optional[int]
    teacher_group_ids: List[int]
    review_count: int
    review_avg: Optional[float]
    last_semester_id: Optional[int]


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def normalize_course_name(text: str) -> str:
    value = normalize_space(text)
    value = value.replace("（", "(").replace("）", ")")
    return value.casefold()


def normalize_teacher_name(text: str) -> str:
    value = normalize_space(text)
    value = re.sub(r"[·•]", "", value)
    return value.casefold()


def normalize_comment_key(text: str) -> str:
    value = text.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip().casefold()


def escape_sql(value: Optional[str]) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge latest ICU dump into existing D1 SQL dump.")
    parser.add_argument("--source-sql", default=str(ROOT / "output.sql"))
    parser.add_argument("--icu-json", default=str(ROOT / "backup-20260603.json" / "backup-20260603.json"))
    parser.add_argument("--output-sql", default=str(DEFAULT_OUTPUT_SQL))
    parser.add_argument("--output-db", default=str(DEFAULT_OUTPUT_DB))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--skip-sql-dump", action="store_true")
    return parser.parse_args()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_icu_dump(path: Path) -> Dict[str, List[dict]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    grouped: Dict[str, List[dict]] = defaultdict(list)
    for row in rows:
      grouped[row["model"]].append(row)
    return grouped


def build_lookup(rows: Sequence[dict]) -> Dict[int, dict]:
    return {int(row["pk"]): row for row in rows}


def clean_markdown(text: str) -> str:
    value = (text or "").replace("\r\n", "\n").replace("\r", "\n").replace("\u200b", "")
    value = value.replace("~~~", "")
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = value.replace("&lt;br&gt;", "\n").replace("&lt;br/&gt;", "\n").replace("&lt;br /&gt;", "\n")
    value = re.sub(r"<[^>]+>", lambda m: m.group(0).replace("<", "&lt;").replace(">", "&gt;"), value)
    value = value.replace("&lt;br&gt;", "\n").replace("&lt;br/&gt;", "\n").replace("&lt;br /&gt;", "\n")
    value = re.sub(r"~~(.*?)~~", r"\1", value)
    value = re.sub(r"__(.*?)__", r"**\1**", value)
    value = re.sub(r"```+\s*(.*?)\s*```+", r"\1", value, flags=re.S)
    value = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r"[\1](\2)", value)
    value = re.sub(r"^\s*>\s?", "", value, flags=re.MULTILINE)
    value = re.sub(r"(?m)^\s*[-+]\s*$", "", value)
    value = re.sub(r"(?m)^\s*#{1,6}\s*$", "", value)
    value = re.sub(r"(?m)^\s*(\*\*\*|---|___)\s*$", "", value)
    value = re.sub(r"(?m)^\s*-\s*-\s*$", "", value)
    value = re.sub(r"(?m)^(\s*\d+\.\s+)(.+?)(\s+\d+\.\s+.+)+$", lambda m: m.group(0).replace(" 2. ", "\n2. ").replace(" 3. ", "\n3. ").replace(" 4. ", "\n4. ").replace(" 5. ", "\n5. "), value)
    value = re.sub(r"(?m)^(\s*课程名称：.*)&lt;br&gt;", lambda m: m.group(1) + "\n", value)
    value = re.sub(r"\n[ \t]*\n[ \t]*\n+", "\n\n", value)
    value = value.strip()

    for label in SUPPORTED_MARKDOWN_HEADINGS:
        value = re.sub(rf"(?<!\n)({re.escape(label)})", r"\n\n\1", value)
        value = re.sub(rf"({re.escape(label)})([^\n])", r"\1\n\2", value)

    lines = []
    for raw_line in value.split("\n"):
        line = raw_line.rstrip()
        if not line:
            lines.append("")
            continue
        if re.fullmatch(r"\s*#{1,6}\s*", line):
            continue
        lines.append(line)

    value = "\n".join(lines)
    value = re.sub(r"\n{3,}", "\n\n", value).strip()
    return value


def create_db_from_sql(sql_path: Path, db_path: Path) -> sqlite3.Connection:
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA foreign_keys=OFF")
    log_stage(f"loading source SQL into temp sqlite: {sql_path} -> {db_path}")
    execute_sql_file(conn, sql_path)
    conn.execute("PRAGMA foreign_keys=ON")
    log_stage("source SQL loaded")
    return conn


def iter_sql_statements(sql_path: Path) -> Iterable[str]:
    buffer_lines: List[str] = []

    with sql_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            buffer_lines.append(line)
            statement = "".join(buffer_lines).strip()
            if not statement:
                buffer_lines = []
                continue
            if sqlite3.complete_statement(statement):
                yield statement
                buffer_lines = []

    tail = "".join(buffer_lines).strip()
    if tail:
        yield tail


def execute_sql_file(conn: sqlite3.Connection, sql_path: Path, batch_size: int = 2000) -> None:
    cursor = conn.cursor()
    statement_count = 0
    for statement in iter_sql_statements(sql_path):
        try:
            cursor.execute(statement)
        except sqlite3.ProgrammingError:
            log_stage(f"failed SQL statement head: {statement[:240]!r}")
            raise
        statement_count += 1
        if statement_count % batch_size == 0:
            conn.commit()
            log_stage(f"source SQL restore progress: {statement_count} statements")
    conn.commit()
    log_stage(f"source SQL restore finished: {statement_count} statements")


def purge_existing_icu(conn: sqlite3.Connection) -> dict:
    cursor = conn.cursor()
    old_course_rows = cursor.execute("SELECT id, teacher_id FROM courses WHERE is_icu = 1").fetchall()
    old_course_ids = [int(row["id"]) for row in old_course_rows]
    old_teacher_ids = {int(row["teacher_id"]) for row in old_course_rows if row["teacher_id"] is not None}
    old_review_count = cursor.execute("SELECT COUNT(*) FROM reviews WHERE is_icu = 1").fetchone()[0]

    cursor.execute("DELETE FROM reviews WHERE is_icu = 1")
    cursor.execute("DELETE FROM course_aliases WHERE course_id IN (SELECT id FROM courses WHERE is_icu = 1)")
    cursor.execute("DELETE FROM review_likes WHERE review_id NOT IN (SELECT id FROM reviews)")
    cursor.execute("DELETE FROM courses WHERE is_icu = 1")

    if old_teacher_ids:
        placeholders = ",".join("?" for _ in old_teacher_ids)
        cursor.execute(
            f"""
            DELETE FROM teachers
            WHERE id IN ({placeholders})
              AND id NOT IN (SELECT DISTINCT teacher_id FROM courses WHERE teacher_id IS NOT NULL)
            """,
            tuple(old_teacher_ids),
        )

    conn.commit()
    return {
        "deleted_courses": len(old_course_ids),
        "deleted_reviews": int(old_review_count),
        "deleted_teacher_candidates": len(old_teacher_ids),
    }


def load_existing_non_icu_courses(conn: sqlite3.Connection) -> Tuple[Dict[str, List[int]], Dict[str, List[int]]]:
    rows = conn.execute(
        """
        SELECT c.id, c.code, c.name, t.name AS teacher_name
        FROM courses c
        LEFT JOIN teachers t ON t.id = c.teacher_id
        WHERE c.is_icu = 0 OR c.is_icu IS NULL
        """
    ).fetchall()
    by_name_teacher: Dict[str, List[int]] = defaultdict(list)
    by_code_name_teacher: Dict[str, List[int]] = defaultdict(list)
    for row in rows:
        name_key = normalize_course_name(row["name"])
        teacher_key = normalize_teacher_name(row["teacher_name"] or "")
        code_key = normalize_space(row["code"] or "").casefold()
        by_name_teacher[f"{name_key}||{teacher_key}"].append(int(row["id"]))
        by_code_name_teacher[f"{code_key}||{name_key}||{teacher_key}"].append(int(row["id"]))
    return by_name_teacher, by_code_name_teacher


def dedupe_icu_courses(
    course_rows: Sequence[dict],
    review_rows: Sequence[dict],
    teacher_lookup: Dict[int, TeacherInfo],
) -> Tuple[List[CourseCandidate], dict]:
    review_count_by_course: Dict[int, int] = defaultdict(int)
    for row in review_rows:
        review_count_by_course[int(row["fields"]["course"])] += 1

    grouped: Dict[str, List[CourseCandidate]] = defaultdict(list)
    for row in course_rows:
        fields = row["fields"]
        candidate = CourseCandidate(
            pk=int(row["pk"]),
            code=str(fields.get("code") or "").strip(),
            name=str(fields.get("name") or "").strip(),
            department_name="",
            credit=float(fields.get("credit") or 0),
            main_teacher_id=fields.get("main_teacher"),
            teacher_group_ids=list(fields.get("teacher_group") or []),
            review_count=int(review_count_by_course.get(int(row["pk"]), 0)),
            review_avg=float(fields["review_avg"]) if fields.get("review_avg") is not None else None,
            last_semester_id=fields.get("last_semester"),
        )
        teacher_name = normalize_teacher_name(teacher_lookup.get(candidate.main_teacher_id or -1, TeacherInfo(-1, "", None, None, None, "")).name)
        key = f"{normalize_space(candidate.code).casefold()}||{normalize_course_name(candidate.name)}||{teacher_name}"
        grouped[key].append(candidate)

    selected: List[CourseCandidate] = []
    merged_map: Dict[int, int] = {}
    dedupe_count = 0

    for items in grouped.values():
        items.sort(
            key=lambda item: (
                item.review_count,
                item.last_semester_id or 0,
                1 if item.main_teacher_id else 0,
                len(item.teacher_group_ids),
                item.pk,
            ),
            reverse=True,
        )
        winner = items[0]
        selected.append(winner)
        merged_map[winner.pk] = winner.pk
        for extra in items[1:]:
            merged_map[extra.pk] = winner.pk
            dedupe_count += 1

    return selected, {"merged_courses": dedupe_count, "course_redirects": merged_map}


def ensure_teacher(
    conn: sqlite3.Connection,
    teacher: TeacherInfo,
    cache_by_tid: Dict[str, int],
    cache_by_name: Dict[str, List[int]],
) -> int:
    if teacher.tid and teacher.tid in cache_by_tid:
        return cache_by_tid[teacher.tid]

    normalized_name = normalize_teacher_name(teacher.name)
    matched_ids = cache_by_name.get(normalized_name, [])
    if len(matched_ids) == 1:
        teacher_id = matched_ids[0]
        if teacher.tid:
            cache_by_tid[teacher.tid] = teacher_id
        return teacher_id

    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO teachers (tid, name, title, pinyin, department)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            teacher.tid,
            teacher.name,
            teacher.title,
            teacher.pinyin,
            teacher.department_name,
        ),
    )
    teacher_id = int(cursor.lastrowid)
    if teacher.tid:
        cache_by_tid[teacher.tid] = teacher_id
    cache_by_name.setdefault(normalized_name, []).append(teacher_id)
    return teacher_id


def load_existing_teacher_cache(conn: sqlite3.Connection) -> Tuple[Dict[str, int], Dict[str, List[int]]]:
    rows = conn.execute("SELECT id, tid, name FROM teachers").fetchall()
    by_tid: Dict[str, int] = {}
    by_name: Dict[str, List[int]] = defaultdict(list)
    for row in rows:
        if row["tid"]:
            by_tid[str(row["tid"])] = int(row["id"])
        by_name[normalize_teacher_name(row["name"] or "")].append(int(row["id"]))
    return by_tid, by_name


def load_department_lookup(rows: Sequence[dict]) -> Dict[int, str]:
    return {int(row["pk"]): str(row["fields"]["name"]) for row in rows}


def load_semester_lookup(rows: Sequence[dict]) -> Dict[int, str]:
    return {int(row["pk"]): str(row["fields"]["name"]) for row in rows}


def load_teacher_lookup(rows: Sequence[dict], department_lookup: Dict[int, str]) -> Dict[int, TeacherInfo]:
    lookup: Dict[int, TeacherInfo] = {}
    for row in rows:
        fields = row["fields"]
        department_name = department_lookup.get(int(fields["department"]), "") if fields.get("department") else ""
        lookup[int(row["pk"])] = TeacherInfo(
            pk=int(row["pk"]),
            name=str(fields.get("name") or "").strip(),
            tid=str(fields["tid"]).strip() if fields.get("tid") else None,
            pinyin=str(fields["pinyin"]).strip() if fields.get("pinyin") else None,
            title=str(fields["title"]).strip() if fields.get("title") else None,
            department_name=department_name,
        )
    return lookup


def match_existing_course_id(
    candidate: CourseCandidate,
    teacher_lookup: Dict[int, TeacherInfo],
    existing_by_name_teacher: Dict[str, List[int]],
    existing_by_code_name_teacher: Dict[str, List[int]],
) -> Optional[int]:
    teacher_name = teacher_lookup.get(candidate.main_teacher_id or -1, TeacherInfo(-1, "", None, None, None, "")).name
    teacher_key = normalize_teacher_name(teacher_name)
    name_key = normalize_course_name(candidate.name)
    code_key = normalize_space(candidate.code).casefold()

    exact = existing_by_code_name_teacher.get(f"{code_key}||{name_key}||{teacher_key}", [])
    if len(exact) == 1:
        return exact[0]

    merged = existing_by_name_teacher.get(f"{name_key}||{teacher_key}", [])
    if len(merged) == 1:
        return merged[0]
    return None


def build_search_keywords(candidate: CourseCandidate, teacher_lookup: Dict[int, TeacherInfo]) -> str:
    teacher_names = [
        teacher_lookup[teacher_id].name
        for teacher_id in candidate.teacher_group_ids
        if teacher_id in teacher_lookup and teacher_lookup[teacher_id].name
    ]
    pieces = [candidate.code, candidate.name, *teacher_names]
    seen = []
    for item in pieces:
        clean = normalize_space(item)
        if clean and clean not in seen:
            seen.append(clean)
    return " ".join(seen)


def import_courses(
    conn: sqlite3.Connection,
    selected_courses: Sequence[CourseCandidate],
    teacher_lookup: Dict[int, TeacherInfo],
    department_lookup: Dict[int, str],
    course_rows_by_pk: Dict[int, dict],
) -> Tuple[Dict[int, int], dict]:
    teacher_cache_by_tid, teacher_cache_by_name = load_existing_teacher_cache(conn)
    existing_by_name_teacher, existing_by_code_name_teacher = load_existing_non_icu_courses(conn)

    course_pk_to_target_id: Dict[int, int] = {}
    created_courses = 0
    merged_into_existing = 0
    created_teachers = 0
    existing_teacher_ids_before = {row["id"] for row in conn.execute("SELECT id FROM teachers").fetchall()}

    for candidate in selected_courses:
        fields = course_rows_by_pk[candidate.pk]["fields"]
        candidate.department_name = department_lookup.get(int(fields["department"]), "") if fields.get("department") else ""
        teacher = teacher_lookup.get(candidate.main_teacher_id or -1)
        target_course_id = match_existing_course_id(
            candidate,
            teacher_lookup,
            existing_by_name_teacher,
            existing_by_code_name_teacher,
        )

        teacher_id = None
        if teacher:
            teacher_id = ensure_teacher(conn, teacher, teacher_cache_by_tid, teacher_cache_by_name)

        if target_course_id is None:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO courses (
                    code, name, credit, department, teacher_id,
                    review_count, review_avg, search_keywords, is_legacy, is_icu
                )
                VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, 1)
                """,
                (
                    candidate.code,
                    candidate.name,
                    candidate.credit,
                    candidate.department_name,
                    teacher_id,
                    build_search_keywords(candidate, teacher_lookup),
                ),
            )
            target_course_id = int(cursor.lastrowid)
            created_courses += 1
            teacher_name = teacher.name if teacher else ""
            existing_by_name_teacher[f"{normalize_course_name(candidate.name)}||{normalize_teacher_name(teacher_name)}"].append(target_course_id)
            existing_by_code_name_teacher[
                f"{normalize_space(candidate.code).casefold()}||{normalize_course_name(candidate.name)}||{normalize_teacher_name(teacher_name)}"
            ].append(target_course_id)
        else:
            merged_into_existing += 1

        course_pk_to_target_id[candidate.pk] = target_course_id

    existing_teacher_ids_after = {row["id"] for row in conn.execute("SELECT id FROM teachers").fetchall()}
    created_teachers = len(existing_teacher_ids_after - existing_teacher_ids_before)

    return course_pk_to_target_id, {
        "created_courses": created_courses,
        "merged_into_existing_courses": merged_into_existing,
        "created_teachers": created_teachers,
    }


def import_reviews(
    conn: sqlite3.Connection,
    review_rows: Sequence[dict],
    course_redirects: Dict[int, int],
    course_pk_to_target_id: Dict[int, int],
    semester_lookup: Dict[int, str],
) -> dict:
    existing_keys_by_course: Dict[int, set] = defaultdict(set)
    existing_rows = conn.execute(
        "SELECT course_id, semester, rating, score, comment FROM reviews WHERE is_hidden = 0"
    ).fetchall()
    for row in existing_rows:
        key = (
            normalize_comment_key(row["comment"] or ""),
            normalize_space(row["semester"] or ""),
            int(row["rating"] or 0),
            normalize_space(row["score"] or ""),
        )
        existing_keys_by_course[int(row["course_id"])].add(key)

    grouped_reviews: Dict[Tuple[int, Tuple[str, str, int, str]], dict] = {}
    skipped_duplicate_existing = 0
    merged_duplicate_source = 0
    inserted_reviews = 0

    for row in review_rows:
        fields = row["fields"]
        source_course_pk = int(fields["course"])
        redirected_pk = course_redirects.get(source_course_pk, source_course_pk)
        target_course_id = course_pk_to_target_id.get(redirected_pk)
        if target_course_id is None:
            continue

        comment = clean_markdown(str(fields.get("comment") or ""))
        semester = normalize_space(semester_lookup.get(int(fields["semester"]), "")) if fields.get("semester") else ""
        rating = int(fields.get("rating") or 0)
        score = normalize_space(str(fields.get("score") or ""))
        key = (normalize_comment_key(comment), semester, rating, score)
        compound_key = (target_course_id, key)

        row_obj = {
            "target_course_id": target_course_id,
            "semester": semester,
            "rating": rating,
            "comment": comment,
            "score": score,
            "created_at": str(fields.get("created_at") or ""),
            "approve_count": int(fields.get("approve_count") or 0),
            "disapprove_count": int(fields.get("disapprove_count") or 0),
        }

        existing = grouped_reviews.get(compound_key)
        if existing is None:
            grouped_reviews[compound_key] = row_obj
        else:
            merged_duplicate_source += 1
            if row_obj["created_at"] and (not existing["created_at"] or row_obj["created_at"] < existing["created_at"]):
                existing["created_at"] = row_obj["created_at"]
            existing["approve_count"] = max(existing["approve_count"], row_obj["approve_count"])
            existing["disapprove_count"] = max(existing["disapprove_count"], row_obj["disapprove_count"])

    for target_course_id, key in grouped_reviews:
        if key in existing_keys_by_course[target_course_id]:
            skipped_duplicate_existing += 1
            continue
        item = grouped_reviews[(target_course_id, key)]
        created_at_value = None
        if item["created_at"]:
            created_at_value = item["created_at"]
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO reviews (
                course_id, semester, rating, comment, score,
                created_at, approve_count, disapprove_count,
                is_hidden, is_legacy, is_icu, reviewer_name, reviewer_avatar, wallet_user_hash
            )
            VALUES (
                ?, ?, ?, ?, ?,
                COALESCE(strftime('%s', ?), strftime('%s', 'now')), ?, ?,
                0, 0, 1, '', '', NULL
            )
            """,
            (
                item["target_course_id"],
                item["semester"],
                item["rating"],
                item["comment"],
                item["score"] or None,
                created_at_value,
                item["approve_count"],
                item["disapprove_count"],
            ),
        )
        inserted_reviews += 1
        existing_keys_by_course[target_course_id].add(key)

    return {
        "inserted_reviews": inserted_reviews,
        "skipped_duplicate_existing_reviews": skipped_duplicate_existing,
        "merged_duplicate_source_reviews": merged_duplicate_source,
    }


def refresh_all_icu_course_stats(conn: sqlite3.Connection) -> None:
    course_ids = [int(row["id"]) for row in conn.execute("SELECT id FROM courses WHERE is_icu = 1").fetchall()]
    for course_id in course_ids:
        conn.execute(
            """
            UPDATE courses
            SET review_count = (
                    SELECT COUNT(*)
                    FROM reviews
                    WHERE course_id = ? AND is_hidden = 0
                ),
                review_avg = (
                    SELECT AVG(rating)
                    FROM reviews
                    WHERE course_id = ? AND is_hidden = 0 AND rating > 0
                )
            WHERE id = ?
            """,
            (course_id, course_id, course_id),
        )
    conn.commit()


def dump_sql(conn: sqlite3.Connection, output_sql: Path) -> None:
    ensure_parent(output_sql)
    with output_sql.open("w", encoding="utf-8") as fh:
        for line in conn.iterdump():
            fh.write(f"{line}\n")


def atomic_replace(src: Path, dest: Path) -> None:
    ensure_parent(dest)
    tmp_dest = dest.with_suffix(dest.suffix + ".tmp")
    if tmp_dest.exists():
        tmp_dest.unlink()
    log_stage(f"copying artifact: {src} -> {tmp_dest}")
    shutil.copy2(src, tmp_dest)
    log_stage(f"replacing artifact: {tmp_dest} -> {dest}")
    tmp_dest.replace(dest)


def build_report(conn: sqlite3.Connection, purge_stats: dict, course_stats: dict, review_stats: dict, dedupe_stats: dict) -> dict:
    report = {
        "purge": purge_stats,
        "course_import": course_stats,
        "review_import": review_stats,
        "source_dedupe": {
            "merged_courses": dedupe_stats["merged_courses"],
        },
        "result": {
            "icu_courses": conn.execute("SELECT COUNT(*) FROM courses WHERE is_icu = 1").fetchone()[0],
            "icu_reviews": conn.execute("SELECT COUNT(*) FROM reviews WHERE is_icu = 1").fetchone()[0],
            "all_courses": conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0],
            "all_reviews": conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0],
        },
    }
    return report


def main() -> None:
    try:
        args = parse_args()
        source_sql = Path(args.source_sql)
        icu_json = Path(args.icu_json)
        output_sql = Path(args.output_sql)
        output_db = Path(args.output_db)
        report_path = Path(args.report)

        ensure_parent(output_sql)
        ensure_parent(output_db)
        ensure_parent(report_path)

        with tempfile.TemporaryDirectory(prefix="yourtj-merge-icu-") as temp_dir:
            temp_root = Path(temp_dir)
            temp_db = temp_root / "merged_d1.sqlite3"
            temp_sql = temp_root / "merged_d1.sql"
            temp_report = temp_root / "merged_d1_report.json"

            log_stage(f"using temp dir: {temp_root}")
            conn = create_db_from_sql(source_sql, temp_db)
            log_stage("purging legacy ICU rows from D1 snapshot")
            purge_stats = purge_existing_icu(conn)

            log_stage("loading ICU json dump")
            grouped = load_icu_dump(icu_json)
            department_lookup = load_department_lookup(grouped.get("jcourse_api.department", []))
            semester_lookup = load_semester_lookup(grouped.get("jcourse_api.semester", []))
            teacher_lookup = load_teacher_lookup(grouped.get("jcourse_api.teacher", []), department_lookup)

            course_rows = grouped.get("jcourse_api.course", [])
            review_rows = grouped.get("jcourse_api.review", [])
            course_rows_by_pk = build_lookup(course_rows)

            log_stage("deduplicating ICU source courses")
            selected_courses, dedupe_stats = dedupe_icu_courses(course_rows, review_rows, teacher_lookup)
            log_stage(f"importing {len(selected_courses)} ICU courses")
            course_pk_to_target_id, course_stats = import_courses(
                conn,
                selected_courses,
                teacher_lookup,
                department_lookup,
                course_rows_by_pk,
            )
            log_stage(f"importing {len(review_rows)} ICU reviews")
            review_stats = import_reviews(
                conn,
                review_rows,
                dedupe_stats["course_redirects"],
                course_pk_to_target_id,
                semester_lookup,
            )
            log_stage("refreshing ICU course stats")
            refresh_all_icu_course_stats(conn)
            report = build_report(conn, purge_stats, course_stats, review_stats, dedupe_stats)
            temp_report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            log_stage("committing sqlite changes")
            conn.commit()
            conn.close()
            log_stage(f"temp sqlite size={os.path.getsize(temp_db)} bytes")

            atomic_replace(temp_db, output_db)
            atomic_replace(temp_report, report_path)
            if not args.skip_sql_dump:
                log_stage("dumping merged sqlite to SQL")
                dump_conn = sqlite3.connect(temp_db)
                dump_sql(dump_conn, temp_sql)
                dump_conn.close()
                atomic_replace(temp_sql, output_sql)

        log_stage("merge completed")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception:
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
