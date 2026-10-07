-- Atas, Saldos e Pedidos — aprovação atômica de pedidos.
-- Fase 7: evita consumo parcial e corrida de saldo na aprovação.
-- A RPC não altera pedidos existentes até ser chamada por um usuário autenticado.

CREATE OR REPLACE FUNCTION public.compras_aprovar_pedido(p_pedido_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  v_user_id integer;
  v_tenant_id uuid;
  v_pedido public.pedidos%ROWTYPE;
  v_item record;
  v_item_ata public.itens_ata%ROWTYPE;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  v_user_id := app_private.current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado não encontrado' USING ERRCODE = '42501';
  END IF;

  SELECT p.*
    INTO v_pedido
    FROM public.pedidos AS p
   WHERE p.id = p_pedido_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id USING ERRCODE = 'P0002';
  END IF;

  v_tenant_id := v_pedido.tenant_id;
  IF NOT app_private.has_tenant_role(v_tenant_id, ARRAY['tenant_admin','compras_manager']) THEN
    RAISE EXCEPTION 'Usuário sem permissão para aprovar pedidos neste tenant' USING ERRCODE = '42501';
  END IF;

  IF v_pedido.status_aprovacao = 'APROVADO' THEN
    RETURN jsonb_build_object(
      'pedido_id', v_pedido.id,
      'status', 'APROVADO',
      'idempotente', true,
      'itens_aprovados', 0,
      'valor_total', coalesce(v_pedido.valor_total, 0)
    );
  END IF;

  IF coalesce(v_pedido.status_aprovacao, '') <> 'AGUARDANDO_APROVACAO' THEN
    RAISE EXCEPTION 'Pedido % não está aguardando aprovação', p_pedido_id USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT ip.*
      FROM public.itens_pedido AS ip
     WHERE ip.pedido_id = v_pedido.id
       AND ip.tenant_id = v_tenant_id
     ORDER BY ip.id
  LOOP
    SELECT ia.*
      INTO v_item_ata
      FROM public.itens_ata AS ia
     WHERE ia.id = v_item.item_ata_id
       AND ia.tenant_id = v_tenant_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da ata % não encontrado no tenant do pedido', v_item.item_ata_id USING ERRCODE = 'P0002';
    END IF;

    IF coalesce(v_item.quantidade_solicitada, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida no item do pedido %', v_item.id USING ERRCODE = '22023';
    END IF;

    IF v_item.quantidade_solicitada > coalesce(v_item_ata.saldo_quantidade, 0) THEN
      RAISE EXCEPTION 'Saldo insuficiente para o item %: disponível %, solicitado %',
        v_item_ata.descricao, coalesce(v_item_ata.saldo_quantidade, 0), v_item.quantidade_solicitada
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.consumos (
      ata_id, item_ata_id, orgao_solicitante_id, usuario_id,
      quantidade, valor_unitario, valor_total, data_consumo,
      observacao, created_at, tenant_id, unidade_id
    ) VALUES (
      v_pedido.ata_id, v_item.item_ata_id, v_pedido.orgao_solicitante_id, v_user_id,
      v_item.quantidade_solicitada, v_item.valor_unitario, v_item.valor_total, current_date,
      'Consumo automático via RPC de aprovação do pedido ' || v_pedido.numero_pedido,
      now(), v_tenant_id, v_pedido.unidade_id
    );

    UPDATE public.itens_ata
       SET saldo_quantidade = saldo_quantidade - v_item.quantidade_solicitada,
           saldo_valor = greatest(0, saldo_valor - coalesce(v_item.valor_total, 0)),
           updated_at = now()
     WHERE id = v_item.item_ata_id
       AND tenant_id = v_tenant_id;

    v_count := v_count + 1;
    v_total := v_total + coalesce(v_item.valor_total, 0);
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Pedido % não possui itens para aprovação', p_pedido_id USING ERRCODE = '22023';
  END IF;

  UPDATE public.pedidos
     SET status_aprovacao = 'APROVADO',
         aprovado_por = v_user_id,
         data_aprovacao = current_date,
         status = 'APROVADO',
         updated_at = now()
   WHERE id = v_pedido.id
     AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object(
    'pedido_id', v_pedido.id,
    'status', 'APROVADO',
    'idempotente', false,
    'itens_aprovados', v_count,
    'valor_total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compras_aprovar_pedido(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_aprovar_pedido(integer) TO authenticated;
