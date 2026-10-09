#!/usr/bin/env python3
"""Reproducible static audit for the active Intranet tree.

Does not contact Supabase/Drive, execute application code, or inspect private review data.
Exit status: 0 when no broken references are found in active pages/assets; 1 otherwise.
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
CSS_URL_RE = re.compile(r"""url\(\s*['"]?([^)'"]+)['"]?\s*\)""", re.I)
CSS_IMPORT_RE = re.compile(r"""@import\s+(?:url\(\s*)?['"]?([^)'";\s]+)['"]?\s*\)?""", re.I)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[dict[str, str]] = []
        self.ids: set[str] = set()
        self.client_routes: set[str] = set()
        self.title_parts: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag.lower() == "a" and values.get("name"):
            self.ids.add(values["name"])
        for route_attr in ("data-section", "data-route", "data-view"):
            if values.get(route_attr):
                self.client_routes.add(values[route_attr].lstrip("#/"))
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
    raw = raw.strip()
    parsed = urlsplit(raw)
    if parsed.scheme or raw.startswith("//") or raw.startswith(("data:", "blob:", "javascript:")):
        return None, None
    path = unquote(parsed.path)
    if not path:
        return source, parsed.fragment or None
    candidate = (root / path.lstrip("/")) if path.startswith("/") else (source.parent / path)
    return candidate.resolve(), parsed.fragment or None


def hash_routes_from_js(js_files: list[Path]) -> set[str]:
    """Collect hash routes declared as navigation targets in JavaScript."""
    routes: set[str] = set()
    route_property = re.compile(r"\brota\s*:\s*[\"'`]#([A-Za-z][A-Za-z0-9_-]*)[\"'`]")
    hash_assignment = re.compile(r"(?:window\.)?location\.hash\s*=\s*[\"'`]#([A-Za-z][A-Za-z0-9_-]*)[\"'`]")
    for path in js_files:
        text = path.read_text(errors="replace")
        routes.update(route_property.findall(text))
        routes.update(hash_assignment.findall(text))
    return routes


def unique_records(records: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[tuple[tuple[str, str], ...]] = set()
    result: list[dict[str, str]] = []
    for record in records:
        key = tuple(sorted(record.items()))
        if key not in seen:
            seen.add(key)
            result.append(record)
    return result


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
    client_routes = hash_routes_from_js(js_files)
    migration_root = root / "supabase" / "migrations"
    sql_files = sorted(p for p in migration_root.rglob("*.sql") if p.is_file()) if migration_root.is_dir() else []
    supplemental_sql_files = sorted(p for p in files if p.suffix.lower() == ".sql" and p not in sql_files)

    pages = []
    broken: list[dict[str, str]] = []
    wrong_case: list[dict[str, str]] = []
    root_relative: list[dict[str, str]] = []
    ref_count = 0
    reachable_css: set[Path] = set()
    pending_css: list[Path] = []

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
            if target.suffix.lower() == ".css" and target not in reachable_css:
                reachable_css.add(target)
                pending_css.append(target)
            if fragment and not fragment.startswith("/") and target.suffix.lower() in {".html", ".htm"}:
                target_page = PageParser()
                target_page.feed(target.read_text(errors="replace"))
                route_fragment = fragment.lstrip("#")
                if fragment not in target_page.ids and route_fragment not in target_page.client_routes and route_fragment not in client_routes:
                    broken.append({"source": str(path.relative_to(root)), "reference": raw, "reason": f"fragment #{fragment} not found in {target_rel} and not declared as a client route"})
        pages.append({
            "path": str(path.relative_to(root)),
            "title": " ".join(x for x in page.title_parts if x),
            "ids": len(page.ids),
            "references": len(page.refs),
        })

    # Follow @import recursively and inspect URLs only in CSS reachable from active HTML.
    scanned_css: set[Path] = set()
    while pending_css:
        css = pending_css.pop()
        if css in scanned_css:
            continue
        scanned_css.add(css)
        text = css.read_text(errors="replace")
        for raw in CSS_IMPORT_RE.findall(text):
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
                    record["reason"] = "CSS import not found"
                    broken.append(record)
            elif target.suffix.lower() == ".css" and target not in reachable_css:
                reachable_css.add(target)
                pending_css.append(target)

        for match in CSS_URL_RE.finditer(text):
            raw = match.group(1).strip()
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
            elif target.suffix.lower() == ".css" and target not in reachable_css:
                reachable_css.add(target)
                pending_css.append(target)

    # Inventory only: unreferenced stylesheets are not deleted or treated as failures.
    unreferenced_css = [str(p.relative_to(root)) for p in css_files if p not in reachable_css]
    purchases_text = "\n".join(p.read_text(errors="replace") for p in (root / "compras").rglob("*.html") if p.is_file()) if (root / "compras").is_dir() else ""
    direct_module_links = [
        pattern for pattern in ("biblioteca/", "biblioteca%2F", "controle-de-saldos", "controle-de-saldos/")
        if pattern.casefold() in purchases_text.casefold()
    ]
    broken = unique_records(broken)
    wrong_case = unique_records(wrong_case)
    root_relative = unique_records(root_relative)
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "root": str(root),
        "exclusions": sorted(EXCLUDED_DIRS),
        "historical_backup_html_excluded_from_active_route_checks": len(html_all) - len(html_files),
        "counts": {
            "active_html_pages": len(html_files),
            "all_html_including_backups": len(html_all),
            "css_files_checked": len(scanned_css),
            "all_css_files": len(css_all),
            "unreferenced_css_inventory": len(unreferenced_css),
            "js_files": len(js_files),
            "sql_migrations": len(sql_files),
            "supplemental_sql_files": len(supplemental_sql_files),
            "checked_static_references": ref_count,
        },
        "pages": pages,
        "broken_references": broken,
        "case_mismatches": wrong_case,
        "root_relative_references": root_relative,
        "unreferenced_css_inventory": unreferenced_css,
        "declared_client_hash_routes": sorted(client_routes),
        "direct_cross_module_links_in_compras_pages": direct_module_links,
        "limitations": [
            "Static analysis cannot discover runtime-generated routes, JavaScript-computed asset URLs, Supabase/Auth behavior, or browser-only integrations.",
            "CSS assets are checked through the stylesheet import graph reachable from active HTML; unreferenced stylesheets are inventory only and are not automatically removed.",
            "Historical backup folders are counted but excluded from active route checks; inspect separately before deletion or publication.",
            "Cross-module mentions in Compras are reported as an architectural inventory, not treated as broken references.",
            "No user data or files in private-review-saldos were read.",
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 1 if broken or wrong_case else 0


if __name__ == "__main__":
    raise SystemExit(main())
