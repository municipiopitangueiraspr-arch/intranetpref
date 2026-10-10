-- Ajuste de itens de pedido para os perfis SECRETARIO e ADMIN.
-- O fluxo mantém reservas, saldo e total do pedido consistentes.
create or replace function public.compras_ajustar_itens_pedido(
  p_pedido_id integer,
  p_itens jsonb,
  p_justificativa text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user integer := app_private.current_user_id();
  v_tenant uuid := app_private.current_tenant_id();
  v_perfil text;
  v_pedido public.pedidos%rowtype;
  v_item jsonb;
  v_item_pedido public.itens_pedido%rowtype;
  v_item_ata public.itens_ata%rowtype;
  v_quantidade numeric;
  v_outras_reservas numeric;
  v_total numeric := 0;
  v_count integer := 0;
  v_justificativa text := nullif(trim(coalesce(p_justificativa, '')), '');
begin
  if v_user is null or v_tenant is null then
    raise exception 'Usuário ou tenant não identificado' using errcode = '42501';
  end if;

  select u.perfil into v_perfil
    from public.usuarios u
   where u.id = v_user and u.ativo = true;
  if coalesce(v_perfil, '') not in ('SECRETARIO', 'ADMIN') then
    raise exception 'Somente secretários e administradores podem ajustar itens de pedidos' using errcode = '42501';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe os itens e suas quantidades' using errcode = '22023';
  end if;

  select * into v_pedido
    from public.pedidos p
   where p.id = p_pedido_id and p.tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_pedido.status_aprovacao not in ('AGUARDANDO_APROVACAO', 'DEVOLVIDO_AJUSTE') then
    raise exception 'Somente pedidos aguardando aprovação ou devolvidos para ajuste podem ser editados' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.pedidos_entregas_itens pei
     where pei.pedido_id = p_pedido_id and pei.tenant_id = v_tenant
  ) then
    raise exception 'Pedido com entrega registrada não pode ter seus itens editados' using errcode = '55000';
  end if;

  -- A lista enviada representa o estado final: quantidade zero remove o item.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_item_pedido
      from public.itens_pedido ip
     where ip.id = (v_item->>'item_pedido_id')::integer
       and ip.pedido_id = p_pedido_id
       and ip.tenant_id = v_tenant
     for update;
    if not found then
      raise exception 'Item do pedido não encontrado' using errcode = 'P0002';
    end if;

    v_quantidade := coalesce((v_item->>'quantidade')::numeric, -1);
    if v_quantidade < 0 then
      raise exception 'Quantidade inválida para o item %', v_item_pedido.id using errcode = '22023';
    end if;

    if v_quantidade = 0 then
      delete from public.pedidos_reservas
       where item_pedido_id = v_item_pedido.id and pedido_id = p_pedido_id and tenant_id = v_tenant and status = 'ATIVA';
      delete from public.itens_pedido where id = v_item_pedido.id and tenant_id = v_tenant;
    else
      select * into v_item_ata from public.itens_ata ia
       where ia.id = v_item_pedido.item_ata_id and ia.tenant_id = v_tenant for update;
      if not found then
        raise exception 'Item da ata não encontrado' using errcode = 'P0002';
      end if;
      select coalesce(sum(pr.quantidade), 0) into v_outras_reservas
        from public.pedidos_reservas pr
       where pr.item_ata_id = v_item_pedido.item_ata_id
         and pr.tenant_id = v_tenant and pr.status = 'ATIVA'
         and pr.pedido_id <> p_pedido_id;
      if v_quantidade > greatest(0, coalesce(v_item_ata.saldo_quantidade, 0) - v_outras_reservas) then
        raise exception 'Saldo insuficiente para o item %', coalesce(v_item_ata.descricao, v_item_pedido.item_ata_id::text) using errcode = '23514';
      end if;
      update public.itens_pedido
         set quantidade_solicitada = v_quantidade,
             valor_total = v_quantidade * coalesce(valor_unitario, 0)
       where id = v_item_pedido.id and tenant_id = v_tenant;
      update public.pedidos_reservas
         set quantidade = v_quantidade,
             valor = v_quantidade * coalesce(v_item_pedido.valor_unitario, 0)
       where item_pedido_id = v_item_pedido.id and pedido_id = p_pedido_id and tenant_id = v_tenant and status = 'ATIVA';
      if not found then
        insert into public.pedidos_reservas (pedido_id, item_pedido_id, item_ata_id, tenant_id, quantidade, valor, status, criada_por)
        values (p_pedido_id, v_item_pedido.id, v_item_pedido.item_ata_id, v_tenant, v_quantidade, v_quantidade * coalesce(v_item_pedido.valor_unitario, 0), 'ATIVA', v_user);
      end if;
      v_total := v_total + v_quantidade * coalesce(v_item_pedido.valor_unitario, 0);
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count = 0 then
    raise exception 'O pedido precisa manter ao menos um item' using errcode = '22023';
  end if;

  update public.pedidos
     set valor_total = v_total,
         status_aprovacao = case when status_aprovacao = 'DEVOLVIDO_AJUSTE' then 'AGUARDANDO_APROVACAO' else status_aprovacao end,
         status = case when status = 'DEVOLVIDO_AJUSTE' then 'AGUARDANDO_APROVACAO' else status end,
         observacao_aprovacao = coalesce(v_justificativa, observacao_aprovacao),
         updated_at = now()
   where id = p_pedido_id and tenant_id = v_tenant;

  perform app_private.registrar_evento_pedido(
    p_pedido_id,
    'PEDIDO_ITENS_AJUSTADOS',
    v_pedido.status_aprovacao,
    case when v_pedido.status_aprovacao = 'DEVOLVIDO_AJUSTE' then 'AGUARDANDO_APROVACAO' else v_pedido.status_aprovacao end,
    coalesce(v_justificativa, 'Itens ajustados pelo secretário ou administrador.'),
    jsonb_build_object('itens_mantidos', v_count)
  );

  return jsonb_build_object('pedido_id', p_pedido_id, 'status', case when v_pedido.status_aprovacao = 'DEVOLVIDO_AJUSTE' then 'AGUARDANDO_APROVACAO' else v_pedido.status_aprovacao end, 'valor_total', v_total);
end;
$$;

revoke execute on function public.compras_ajustar_itens_pedido(integer, jsonb, text) from public, anon;
grant execute on function public.compras_ajustar_itens_pedido(integer, jsonb, text) to authenticated;
