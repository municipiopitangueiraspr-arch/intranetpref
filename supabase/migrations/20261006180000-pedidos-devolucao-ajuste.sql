-- Fluxo de devolução para ajuste sem recriar o pedido.
-- Também alinha o domínio de status com compras_encerrar_pedido.

begin;

alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (
  status in (
    'RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REPROVADO',
    'CANCELADO', 'PEDIDO_REALIZADO', 'ENCERRADO'
  )
);

create table if not exists public.pedidos_devolucoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app_private.current_tenant_id() references public.app_tenants(id),
  pedido_id integer not null references public.pedidos(id),
  devolvido_por integer not null references public.usuarios(id),
  justificativa text not null check (length(trim(justificativa)) >= 10),
  status text not null default 'AGUARDANDO_SOLICITANTE' check (status in ('AGUARDANDO_SOLICITANTE','ACEITA','CONTESTADA','EXPIRADA')),
  resposta_justificativa text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

create table if not exists public.pedidos_devolucoes_itens (
  id uuid primary key default gen_random_uuid(),
  devolucao_id uuid not null references public.pedidos_devolucoes(id) on delete cascade,
  tenant_id uuid not null default app_private.current_tenant_id() references public.app_tenants(id),
  item_pedido_id integer not null references public.itens_pedido(id),
  quantidade_original numeric not null check (quantidade_original >= 0),
  quantidade_sugerida numeric not null check (quantidade_sugerida >= 0),
  unique (devolucao_id, item_pedido_id)
);

create index if not exists pedidos_devolucoes_pedido_idx on public.pedidos_devolucoes (tenant_id, pedido_id, criado_em desc);
create index if not exists pedidos_devolucoes_pendentes_idx on public.pedidos_devolucoes (tenant_id, status) where status = 'AGUARDANDO_SOLICITANTE';
create index if not exists pedidos_devolucoes_itens_item_idx on public.pedidos_devolucoes_itens (tenant_id, item_pedido_id);

alter table public.pedidos_devolucoes enable row level security;
alter table public.pedidos_devolucoes_itens enable row level security;

drop policy if exists pedidos_devolucoes_tenant_select on public.pedidos_devolucoes;
create policy pedidos_devolucoes_tenant_select on public.pedidos_devolucoes for select to authenticated using (tenant_id = app_private.current_tenant_id());
drop policy if exists pedidos_devolucoes_itens_tenant_select on public.pedidos_devolucoes_itens;
create policy pedidos_devolucoes_itens_tenant_select on public.pedidos_devolucoes_itens for select to authenticated using (tenant_id = app_private.current_tenant_id());

grant select on public.pedidos_devolucoes, public.pedidos_devolucoes_itens to authenticated;

create or replace function public.compras_devolver_pedido(
  p_pedido_id integer,
  p_itens jsonb,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user integer := app_private.current_user_id();
  v_tenant uuid := app_private.current_tenant_id();
  v_pedido public.pedidos%rowtype;
  v_devolucao public.pedidos_devolucoes%rowtype;
  v_item jsonb;
  v_item_pedido public.itens_pedido%rowtype;
  v_count integer := 0;
begin
  if v_user is null or v_tenant is null then raise exception 'Usuário ou tenant não identificado' using errcode = '42501'; end if;
  if not app_private.has_tenant_role(v_tenant, array['tenant_admin','compras_manager']) then raise exception 'Sem permissão para devolver pedidos' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_justificativa,'')), '') is null or length(trim(p_justificativa)) < 10 then raise exception 'Justificativa deve ter pelo menos 10 caracteres' using errcode = '22023'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Informe ao menos um item sugerido' using errcode = '22023'; end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id and tenant_id = v_tenant for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_pedido.status_aprovacao <> 'AGUARDANDO_APROVACAO' then raise exception 'Somente pedidos aguardando aprovação podem ser devolvidos' using errcode = '22023'; end if;

  insert into public.pedidos_devolucoes (tenant_id, pedido_id, devolvido_por, justificativa)
  values (v_tenant, p_pedido_id, v_user, trim(p_justificativa)) returning * into v_devolucao;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_item_pedido from public.itens_pedido where id = (v_item->>'item_pedido_id')::integer and pedido_id = p_pedido_id and tenant_id = v_tenant for update;
    if not found then raise exception 'Item do pedido não encontrado' using errcode = 'P0002'; end if;
    if coalesce((v_item->>'quantidade_sugerida')::numeric, -1) < 0 then raise exception 'Quantidade sugerida inválida' using errcode = '22023'; end if;
    insert into public.pedidos_devolucoes_itens (devolucao_id, tenant_id, item_pedido_id, quantidade_original, quantidade_sugerida)
    values (v_devolucao.id, v_tenant, v_item_pedido.id, v_item_pedido.quantidade_solicitada, (v_item->>'quantidade_sugerida')::numeric);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Nenhum item válido informado' using errcode = '22023'; end if;

  update public.pedidos set status_aprovacao = 'DEVOLVIDO_AJUSTE', observacao_aprovacao = trim(p_justificativa), updated_at = now() where id = p_pedido_id and tenant_id = v_tenant;
  perform app_private.registrar_evento_pedido(p_pedido_id, 'PEDIDO_DEVOLVIDO_AJUSTE', 'AGUARDANDO_APROVACAO', 'DEVOLVIDO_AJUSTE', trim(p_justificativa), jsonb_build_object('devolucao_id', v_devolucao.id, 'itens', v_count));
  insert into public.compras_notificacoes (tenant_id, usuario_id, tipo, titulo, mensagem, prioridade, entidade)
  values (v_tenant, v_pedido.usuario_id, 'PEDIDO_DEVOLVIDO_AJUSTE', 'Pedido devolvido para ajuste', 'O pedido ' || v_pedido.numero_pedido || ' recebeu uma sugestão de ajuste.', 'alta', 'PEDIDO');
  return jsonb_build_object('pedido_id', p_pedido_id, 'devolucao_id', v_devolucao.id, 'status', 'DEVOLVIDO_AJUSTE');
end;
$$;

grant execute on function public.compras_devolver_pedido(integer, jsonb, text) to authenticated;

create or replace function public.compras_responder_devolucao(
  p_pedido_id integer,
  p_aceitar boolean,
  p_justificativa text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user integer := app_private.current_user_id();
  v_tenant uuid := app_private.current_tenant_id();
  v_pedido public.pedidos%rowtype;
  v_devolucao public.pedidos_devolucoes%rowtype;
  v_item record;
  v_disponivel numeric;
  v_outras_reservas numeric;
  v_total numeric := 0;
begin
  if v_user is null or v_tenant is null then raise exception 'Usuário ou tenant não identificado' using errcode = '42501'; end if;
  select * into v_pedido from public.pedidos where id = p_pedido_id and tenant_id = v_tenant for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_user <> v_pedido.usuario_id and not app_private.has_tenant_role(v_tenant, array['tenant_admin','compras_manager']) then raise exception 'Sem permissão para responder esta devolução' using errcode = '42501'; end if;
  select * into v_devolucao from public.pedidos_devolucoes where pedido_id = p_pedido_id and tenant_id = v_tenant and status = 'AGUARDANDO_SOLICITANTE' order by criado_em desc limit 1 for update;
  if not found then raise exception 'Nenhuma devolução pendente encontrada' using errcode = 'P0002'; end if;
  if not p_aceitar and length(trim(coalesce(p_justificativa,''))) < 10 then raise exception 'Explique a contestação com pelo menos 10 caracteres' using errcode = '22023'; end if;

  if p_aceitar then
    for v_item in select di.*, ip.item_ata_id, ip.valor_unitario from public.pedidos_devolucoes_itens di join public.itens_pedido ip on ip.id = di.item_pedido_id where di.devolucao_id = v_devolucao.id and di.tenant_id = v_tenant for update loop
      select saldo_quantidade into v_disponivel from public.itens_ata where id = v_item.item_ata_id and tenant_id = v_tenant for update;
      select coalesce(sum(quantidade), 0) into v_outras_reservas from public.pedidos_reservas where item_ata_id = v_item.item_ata_id and tenant_id = v_tenant and status = 'ATIVA' and pedido_id <> p_pedido_id;
      if v_item.quantidade_sugerida > greatest(0, coalesce(v_disponivel,0) - v_outras_reservas) then raise exception 'Saldo insuficiente para a quantidade sugerida do item %', v_item.item_pedido_id using errcode = '23514'; end if;
      update public.itens_pedido set quantidade_solicitada = v_item.quantidade_sugerida, valor_total = v_item.quantidade_sugerida * v_item.valor_unitario where id = v_item.item_pedido_id and tenant_id = v_tenant;
      update public.pedidos_reservas set quantidade = v_item.quantidade_sugerida, valor = v_item.quantidade_sugerida * v_item.valor_unitario where item_pedido_id = v_item.item_pedido_id and pedido_id = p_pedido_id and tenant_id = v_tenant and status = 'ATIVA';
      v_total := v_total + v_item.quantidade_sugerida * v_item.valor_unitario;
    end loop;
    update public.pedidos set valor_total = v_total, status_aprovacao = 'AGUARDANDO_APROVACAO', observacao_aprovacao = null, updated_at = now() where id = p_pedido_id and tenant_id = v_tenant;
    update public.pedidos_devolucoes set status = 'ACEITA', respondido_em = now(), resposta_justificativa = null where id = v_devolucao.id;
    perform app_private.registrar_evento_pedido(p_pedido_id, 'DEVOLUCAO_ACEITA', 'DEVOLVIDO_AJUSTE', 'AGUARDANDO_APROVACAO', null, jsonb_build_object('devolucao_id', v_devolucao.id));
  else
    update public.pedidos set status_aprovacao = 'AGUARDANDO_APROVACAO', observacao_aprovacao = trim(p_justificativa), updated_at = now() where id = p_pedido_id and tenant_id = v_tenant;
    update public.pedidos_devolucoes set status = 'CONTESTADA', respondido_em = now(), resposta_justificativa = trim(p_justificativa) where id = v_devolucao.id;
    perform app_private.registrar_evento_pedido(p_pedido_id, 'DEVOLUCAO_CONTESTADA', 'DEVOLVIDO_AJUSTE', 'AGUARDANDO_APROVACAO', trim(p_justificativa), jsonb_build_object('devolucao_id', v_devolucao.id));
  end if;
  return jsonb_build_object('pedido_id', p_pedido_id, 'status', 'AGUARDANDO_APROVACAO', 'resposta', case when p_aceitar then 'ACEITA' else 'CONTESTADA' end);
end;
$$;

grant execute on function public.compras_responder_devolucao(integer, boolean, text) to authenticated;

commit;
