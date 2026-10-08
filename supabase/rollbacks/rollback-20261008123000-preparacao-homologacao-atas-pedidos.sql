-- Rollback da preparação para homologação.
-- Atenção: reativa o trigger legado que pode duplicar a redução se a RPC
-- continuar com o decremento explícito. Usar apenas junto da versão anterior.

CREATE TRIGGER trigger_atualizar_saldo
AFTER INSERT ON public.consumos
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_saldo_apos_consumo();

GRANT EXECUTE ON FUNCTION public.compras_cancelar_pedido(integer, text) TO public;
GRANT EXECUTE ON FUNCTION public.compras_devolver_pedido(integer, jsonb, text) TO public;
GRANT EXECUTE ON FUNCTION public.compras_rejeitar_pedido(integer, text) TO public;
GRANT EXECUTE ON FUNCTION public.compras_responder_devolucao(integer, boolean, text) TO public;

DROP INDEX IF EXISTS public.idx_consumos_tenant_item_ata;
DROP INDEX IF EXISTS public.idx_itens_pedido_tenant_pedido;
DROP INDEX IF EXISTS public.idx_pedidos_reservas_tenant_item_status;
DROP INDEX IF EXISTS public.idx_pedidos_estornos_itens_tenant_item;
DROP INDEX IF EXISTS public.idx_pedidos_entregas_itens_tenant_item;
