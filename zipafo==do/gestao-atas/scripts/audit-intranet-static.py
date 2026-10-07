#!/usr/bin/env python3
"""Reproducible static audit for the existing Intranet tree.

Does not contact Supabase/Drive, execute application code, or inspect private review data.
Exit status: 0 when no broken references are found in active pages; 1 otherwise.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

EXCLUDED_DIRS = {
    ".git", ".github", ".audit-tmp", "node_modules", "private-review-saldos",
    "verify-drive", "verify-navigation", "__pycache__", ".manus-webdev",
}
ARCHIVE_MARKERS = {"bkp", "backup", "backups", "old", "archive", "archived", "arquivado", "arquivados"}
EXCLUDED_SUFFIXES = {".zip", ".pdf", ".xlsx", ".xls", ".csv", ".docx"}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[dict[str, str]] = []
        self.ids: set[str] = set()
        self.title_parts: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag.lower() == "a" and values.get("name"):
            self.ids.add(values["name"])
        for attr in ("href", "src", "action"):
            value = values.get(attr)
            if value:
                self.refs.append({"tag": tag, "attribute": attr, "value": value})
        if tag.lower() == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data.strip())


def is_archive(path: Path) -> bool:
    for part in path.parts:
        folded = part.casefold().strip()
        if folded in ARCHIVE_MARKERS or folded.startswith("bkp ") or folded.startswith("backup "):
            return True
    return False


def included_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() in EXCLUDED_SUFFIXES:
            continue
        rel = path.relative_to(root)
        if any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        yield path


def closest_case_path(root: Path, candidate: Path) -> str | None:
    """Return an existing path differing only in case, if found."""
    try:
        rel = candidate.relative_to(root)
    except ValueError:
        return None
    current = root
    changed = False
    for part in rel.parts:
        if not current.is_dir():
            return None
        names = [p.name for p in current.iterdir()]
        if part in names:
            current = current / part
            continue
        match = next((name for name in names if name.casefold() == part.casefold()), None)
        if match is None:
            return None
        changed = True
        current = current / match
    return str(current.relative_to(root)) if changed and current.exists() else None


def local_reference(root: Path, source: Path, raw: str) -> tuple[Path | None, str | None]:
    parsed = urlsplit(raw.strip())
    if parsed.scheme or raw.startswith("//") or raw.startswith(("data:", "blob:", "javascript:")):
        return None, None
    path = unquote(parsed.path)
    if not path:
        return source, parsed.fragment or None
    candidate = (root / path.lstrip("/")) if path.startswith("/") else (source.parent / path)
    return candidate.resolve(), parsed.fragment or None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", type=Path, default=None, help="write JSON report")
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit(f"Intranet root not found: {root}")

    files = list(included_files(root))
    html_all = sorted(p for p in files if p.suffix.lower() in {".html", ".htm"})
    html_files = [p for p in html_all if not is_archive(p.relative_to(root))]
    css_all = sorted(p for p in files if p.suffix.lower() == ".css")
    css_files = [p for p in css_all if not is_archive(p.relative_to(root))]
    js_files = sorted(p for p in files if p.suffix.lower() in {".js", ".mjs"})
    migration_root = root / "supabase" / "migrations"
    sql_files = sorted(p for p in migration_root.rglob("*.sql") if p.is_file()) if migration_root.is_dir() else []
    supplemental_sql_files = sorted(p for p in files if p.suffix.lower() == ".sql" and p not in sql_files)

    pages = []
    broken = []
    wrong_case = []
    root_relative = []
    ref_count = 0
    static_css_refs: set[str] = set()
    for path in html_files:
        page = PageParser()
        page.feed(path.read_text(errors="replace"))
        for ref in page.refs:
            raw = ref["value"]
            target, fragment = local_reference(root, path, raw)
            if raw.startswith("/") and not raw.startswith("//"):
                root_relative.append({"source": str(path.relative_to(root)), "reference": raw})
            if target is None:
                continue
            ref_count += 1
            try:
                target_rel = target.relative_to(root)
            except ValueError:
                broken.append({"source": str(path.relative_to(root)), "reference": raw, "reason": "resolves outside Intranet root"})
                continue
            if not target.exists():
                wrong = closest_case_path(root, target)
                record = {"source": str(path.relative_to(root)), "reference": raw}
                if wrong:
                    record["actual_case_path"] = wrong
                    wrong_case.append(record)
                else:
                    record["reason"] = "target not found"
                    broken.append(record)
                continue
            if target.suffix.lower() == ".css":
                static_css_refs.add(str(target.relative_to(root)))
            # Hash-router targets such as #/processes are application routes, not DOM anchors.
            if fragment and not fragment.startswith("/") and target.suffix.lower() in {".html", ".htm"}:
                target_page = PageParser()
                target_page.feed(target.read_text(errors="replace"))
                if fragment not in target_page.ids:
                    broken.append({"source": str(path.relative_to(root)), "reference": raw, "reason": f"fragment #{fragment} not found in {target_rel}"})
        pages.append({
            "path": str(path.relative_to(root)),
            "title": " ".join(x for x in page.title_parts if x),
            "ids": len(page.ids),
            "references": len(page.refs),
        })

    for css in css_files:
        text = css.read_text(errors="replace")
        for raw in re.findall(r"url\((?:\s*['\"]?)([^)'\"]+)", text, flags=re.I):
            raw = raw.strip()
            target, _ = local_reference(root, css, raw)
            if target is None:
                continue
            ref_count += 1
            if raw.startswith("/") and not raw.startswith("//"):
                root_relative.append({"source": str(css.relative_to(root)), "reference": raw})
            if not target.exists():
                wrong = closest_case_path(root, target)
                record = {"source": str(css.relative_to(root)), "reference": raw}
                if wrong:
                    record["actual_case_path"] = wrong
                    wrong_case.append(record)
                else:
                    record["reason"] = "CSS asset not found"
                    broken.append(record)

    unreferenced_css = [str(p.relative_to(root)) for p in css_files if str(p.relative_to(root)) not in static_css_refs]
    purchases_text = "\n".join(p.read_text(errors="replace") for p in (root / "compras").rglob("*.html") if p.is_file()) if (root / "compras").is_dir() else ""
    direct_module_links = [
        pattern for pattern in ("biblioteca/", "biblioteca%2F", "controle-de-saldos", "controle-de-saldos/")
        if pattern.casefold() in purchases_text.casefold()
    ]
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "root": str(root),
        "exclusions": sorted(EXCLUDED_DIRS),
        "historical_backup_html_excluded_from_active_route_checks": len(html_all) - len(html_files),
        "counts": {"active_html_pages": len(html_files), "all_html_including_backups": len(html_all), "css_files_checked": len(css_files), "all_css_files": len(css_all), "js_files": len(js_files), "sql_migrations": len(sql_files), "supplemental_sql_files": len(supplemental_sql_files), "checked_static_references": ref_count},
        "pages": pages,
        "broken_references": broken,
        "case_mismatches": wrong_case,
        "root_relative_references": root_relative,
        "css_candidates_without_literal_html_reference": unreferenced_css,
        "direct_cross_module_links_in_compras_pages": direct_module_links,
        "limitations": [
            "Static analysis cannot discover runtime-generated routes, JavaScript-computed URLs, Supabase/Auth behavior, or browser-only integrations.",
            "Historical backup folders are counted but excluded from active route checks; inspect separately before deletion or publication.",
            "Unreferenced CSS is only a candidate; dynamic loading must be ruled out before removal.",
            "No user data or files in private-review-saldos were read.",
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 1 if broken or wrong_case or direct_module_links else 0


if __name__ == "__main__":
    raise SystemExit(main())
