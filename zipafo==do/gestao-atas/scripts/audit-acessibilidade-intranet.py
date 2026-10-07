#!/usr/bin/env python3
"""Auditoria estática reproduzível da intranet municipal.
Não substitui teste manual com leitor de tela, mas verifica os contratos
mínimos que precisam existir em todas as páginas e subtelas.
"""
from pathlib import Path
import re, json

ROOT = Path(__file__).resolve().parents[1]
FULL = []
FRAGMENTS = []
findings = []
metrics = {"html": 0, "full_documents": 0, "fragments": 0, "buttons": 0, "controls": 0, "images": 0, "tables": 0}

for page in sorted(ROOT.rglob("*.html")):
    if ".git" in page.parts:
        continue
    text = page.read_text(encoding="utf-8", errors="ignore")
    rel = page.relative_to(ROOT).as_posix()
    metrics["html"] += 1
    is_full = bool(re.search(r"<!doctype\s+html|<html\b|<head\b", text, re.I))
    (FULL if is_full else FRAGMENTS).append(rel)
    if is_full:
        metrics["full_documents"] += 1
        if not re.search(r"<html[^>]+\blang\s*=", text, re.I): findings.append([rel, "documento sem lang"])
        if not re.search(r'<meta\s+name=["\']viewport["\']', text, re.I): findings.append([rel, "documento sem viewport"])
    else:
        metrics["fragments"] += 1
    if "identidade-intranet.css" not in text: findings.append([rel, "sem identidade-intranet.css"])
    if "acessibilidade-intranet.css" not in text: findings.append([rel, "sem acessibilidade-intranet.css"])
    if "acessibilidade-intranet.js" not in text: findings.append([rel, "sem acessibilidade-intranet.js"])
    for match in re.finditer(r"<button\b[^>]*>", text, re.I):
        metrics["buttons"] += 1
        if not re.search(r"\btype\s*=", match.group(0), re.I): findings.append([rel, "button sem type"])
    for match in re.finditer(r"<(?:input|select|textarea)\b[^>]*>", text, re.I):
        tag = match.group(0)
        if re.search(r'\btype\s*=["\']hidden', tag, re.I): continue
        metrics["controls"] += 1
        if not re.search(r"\baria-(?:label|labelledby)\s*=", tag, re.I) and not re.search(r"\bid\s*=", tag, re.I): findings.append([rel, "controle sem nome programático"])
    for match in re.finditer(r"<img\b[^>]*>", text, re.I):
        metrics["images"] += 1
        if not re.search(r"\balt\s*=", match.group(0), re.I): findings.append([rel, "imagem sem alt"])
    for match in re.finditer(r"<table\b[^>]*>", text, re.I):
        metrics["tables"] += 1
        if not re.search(r"\baria-(?:label|labelledby)\s*=", match.group(0), re.I): findings.append([rel, "tabela sem nome acessível"])

# Verify canonical visual contract.
identity = (ROOT / "shared/css/identidade-intranet.css").read_text(encoding="utf-8")
a11y_css = (ROOT / "shared/css/acessibilidade-intranet.css").read_text(encoding="utf-8")
visual = {
    "canonical_tokens": len(re.findall(r"--pit-[a-z0-9-]+:", identity)),
    "responsive_breakpoints": len(re.findall(r"@media", a11y_css)),
    "focus_visible": ":focus-visible" in a11y_css,
    "reduced_motion": "prefers-reduced-motion" in a11y_css,
    "dialog_contract": "dialog" in a11y_css and "modal-overlay" in a11y_css,
    "mobile_sidebar_contract": "a11y-menu-backdrop" in a11y_css,
}

result = {"metrics": metrics, "findings": findings, "visual": visual, "full_documents": FULL, "fragments": FRAGMENTS}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(1 if findings else 0)
