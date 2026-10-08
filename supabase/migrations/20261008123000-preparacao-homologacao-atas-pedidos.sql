-- Preparação segura para homologação de Atas, Saldos e Pedidos.
-- Não altera saldos, pedidos, consumos ou histórico existentes.
-- A RPC compras_aprovar_pedido já faz o decremento explícito e atômico
-- após bloquear o item com FOR UPDATE. O trigger legado duplicava esse efeito.

DROP TRIGGER IF EXISTS trigger_atualizar_saldo ON public.consumos;

REVOKE EXECUTE ON FUNCTION public.compras_cancelar_pedido(integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.compras_devolver_pedido(integer, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.compras_rejeitar_pedido(integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.compras_responder_devolucao(integer, boolean, text) FROM anon, public;

CREATE INDEX IF NOT EXISTS idx_consumos_tenant_item_ata
  ON public.consumos (tenant_id, item_ata_id);

CREATE INDEX IF NOT EXISTS idx_itens_pedido_tenant_pedido
  ON public.itens_pedido (tenant_id, pedido_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_reservas_tenant_item_status
  ON public.pedidos_reservas (tenant_id, item_ata_id, status);

CREATE INDEX IF NOT EXISTS idx_pedidos_estornos_itens_tenant_item
  ON public.pedidos_estornos_itens (tenant_id, item_ata_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_entregas_itens_tenant_item
  ON public.pedidos_entregas_itens (tenant_id, item_pedido_id);

COMMENT ON FUNCTION public.atualizar_saldo_apos_consumo() IS
  'Legado desativado em 20261008123000: a RPC compras_aprovar_pedido controla o decremento de saldo de forma explícita e atômica.';
