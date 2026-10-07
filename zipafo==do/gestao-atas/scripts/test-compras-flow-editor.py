#!/usr/bin/env python3
"""Contract tests for the Compras flow editor.

These checks are local and read-only: they do not contact Supabase, insert fixtures,
or read private financial-review material. Authenticated E2E execution remains a
staging-only step because this workspace has no approved staging branch.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "compras" / "compras.js").read_text()
HTML = (ROOT / "compras" / "index.html").read_text()
MIGRATION = (ROOT / "supabase" / "migrations" / "20261001001500-compras-subetapas-operacionais.sql").read_text()


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise AssertionError(f"{label}: missing {needle!r}")


def main() -> int:
    required_js = {
        "flow creation": "async function createFlow",
        "version cloning": "async function cloneFlowVersion",
        "stage editing": "async function saveStage",
        "version publication": "async function publishVersion",
        "substep materialization": "compras_processos_subetapas",
        "business-day RPC": "compras_calcular_prazo_dias_uteis",
        "substep completion": "async function completeSubstep",
    }
    for label, needle in required_js.items():
        require(JS, needle, label)

    required_html = {
        "flow tab": 'data-tab="settings"',
        "new flow action": 'data-action="new-flow"',
        "new version action": 'data-action="new-flow-version"',
        "flow editor mount": 'id="flow-editor"',
        "holiday editor mount": 'id="holidays-list"',
    }
    for label, needle in required_html.items():
        require(HTML, needle, label)

    for label, needle in {
        "operational table": "CREATE TABLE IF NOT EXISTS public.compras_processos_subetapas",
        "tenant RLS": "ALTER TABLE public.compras_processos_subetapas ENABLE ROW LEVEL SECURITY",
        "process integrity": "FOREIGN KEY (tenant_id,processo_id)",
        "stage integrity": "FOREIGN KEY (tenant_id,processo_etapa_id)",
        "substep status": "CHECK (status IN ('pendente','em_andamento','concluida','bloqueada','cancelada'))",
    }.items():
        require(MIGRATION, needle, label)

    # Guard against accidental reads or packaging of the private financial review.
    if "private-review-saldos" in JS or "private-review-saldos" in HTML:
        raise AssertionError("private review path leaked into Compras runtime")

    # Ensure the frontend has one handler for each editor form.
    forms = {name for name in re.findall(r'"([a-z-]+-form)":\s*\w+', JS)}
    for form in ("flow-form", "flow-version-form", "stage-form", "substep-form"):
        if form not in forms:
            raise AssertionError(f"dispatcher missing {form}")

    print("compras_flow_editor_contract=passed")
    print("authenticated_e2e=not_run (requires approved staging/authenticated session)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
