#!/usr/bin/env python3
"""Contrato estático da aprovação atômica de Atas, Saldos e Pedidos."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
migration = (ROOT / "supabase/migrations/20261001001600-atas-aprovacao-atomica.sql").read_text()
rollback = (ROOT / "supabase/rollbacks/rollback-20261001001600-atas-aprovacao-atomica.sql").read_text()
frontend = (ROOT / "controle-de-saldos/js/modules/pedidos.js").read_text()

required = [
    "CREATE OR REPLACE FUNCTION public.compras_aprovar_pedido",
    "SECURITY INVOKER",
    "FOR UPDATE",
    "app_private.current_user_id()",
    "app_private.has_tenant_role",
    "INSERT INTO public.consumos",
    "saldo_quantidade = saldo_quantidade -",
    "saldo_valor = greatest(0",
    "status_aprovacao = 'APROVADO'",
    "REVOKE ALL ON FUNCTION public.compras_aprovar_pedido(integer)",
    "GRANT EXECUTE ON FUNCTION public.compras_aprovar_pedido(integer) TO authenticated",
]
for token in required:
    assert token in migration, f"migration missing: {token}"

assert "DROP FUNCTION IF EXISTS public.compras_aprovar_pedido(integer)" in rollback
assert frontend.count('supabase.rpc("compras_aprovar_pedido"') >= 2
assert "_aprovarPedidoSilencioso" in frontend
assert "A aprovação será processada de forma atômica" in frontend
print("atas_atomic_approval_contract=passed")
