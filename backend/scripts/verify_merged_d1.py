#!/usr/bin/env python3
import argparse
import json
import sqlite3
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = PROJECT_ROOT / "backend" / "generated" / "merged_d1.sqlite3"
DEFAULT_REPORT = PROJECT_ROOT / "backend" / "generated" / "merged_d1_verify.json"


def parse_args():
    parser = argparse.ArgumentParser(description="Verify merged D1 database shape and rendering-oriented invariants.")
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    return parser.parse_args()


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def main():
    args = parse_args()
    db_path = Path(args.db)
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    course_columns = {row["name"] for row in conn.execute("PRAGMA table_info(courses)")}
    review_columns = {row["name"] for row in conn.execute("PRAGMA table_info(reviews)")}

    assert_true({"is_icu", "is_legacy", "search_keywords"} <= course_columns, "courses 表缺少必需字段")
    assert_true({"is_icu", "is_legacy", "comment", "approve_count", "disapprove_count"} <= review_columns, "reviews 表缺少必需字段")

    old_icu_legacy = conn.execute("SELECT COUNT(*) FROM courses WHERE is_icu = 1 AND is_legacy = 1").fetchone()[0]
    assert_true(old_icu_legacy == 0, "最新 ICU 课程不应继续保留 is_legacy=1")

    orphan_reviews = conn.execute(
        """
        SELECT COUNT(*)
        FROM reviews r
        LEFT JOIN courses c ON c.id = r.course_id
        WHERE c.id IS NULL
        """
    ).fetchone()[0]
    assert_true(orphan_reviews == 0, "存在孤立评论")

    markdown_samples = [
        dict(row)
        for row in conn.execute(
            """
            SELECT c.name, t.name AS teacher_name, r.comment
            FROM reviews r
            JOIN courses c ON c.id = r.course_id
            LEFT JOIN teachers t ON t.id = c.teacher_id
            WHERE r.is_icu = 1
              AND (
                r.comment LIKE '%# %'
                OR r.comment LIKE '%**%'
                OR r.comment LIKE '%[%](%'
                OR r.comment LIKE '%`%'
              )
            ORDER BY r.created_at DESC
            LIMIT 10
            """
        ).fetchall()
    ]

    bad_single_line = conn.execute(
        """
        SELECT COUNT(*)
        FROM reviews
        WHERE is_icu = 1
          AND comment LIKE '%课程内容：%'
          AND comment NOT LIKE '%' || char(10) || '%'
        """
    ).fetchone()[0]
    assert_true(bad_single_line == 0, "存在未断行清洗的 ICU 评论")

    report = {
        "counts": {
            "courses": conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0],
            "reviews": conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0],
            "icu_courses": conn.execute("SELECT COUNT(*) FROM courses WHERE is_icu = 1").fetchone()[0],
            "icu_reviews": conn.execute("SELECT COUNT(*) FROM reviews WHERE is_icu = 1").fetchone()[0],
        },
        "markdown_samples": markdown_samples,
        "checks": {
            "old_icu_legacy": old_icu_legacy,
            "orphan_reviews": orphan_reviews,
            "bad_single_line": bad_single_line,
        },
    }

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
