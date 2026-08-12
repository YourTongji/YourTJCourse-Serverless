#!/usr/bin/env python3
"""Export legacy course data from the D1 backup SQLite into a Hub course-import
manifest package (courses/instructors/offerings/reviews JSONL + manifest.yaml).

Designed for YourTJ-Hub issue #183 (course-review legacy data migration):
the exported package is consumed by the Hub `course-import` CLI
(apps/gooseforum/app/console/cmd/courseImport.go), which requires:

  - manifest.yaml with schema_version=1, source, source_commit, exported_at,
    rights_approval_ref, files (name -> sha256), counts
  - courses.jsonl:   {"id","code","name","department","credit","aliases"}
  - instructors.jsonl: {"id","name","department","title"}
  - offerings.jsonl: {"id","course_id","term","campus","faculty","instructor_ids"}
  - reviews.jsonl:   {"offering_external_id","rating","content","created_at",
                      "legacy_helpful_count"}  (only these 5 fields are consumed)

Privacy: wallet_user_hash / edit_token / reviewer_name / reviewer_avatar are
NOT exported.  The Hub importer renders every imported review as an anonymous
legacy review (author_user_id=0, is_anonymous=true), so no PII crosses the
boundary.

Determinism: every JSONL row is emitted in stable order (sorted by the
external id), so re-running the export over the same database yields
byte-identical files and sha256 checksums (idempotent re-export).

Usage:
  python3 backend/scripts/export_legacy_course_package.py \
      --input backup.sqlite3 \
      --output export-course-package \
      --source yourtj-serverless \
      --source-commit <upstream commit> \
      --rights-approval-ref <issue/record id>

Options:
  --dry-run          validate and report counts only; do not write files
  --limit N          export at most N courses (and their dependent rows)
  --semester-variants  also write semester-variants.txt (always written unless --dry-run)
"""

import argparse
import hashlib
import json
import pathlib
import sqlite3
import sys
from datetime import datetime, timezone

MANIFEST_SCHEMA_VERSION = 1

# ---------------------------------------------------------------------------
# helpers


def term_code(calendar_i18n: str) -> str:
    """Map an upstream semester label to a Hub term code.

    Accepts '2024-2025学年第1学期' / '2024-2025-1' / '2024-2025第1学期' and
    normalizes to 'YYYY-YYYY-N'.  Unmatched input is returned unchanged (the
    Hub importer accepts any non-empty term code, so a variant is preserved
    rather than dropped).
    """
    import re

    s = str(calendar_i18n or "").strip()
    if not s:
        return ""
    m = re.match(r"^(\d{4})-(\d{4})(?:学年第|[-])(\d+)(?:学期)?$", s)
    if not m:
        return s
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


def review_semester_term(semester: str) -> str:
    """Normalize a free-form reviews.semester value to a term code (same rule
    as term_code; unmatched variants are preserved and reported)."""
    return term_code(semester)


def iso8601(unix_ts) -> str:
    """Convert an integer unix timestamp to an RFC3339 UTC string.

    Upstream stores created_at as strftime('%s'); the Hub importer requires
    RFC3339.  Null / empty values are emitted as an empty string and will be
    quarantined by the importer (created_at is validated there), which is the
    intended behaviour for rows we cannot faithfully timestamp.
    """
    if unix_ts is None:
        return ""
    try:
        ts = int(unix_ts)
    except (TypeError, ValueError):
        return ""
    if ts <= 0:
        return ""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# row builders


def build_courses(conn: sqlite3.Connection, limit: int | None):
    """courses.jsonl rows: upstream `courses` joined with course_aliases.

    External id = upstream courses.id (integer as string).
    aliases = all course_aliases.alias values for the course.
    """
    sql = """
        SELECT c.id, c.code, c.name, c.department, c.credit
        FROM courses c
        ORDER BY c.id
        LIMIT ?
    """
    rows = conn.execute(sql, (limit or -1,)).fetchall()
    alias_rows = conn.execute(
        """
        SELECT course_id, alias
        FROM course_aliases
        ORDER BY course_id, alias
        """
    ).fetchall()
    aliases_by_course: dict[int, list[str]] = {}
    for course_id, alias in alias_rows:
        aliases_by_course.setdefault(course_id, []).append(alias)

    out = []
    for cid, code, name, department, credit in rows:
        code = (code or "").strip()
        name = (name or "").strip()
        if not code or not name:
            # required by importer validateRows (missing code or name -> quarantine)
            continue
        row = {
            "id": str(cid),
            "code": code,
            "name": name,
            "department": (department or "").strip(),
            "credit": float(credit or 0),
        }
        aliases = aliases_by_course.get(cid, [])
        if aliases:
            row["aliases"] = aliases
        out.append(row)
    return out


def build_instructors(conn: sqlite3.Connection, limit: int | None):
    """instructors.jsonl rows: upstream `teachers` table."""
    sql = """
        SELECT id, name, department, title
        FROM teachers
        ORDER BY id
        LIMIT ?
    """
    rows = conn.execute(sql, (limit or -1,)).fetchall()
    out = []
    for tid, name, department, title in rows:
        name = (name or "").strip()
        if not name:
            continue
        out.append(
            {
                "id": str(tid),
                "name": name,
                "department": (department or "").strip(),
                "title": (title or "").strip(),
            }
        )
    return out


def build_offerings(conn: sqlite3.Connection, courses, limit: int | None):
    """offerings.jsonl rows: upstream `coursedetail` (one row per teaching
    class) joined with `teacher` (per teaching class).

    course_id: the courses.jsonl external id (upstream courses.id) resolved via
    course_aliases (courseCode -> courses.code -> courses.id).  Teaching
    classes whose courseCode cannot be resolved are skipped (the Hub importer
    would quarantine an offering with an unknown course_id anyway).

    term: derived from calendar.calendarIdI18n via term_code().
    """
    course_id_by_code: dict[str, str] = {}
    for c in courses:
        course_id_by_code[c["code"]] = c["id"]
    for c in courses:
        for alias in c.get("aliases", []):
            course_id_by_code.setdefault(alias, c["id"])

    # coursd detail rows, ordered by id
    sql = """
        SELECT id, code, courseCode, name, courseName, campus, faculty, calendarId
        FROM coursedetail
        ORDER BY id
        LIMIT ?
    """
    cd_rows = conn.execute(sql, (limit or -1,)).fetchall()

    # teacher rows per teaching class
    teacher_rows = conn.execute(
        """
        SELECT teachingClassId, id, teacherCode, teacherName
        FROM teacher
        ORDER BY teachingClassId, id
        """
    ).fetchall()
    teachers_by_class: dict[int, list[dict]] = {}
    for class_id, tid, tcode, tname in teacher_rows:
        teachers_by_class.setdefault(class_id, []).append(
            {"id": str(tid), "code": (tcode or "").strip(), "name": (tname or "").strip()}
        )

    # calendar i18n (semester label)
    cal_rows = conn.execute(
        "SELECT calendarId, calendarIdI18n FROM calendar ORDER BY calendarId"
    ).fetchall()
    cal_i18n = {cid: (i18n or "") for cid, i18n in cal_rows}

    out = []
    for cd_id, code, course_code, name, course_name, campus, faculty, calendar_id in cd_rows:
        course_code = (course_code or "").strip()
        # resolve course external id: primary courseCode first, then fall back
        # to the class-level code (code) — mirrors upstream course_aliases.
        ext_course_id = course_id_by_code.get(course_code)
        if ext_course_id is None and code:
            ext_course_id = course_id_by_code.get(code.strip())
        if ext_course_id is None:
            continue

        term = term_code(cal_i18n.get(calendar_id, ""))
        instructors = teachers_by_class.get(cd_id, [])
        row = {
            "id": str(cd_id),
            "course_id": ext_course_id,
            "term": term,
            "campus": (campus or "").strip(),
            "faculty": (faculty or "").strip(),
        }
        if instructors:
            row["instructor_ids"] = [t["id"] for t in instructors]
        out.append(row)
    return out


def build_reviews(conn: sqlite3.Connection, offerings, limit: int | None):
    """reviews.jsonl rows: upstream `reviews` mapped onto exported offerings.

    Design decision (issue #183, needs PRD confirmation): upstream reviews hang
    on courses.id while the Hub importer attaches reviews to an offering
    (offering_external_id) and allows at most one legacy review per offering.
    We therefore attach each course's reviews to its first exported offering
    (in course id / offering id order) and merge them into a single row per
    offering:

      - rating: average of the course's ratings (0 ratings excluded), rounded
        to the nearest integer; a course with only rating-0 reviews emits
        rating 0, which the Hub importer maps to NULL (not counted).
      - content: concatenated review comments, newline-joined, non-empty ones
        only (cap length defensively).
      - created_at: earliest review timestamp of the course.
      - legacy_helpful_count: sum of approve_count + disapprove_count
        (issue #183 lists approve_count; the field semantic is confirm-Q4).

    review_likes / review_reports / reviewer_name / reviewer_avatar /
    wallet_user_hash / edit_token are NOT exported.
    """
    # course_id -> list of reviews (ordered by created_at, id)
    sql = """
        SELECT id, course_id, rating, comment, created_at, approve_count, disapprove_count
        FROM reviews
        WHERE is_hidden = 0
        ORDER BY course_id, created_at, id
        LIMIT ?
    """
    rows = conn.execute(sql, (limit or -1,)).fetchall()
    reviews_by_course: dict[int, list[dict]] = {}
    for rid, course_id, rating, comment, created_at, approve, disapprove in rows:
        rating = int(rating or 0)
        comment = (comment or "").strip()
        if not comment:
            # importer quarantines empty content? no: content is not validated
            # for emptiness, but an empty review adds no value; keep it anyway
            # to preserve counts (comment may be empty upstream).
            pass
        reviews_by_course.setdefault(course_id, []).append(
            {
                "id": rid,
                "rating": rating,
                "comment": comment,
                "created_at": iso8601(created_at),
                "approve": int(approve or 0),
                "disapprove": int(disapprove or 0),
            }
        )

    # offering external id -> course_id (first offering per course, in
    # offering id order — the offering list is already ordered).
    offering_for_course: dict[int, str] = {}
    for off in offerings:
        try:
            cid = int(off["course_id"])
        except (TypeError, ValueError):
            continue  # malformed course_id cannot be matched
        offering_for_course.setdefault(cid, off["id"])

    out = []
    merged_count = 0
    for course_id in sorted(reviews_by_course.keys()):
        off_id = offering_for_course.get(course_id)
        if off_id is None:
            # course has reviews but no exported offering (e.g. legacy/ICU
            # courses without teaching classes) -> cannot attach; skipped and
            # reported via count mismatch (Q5).
            continue
        rs = reviews_by_course[course_id]
        non_zero = [r["rating"] for r in rs if r["rating"] > 0]
        if non_zero:
            avg = int(sum(non_zero) / len(non_zero) + 0.5)  # round-half-up
        else:
            avg = 0
        comments = [r["comment"] for r in rs if r["comment"]]
        content = "\n".join(comments)
        if len(content) > 10000:
            content = content[:10000] + "…[truncated]"
        created = min((r["created_at"] for r in rs if r["created_at"]), default="")
        helpful = sum(r["approve"] + r["disapprove"] for r in rs)
        if len(rs) > 1:
            merged_count += 1
        out.append(
            {
                "offering_external_id": off_id,
                "rating": avg,
                "content": content,
                "created_at": created,
                "legacy_helpful_count": helpful,
            }
        )
    out.sort(key=lambda r: r["offering_external_id"])
    return out, merged_count


# ---------------------------------------------------------------------------
# manifest / files


def render_jsonl(rows) -> bytes:
    lines = [json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows]
    return ("\n".join(lines) + "\n").encode("utf-8")


def write_package(out_dir: pathlib.Path, files: dict[str, bytes], manifest: dict):
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (out_dir / name).write_bytes(data)
    (out_dir / "manifest.yaml").write_text(
        yaml_dump(manifest), encoding="utf-8"
    )


def yaml_dump(manifest: dict) -> str:
    """Minimal deterministic YAML emitter for the manifest (no PyYAML dep)."""
    lines = []
    lines.append(f"schema_version: {manifest['schema_version']}")
    lines.append(f"source: {manifest['source']}")
    if manifest.get("source_commit"):
        lines.append(f"source_commit: {manifest['source_commit']}")
    lines.append(f"exported_at: {manifest['exported_at']}")
    lines.append(f"rights_approval_ref: {manifest['rights_approval_ref']}")
    lines.append("files:")
    for name in sorted(manifest["files"]):
        lines.append(f"  {name}: {manifest['files'][name]}")
    lines.append("counts:")
    for name in sorted(manifest["counts"]):
        lines.append(f"  {name}: {manifest['counts'][name]}")
    return "\n".join(lines) + "\n"


def write_semester_variants(out_dir: pathlib.Path, variants: dict[str, int]):
    rows = sorted(variants.items(), key=lambda kv: (-kv[1], kv[0]))
    text = "\n".join(f"{count}\t{sem}" for sem, count in rows)
    (out_dir / "semester-variants.txt").write_text(text + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# main


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Export legacy course data from a D1 backup SQLite into a "
        "Hub course-import manifest package."
    )
    ap.add_argument("--input", required=True, help="path to the backup SQLite file (wrangler d1 export output or local copy)")
    ap.add_argument("--output", default="export-course-package", help="output directory for the manifest package")
    ap.add_argument("--source", default="yourtj-serverless", help="manifest source identifier")
    ap.add_argument("--source-commit", default="", help="upstream git commit (optional)")
    ap.add_argument("--rights-approval-ref", default="", help="required for reviews import; set to the approval record/issue ref")
    ap.add_argument("--dry-run", action="store_true", help="validate and report counts only; do not write files")
    ap.add_argument("--limit", type=int, default=None, help="export at most N courses (and their dependent rows)")
    ap.add_argument("--no-semester-variants", action="store_true", help="do not write semester-variants.txt")
    args = ap.parse_args(argv)

    db_path = pathlib.Path(args.input)
    if not db_path.exists():
        print(f"error: input file not found: {db_path}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        courses = build_courses(conn, args.limit)
        instructors = build_instructors(conn, args.limit)
        offerings = build_offerings(conn, courses, args.limit)
        reviews, merged_count = build_reviews(conn, offerings, args.limit)
    finally:
        conn.close()

    # semester variants report (reviews.semester values, plus calendar labels
    # which are the authoritative term source for offerings)
    variants: dict[str, int] = {}
    vconn = sqlite3.connect(str(db_path))
    try:
        for (sem,) in vconn.execute("SELECT semester FROM reviews WHERE semester IS NOT NULL AND semester != ''"):
            variants[str(sem)] = variants.get(str(sem), 0) + 1
        for (i18n,) in vconn.execute("SELECT calendarIdI18n FROM calendar WHERE calendarIdI18n IS NOT NULL AND calendarIdI18n != ''"):
            key = str(i18n)
            variants[key] = variants.get(key, 0) + 0  # presence marker (term source)
    finally:
        vconn.close()

    counts = {
        "courses": len(courses),
        "instructors": len(instructors),
        "offerings": len(offerings),
        "reviews": len(reviews),
    }

    print(f"export: source={args.source} dryRun={args.dry_run}")
    print(f"  courses={counts['courses']} instructors={counts['instructors']} "
          f"offerings={counts['offerings']} reviews={counts['reviews']} "
          f"(merged into offering={merged_count})")
    if not args.dry_run and not args.rights_approval_ref:
        print("warning: --rights-approval-ref is empty; the Hub reviews importer "
              "will refuse this manifest (set it before running course-import reviews)",
              file=sys.stderr)

    if args.dry_run:
        return 0

    files = {
        "courses.jsonl": render_jsonl(courses),
        "instructors.jsonl": render_jsonl(instructors),
        "offerings.jsonl": render_jsonl(offerings),
        "reviews.jsonl": render_jsonl(reviews),
    }
    manifest = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "source": args.source,
        "source_commit": args.source_commit,
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rights_approval_ref": args.rights_approval_ref,
        "files": {name: sha256_bytes(data) for name, data in files.items()},
        "counts": counts,
    }

    out_dir = pathlib.Path(args.output)
    write_package(out_dir, files, manifest)
    if not args.no_semester_variants:
        write_semester_variants(out_dir, variants)

    print(f"wrote manifest package to {out_dir}/")
    print(f"  manifest.yaml  sha256={sha256_bytes((out_dir / 'manifest.yaml').read_bytes())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
