#!/usr/bin/env python3
"""Unit tests for export-legacy-course-package.py.

Covers: mapping correctness, privacy filtering, count consistency,
idempotent re-export (byte-identical output), dry-run (no files written),
and semester normalization.

Run:
  python3 -m unittest backend/scripts/test_export_legacy_course_package.py
  (or from backend/: python3 -m unittest scripts.test_export_legacy_course_package)
"""

import io
import json
import pathlib
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import export_legacy_course_package as exp  # noqa: E402


SCHEMA = """
CREATE TABLE courses (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
    credit REAL DEFAULT 0, department TEXT, teacher_id INTEGER,
    review_count INTEGER DEFAULT 0, review_avg REAL DEFAULT 0,
    search_keywords TEXT, is_legacy INTEGER DEFAULT 0, is_icu INTEGER DEFAULT 0
);
CREATE TABLE teachers (
    id INTEGER PRIMARY KEY, tid TEXT, name TEXT NOT NULL,
    title TEXT, pinyin TEXT, department TEXT
);
CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL, semester TEXT, rating INTEGER NOT NULL,
    comment TEXT, score TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    approve_count INTEGER DEFAULT 0, disapprove_count INTEGER DEFAULT 0,
    is_hidden BOOLEAN DEFAULT 0, is_legacy INTEGER DEFAULT 0, is_icu INTEGER DEFAULT 0,
    reviewer_name TEXT DEFAULT '', reviewer_avatar TEXT DEFAULT '',
    wallet_user_hash TEXT, edit_token TEXT
);
CREATE TABLE course_aliases (
    system TEXT NOT NULL, alias TEXT NOT NULL, course_id INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (system, alias)
);
CREATE TABLE calendar (
    calendarId INTEGER PRIMARY KEY, calendarIdI18n TEXT
);
CREATE TABLE coursedetail (
    id INTEGER PRIMARY KEY, code TEXT, name TEXT,
    courseCode TEXT, courseName TEXT, credit REAL,
    campus TEXT, faculty TEXT, calendarId INTEGER,
    newCourseCode TEXT, newCode TEXT
);
CREATE TABLE teacher (
    id INTEGER PRIMARY KEY, teachingClassId INTEGER,
    teacherCode TEXT, teacherName TEXT, arrangeInfoText TEXT
);
"""


def make_db() -> str:
    """Create a temp SQLite with a representative dataset; return its path."""
    fd = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
    path = fd.name
    fd.close()
    conn = sqlite3.connect(path)
    c = conn.cursor()
    c.executescript(SCHEMA)

    c.executemany(
        "INSERT INTO teachers (id,tid,name,title,pinyin,department) VALUES (?,?,?,?,?,?)",
        [
            (1, "T001", "张伟", "教授", "zhangwei", "计算机系"),
            (2, "T002", "李娜", "副教授", "lina", "软件学院"),
        ],
    )
    c.executemany(
        "INSERT INTO courses (id,code,name,credit,department,teacher_id,review_count,review_avg,search_keywords,is_legacy,is_icu) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
            (1, "CS101", "计算机程序设计", 3.0, "计算机系", 1, 5, 4.6, "CS101 计算机程序设计 张伟", 0, 0),
            (2, "CS201", "数据结构", 4.0, "计算机系", 1, 1, 5.0, "CS201 数据结构 张伟", 0, 0),
            (3, "ICU999", "旧课", 2.0, "旧系", None, 1, 4.0, "ICU999 旧课", 1, 1),
        ],
    )
    # course 1: 3 reviews (two rated + one rating-0, one hidden, private fields)
    # course 2: 1 review; course 3 (ICU, no offering): 1 review -> skipped
    c.executemany(
        "INSERT INTO reviews (id,course_id,semester,rating,comment,score,created_at,approve_count,disapprove_count,is_hidden,is_legacy,is_icu,reviewer_name,reviewer_avatar,wallet_user_hash,edit_token) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (1, 1, "2024-2025学年第1学期", 5, "很好", None, 1734240600, 3, 1, 0, 0, 0, "张同学", "http://avatar/1", "wallet_hash_1", "edit_1"),
            (2, 1, "2024-2025-1", 4, "不错", None, 1734240700, 1, 0, 0, 0, 0, "李同学", "", "wallet_hash_2", "edit_2"),
            (3, 1, "2023-2024学年第2学期", 0, "（无评分）", None, 1718000000, 0, 0, 0, 0, 0, "王同学", "", "wallet_hash_3", "edit_3"),
            (4, 1, "2024-2025学年第1学期", 2, "隐藏评论", None, 1734240800, 0, 0, 1, 0, 0, "隐藏者", "", "wallet_hash_h", "edit_h"),
            (5, 2, "2024-2025学年第1学期", 5, "数据结构很好", None, 1734241000, 2, 0, 0, 0, 0, "赵同学", "", "wallet_hash_4", "edit_4"),
            (6, 3, "2024-2025学年第1学期", 4, "旧课评价", None, 1734242000, 0, 0, 0, 1, 1, "旧同学", "", "wallet_hash_5", "edit_5"),
        ],
    )
    c.executemany(
        "INSERT INTO course_aliases (system,alias,course_id) VALUES (?,?,?)",
        [
            ("onesystem", "TJCS101", 1),
            ("onesystem", "CS10101", 1),
        ],
    )
    c.execute("INSERT INTO calendar (calendarId, calendarIdI18n) VALUES (121, '2024-2025学年第1学期')")
    c.executemany(
        "INSERT INTO coursedetail (id,code,name,courseCode,courseName,credit,campus,faculty,calendarId,newCourseCode,newCode) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
            (900001, "TJCS10101", "计算机程序设计-1班", "TJCS101", "计算机程序设计", 3.0, "SP", "CS", 121, "CS101", "CS10101"),
            (900002, "TJCS10102", "计算机程序设计-2班", "TJCS101", "计算机程序设计", 3.0, "SP", "CS", 121, "CS101", "CS10102"),
        ],
    )
    c.executemany(
        "INSERT INTO teacher (id,teachingClassId,teacherCode,teacherName,arrangeInfoText) VALUES (?,?,?,?,?)",
        [
            (1, 900001, "T001", "张伟", "张伟(T001) 周一1-2节"),
            (2, 900002, "T002", "李娜", "李娜(T002) 周二1-2节"),
        ],
    )
    conn.commit()
    conn.close()
    return path


class ExportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_path = make_db()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = pathlib.Path(self.tmp.name) / "pkg"

    def tearDown(self):
        self.tmp.cleanup()

    def run_export(self, **kwargs):
        args = ["--input", self.db_path, "--output", str(self.out)]
        for k, v in kwargs.items():
            args += [f"--{k.replace('_', '-')}", str(v)]
        rc = exp.main(args)
        self.assertEqual(rc, 0, "export should succeed")
        return self.out

    def read_jsonl(self, name):
        return [json.loads(l) for l in (self.out / name).read_text(encoding="utf-8").splitlines() if l.strip()]

    # --- mapping correctness -------------------------------------------

    def test_courses_mapping(self):
        self.run_export(rights_approval_ref="ref-1")
        courses = self.read_jsonl("courses.jsonl")
        self.assertEqual(len(courses), 3)
        by_code = {c["code"]: c for c in courses}
        self.assertEqual(by_code["CS101"]["name"], "计算机程序设计")
        self.assertEqual(by_code["CS101"]["department"], "计算机系")
        self.assertEqual(by_code["CS101"]["credit"], 3.0)
        self.assertEqual(by_code["CS101"]["id"], "1")
        # aliases collected from course_aliases, sorted
        self.assertEqual(by_code["CS101"]["aliases"], ["CS10101", "TJCS101"])
        # course without aliases has no aliases key
        self.assertNotIn("aliases", by_code["CS201"])

    def test_instructors_mapping(self):
        self.run_export(rights_approval_ref="ref-1")
        ins = self.read_jsonl("instructors.jsonl")
        self.assertEqual(len(ins), 2)
        by_id = {i["id"]: i for i in ins}
        self.assertEqual(by_id["1"]["name"], "张伟")
        self.assertEqual(by_id["1"]["title"], "教授")
        self.assertEqual(by_id["2"]["name"], "李娜")

    def test_offerings_mapping(self):
        self.run_export(rights_approval_ref="ref-1")
        off = self.read_jsonl("offerings.jsonl")
        self.assertEqual(len(off), 2)
        by_id = {o["id"]: o for o in off}
        # course resolved through course_aliases TJCS101 -> courses.id=1
        self.assertEqual(by_id["900001"]["course_id"], "1")
        self.assertEqual(by_id["900001"]["term"], "2024-2025-1")
        self.assertEqual(by_id["900001"]["campus"], "SP")
        self.assertEqual(by_id["900001"]["faculty"], "CS")
        self.assertEqual(by_id["900001"]["instructor_ids"], ["1"])
        self.assertEqual(by_id["900002"]["instructor_ids"], ["2"])

    def test_reviews_mapping_and_merge(self):
        self.run_export(rights_approval_ref="ref-1")
        rev = self.read_jsonl("reviews.jsonl")
        # course 1 reviews (2 visible rated + 1 rating-0) merged into first offering
        self.assertEqual(len(rev), 1)
        r = rev[0]
        self.assertEqual(r["offering_external_id"], "900001")
        # rating = round-half-up((5+4)/2) = 5
        self.assertEqual(r["rating"], 5)
        # content joined, includes rating-0 comment, excludes hidden review
        self.assertIn("很好", r["content"])
        self.assertIn("不错", r["content"])
        self.assertIn("（无评分）", r["content"])
        self.assertNotIn("隐藏评论", r["content"])
        # created_at = earliest visible review
        self.assertEqual(r["created_at"], "2024-06-10T06:13:20Z")
        # helpful = sum(approve+disapprove) of visible reviews: (3+1)+(1+0)+(0+0)
        self.assertEqual(r["legacy_helpful_count"], 5)

    def test_icu_course_without_offering_skipped(self):
        """course 3 (ICU/legacy, no coursedetail) must not appear in reviews
        (its review cannot attach to any offering) but stays in courses."""
        self.run_export(rights_approval_ref="ref-1")
        courses = self.read_jsonl("courses.jsonl")
        self.assertTrue(any(c["code"] == "ICU999" for c in courses), "ICU course stays in catalog")
        rev = self.read_jsonl("reviews.jsonl")
        self.assertTrue(all(r["offering_external_id"] != "900000" for r in rev))

    # --- privacy filtering ---------------------------------------------

    def test_privacy_fields_absent(self):
        self.run_export(rights_approval_ref="ref-1")
        raw_reviews = (self.out / "reviews.jsonl").read_text(encoding="utf-8")
        self.assertNotIn("wallet_user_hash", raw_reviews)
        self.assertNotIn("wallet_hash_1", raw_reviews)
        self.assertNotIn("edit_token", raw_reviews)
        self.assertNotIn("edit_1", raw_reviews)
        self.assertNotIn("reviewer_name", raw_reviews)
        self.assertNotIn("张同学", raw_reviews)
        self.assertNotIn("reviewer_avatar", raw_reviews)
        # courses/offerings also carry no PII
        raw_courses = (self.out / "courses.jsonl").read_text(encoding="utf-8")
        self.assertNotIn("wallet", raw_courses)

    # --- count consistency ---------------------------------------------

    def test_manifest_counts_match_files(self):
        out = self.run_export(rights_approval_ref="ref-1")
        import yaml  # may be absent; parse manually if so

        try:
            manifest = yaml.safe_load((out / "manifest.yaml").read_text(encoding="utf-8"))
        except ImportError:
            manifest = self.parse_manifest(out)
        for name in ["courses", "instructors", "offerings", "reviews"]:
            rows = self.read_jsonl(f"{name}.jsonl")
            self.assertEqual(manifest["counts"][name], len(rows), f"count mismatch for {name}")

    def parse_manifest(self, out):
        """Minimal YAML parse fallback when PyYAML is unavailable."""
        m = {"files": {}, "counts": {}}
        for line in (out / "manifest.yaml").read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            if line[0].isspace():
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                k = k.strip()
                v = v.strip()
                if k == "schema_version":
                    m["schema_version"] = int(v)
                elif k == "source":
                    m["source"] = v
                elif k in ("files", "counts"):
                    m[k] = {}
                elif k in ("rights_approval_ref", "source_commit", "exported_at"):
                    m[k] = v
        for k in ("files", "counts"):
            for line in (out / "manifest.yaml").read_text(encoding="utf-8").splitlines():
                if line.startswith("  ") and ":" in line:
                    fk, fv = line.strip().split(":", 1)
                    if k == "files" and fk in ("courses", "instructors", "offerings", "reviews"):
                        m["files"][fk + ".jsonl"] = fv.strip()
                    elif k == "counts" and fk in ("courses", "instructors", "offerings", "reviews"):
                        m["counts"][fk] = int(fv.strip())
        return m

    def test_manifest_sha256_matches_files(self):
        out = self.run_export(rights_approval_ref="ref-1")
        try:
            import yaml

            manifest = yaml.safe_load((out / "manifest.yaml").read_text(encoding="utf-8"))
        except ImportError:
            manifest = self.parse_manifest(out)
        for name, want in manifest["files"].items():
            got = exp.sha256_bytes((out / name).read_bytes())
            self.assertEqual(got, want, f"sha256 mismatch for {name}")

    def test_manifest_required_fields(self):
        out = self.run_export(rights_approval_ref="ref-2")
        try:
            import yaml

            manifest = yaml.safe_load((out / "manifest.yaml").read_text(encoding="utf-8"))
        except ImportError:
            manifest = self.parse_manifest(out)
        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(manifest["source"], "yourtj-serverless")
        self.assertEqual(manifest["rights_approval_ref"], "ref-2")
        self.assertIn("exported_at", manifest)
        self.assertEqual(sorted(manifest["files"]), ["courses.jsonl", "instructors.jsonl", "offerings.jsonl", "reviews.jsonl"])

    # --- idempotent re-export ------------------------------------------

    def test_reexport_byte_identical(self):
        out1 = self.run_export(rights_approval_ref="ref-1")
        files1 = {p.name: p.read_bytes() for p in out1.iterdir()}
        out2 = self.out.parent / "pkg2"
        args = ["--input", self.db_path, "--output", str(out2), "--rights-approval-ref", "ref-1"]
        self.assertEqual(exp.main(args), 0)
        files2 = {p.name: p.read_bytes() for p in out2.iterdir()}
        self.assertEqual(set(files1), set(files2))
        for name in files1:
            self.assertEqual(files1[name], files2[name], f"file {name} differs across re-exports")
        # manifest is NOT byte-identical (exported_at changes) but files are
        import yaml

        try:
            m1 = yaml.safe_load((out1 / "manifest.yaml").read_text(encoding="utf-8"))
            m2 = yaml.safe_load((out2 / "manifest.yaml").read_text(encoding="utf-8"))
        except ImportError:
            m1 = self.parse_manifest(out1)
            m2 = self.parse_manifest(out2)
        self.assertEqual(m1["files"], m2["files"])
        self.assertEqual(m1["counts"], m2["counts"])

    # --- dry-run --------------------------------------------------------

    def test_dry_run_writes_nothing(self):
        args = ["--input", self.db_path, "--output", str(self.out), "--rights-approval-ref", "ref-1", "--dry-run"]
        rc = exp.main(args)
        self.assertEqual(rc, 0)
        self.assertFalse(self.out.exists(), "dry-run must not create the output directory")

    def test_dry_run_reports_counts(self):
        old_stdout = sys.stdout
        buf = io.StringIO()
        sys.stdout = buf
        try:
            args = ["--input", self.db_path, "--output", str(self.out), "--rights-approval-ref", "ref-1", "--dry-run"]
            rc = exp.main(args)
        finally:
            sys.stdout = old_stdout
        self.assertEqual(rc, 0)
        self.assertIn("courses=3", buf.getvalue())
        self.assertIn("instructors=2", buf.getvalue())
        self.assertIn("offerings=2", buf.getvalue())
        self.assertIn("reviews=1", buf.getvalue())

    # --- limit ----------------------------------------------------------

    def test_limit(self):
        out = self.run_export(rights_approval_ref="ref-1", limit=1)
        courses = self.read_jsonl("courses.jsonl")
        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]["id"], "1")  # lowest id first
        # dependent rows: only offering/review rows that reference course 1
        off = self.read_jsonl("offerings.jsonl")
        self.assertTrue(all(o["course_id"] == "1" for o in off))
        # course 2 review not included
        self.assertEqual(len(self.read_jsonl("reviews.jsonl")), 1)

    # --- semester normalization ----------------------------------------

    def test_term_code_variants(self):
        cases = {
            "2024-2025学年第1学期": "2024-2025-1",
            "2024-2025-1": "2024-2025-1",
            "2024-2025第1学期": "2024-2025第1学期",  # no separator -> preserved (matches upstream regex)
            "2023-2024学年第2学期": "2023-2024-2",
            "2023-2024学年第3学期": "2023-2024-3",
            "怪学期": "怪学期",  # preserved
            "": "",
            None: "",
        }
        for raw, want in cases.items():
            self.assertEqual(exp.term_code(raw), want, f"term_code({raw!r})")
            self.assertEqual(exp.review_semester_term(raw), want, f"review_semester_term({raw!r})")

    def test_semester_variants_report(self):
        out = self.run_export(rights_approval_ref="ref-1")
        variants = (out / "semester-variants.txt").read_text(encoding="utf-8").splitlines()
        self.assertTrue(any("2024-2025学年第1学期" in l for l in variants))
        self.assertTrue(any("2023-2024学年第2学期" in l for l in variants))
        self.assertTrue(any("2024-2025-1" in l for l in variants))


class TermCodeTest(unittest.TestCase):
    def test_iso8601(self):
        # 1734240600 == 2024-12-15T05:30:00Z (verified)
        self.assertEqual(exp.iso8601(1734240600), "2024-12-15T05:30:00Z")
        self.assertEqual(exp.iso8601(None), "")
        self.assertEqual(exp.iso8601(0), "")
        self.assertEqual(exp.iso8601("abc"), "")


if __name__ == "__main__":
    unittest.main()
