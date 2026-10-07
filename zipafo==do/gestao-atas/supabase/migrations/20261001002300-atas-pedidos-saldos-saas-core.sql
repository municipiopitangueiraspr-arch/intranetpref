-- Núcleo SaaS do módulo Atas, Pedidos e Saldos.
-- Aditivo e reversível: não recalcula nem altera registros históricos.

create table if not exists public.pedidos_reservas (
  id uuid primary key default gen_random_uuid(),
  pedido_id integer not null references public.pedidos(id) on delete restrict,
  item_pedido_id integer not null references public.itens_pedido(id) on delete restrict,
  item_ata_id integer not null references public.itens_ata(id) on delete restrict,
  tenant_id uuid not null default app_private.current_tenant_id(),
  quantidade numeric not null check (quantidade > 0),
  valor numeric not null default 0 check (valor >= 0),
  status text not null default 'ATIVA' check (status in ('ATIVA','LIBERADA','CONSUMIDA','CANCELADA')),
  criada_por integer references public.usuarios(id),
  criada_em timestamptz not null default now(),
  liberada_em timestamptz,
  motivo_liberacao text,
  unique (pedido_id, item_pedido_id)
);
create index if not exists pedidos_reservas_saldo_idx on public.pedidos_reservas(tenant_id,item_ata_id,status);

create table if not exists public.pedidos_entregas (
  id uuid primary key default gen_random_uuid(),
  pedido_id integer not null references public.pedidos(id) on delete restrict,
  tenant_id uuid not null default app_private.current_tenant_id(),
  numero integer not null,
  data_entrega date not null default current_date,
  tipo text not null default 'PARCIAL' check (tipo in ('PARCIAL','FINAL')),
  documento_referencia text,
  observacao text,
  recebido_por integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  unique (pedido_id, numero)
);
create index if not exists pedidos_entregas_pedido_idx on public.pedidos_entregas(tenant_id,pedido_id,data_entrega);

create table if not exists public.pedidos_entregas_itens (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.pedidos_entregas(id) on delete restrict,
  pedido_id integer not null references public.pedidos(id) on delete restrict,
  item_pedido_id integer not null references public.itens_pedido(id) on delete restrict,
  tenant_id uuid not null default app_private.current_tenant_id(),
  quantidade numeric not null check (quantidade > 0),
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists pedidos_entregas_itens_item_idx on public.pedidos_entregas_itens(tenant_id,item_pedido_id);

create table if not exists public.pedidos_eventos (
  id bigint generated always as identity primary key,
  pedido_id integer not null references public.pedidos(id) on delete restrict,
  tenant_id uuid not null default app_private.current_tenant_id(),
  evento text not null,
  status_anterior text,
  status_novo text,
  ator_id integer references public.usuarios(id),
  justificativa text,
  metadados jsonb not null default '{}',
  ocorrido_em timestamptz not null default clock_timestamp()
);
create index if not exists pedidos_eventos_pedido_idx on public.pedidos_eventos(tenant_id,pedido_id,ocorrido_em desc);

alter table public.pedidos_reservas enable row level security;
alter table public.pedidos_entregas enable row level security;
alter table public.pedidos_entregas_itens enable row level security;
alter table public.pedidos_eventos enable row level security;

create policy pedidos_reservas_tenant_scope on public.pedidos_reservas for all to authenticated using (tenant_id=app_private.current_tenant_id()) with check (tenant_id=app_private.current_tenant_id());
create policy pedidos_entregas_tenant_scope on public.pedidos_entregas for all to authenticated using (tenant_id=app_private.current_tenant_id()) with check (tenant_id=app_private.current_tenant_id());
create policy pedidos_entregas_itens_tenant_scope on public.pedidos_entregas_itens for all to authenticated using (tenant_id=app_private.current_tenant_id()) with check (tenant_id=app_private.current_tenant_id());
create policy pedidos_eventos_tenant_scope on public.pedidos_eventos for select to authenticated using (tenant_id=app_private.current_tenant_id());

create or replace function app_private.registrar_evento_pedido(p_pedido_id integer,p_evento text,p_status_anterior text default null,p_status_novo text default null,p_justificativa text default null,p_metadados jsonb default '{}') returns void language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
begin
  insert into public.pedidos_eventos(pedido_id,tenant_id,evento,status_anterior,status_novo,ator_id,justificativa,metadados)
  values(p_pedido_id,app_private.current_tenant_id(),p_evento,p_status_anterior,p_status_novo,app_private.current_user_id(),p_justificativa,coalesce(p_metadados,'{}'));
end; $$;

create or replace function app_private.validar_aprovacao_com_reservas() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
declare it record; disponivel numeric; reservados numeric;
begin
  if new.status_aprovacao='APROVADO' and coalesce(old.status_aprovacao,'')<>'APROVADO' then
    for it in select ip.item_ata_id,ip.quantidade_solicitada from public.itens_pedido ip where ip.pedido_id=new.id and ip.tenant_id=new.tenant_id loop
      select ia.saldo_quantidade into disponivel from public.itens_ata ia where ia.id=it.item_ata_id and ia.tenant_id=new.tenant_id for update;
      if disponivel is null then raise exception 'Item da ata não encontrado no tenant do pedido' using errcode='P0002'; end if;
      select coalesce(sum(r.quantidade),0) into reservados from public.pedidos_reservas r where r.item_ata_id=it.item_ata_id and r.tenant_id=new.tenant_id and r.status='ATIVA' and r.pedido_id<>new.id;
      if it.quantidade_solicitada > greatest(0,disponivel-reservados) then raise exception 'Saldo disponível insuficiente após reservas para o item %' , it.item_ata_id using errcode='23514'; end if;
    end loop;
  end if;
  return new;
end; $$;

drop trigger if exists trg_pedidos_validar_aprovacao_reservas on public.pedidos;
create trigger trg_pedidos_validar_aprovacao_reservas before update of status_aprovacao on public.pedidos for each row execute function app_private.validar_aprovacao_com_reservas();

create or replace function app_private.liberar_reserva_pedido() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
begin
  if new.status_aprovacao in ('APROVADO','REPROVADO','CANCELADO') and coalesce(old.status_aprovacao,'')<>new.status_aprovacao then
    update public.pedidos_reservas set status=case when new.status_aprovacao='APROVADO' then 'CONSUMIDA' else 'LIBERADA' end, liberada_em=now(), motivo_liberacao='Mudança de status do pedido: '||new.status_aprovacao where pedido_id=new.id and tenant_id=new.tenant_id and status='ATIVA';
    perform app_private.registrar_evento_pedido(new.id,'STATUS_ALTERADO',old.status_aprovacao,new.status_aprovacao,null,'{}');
  end if;
  return new;
end; $$;
drop trigger if exists trg_pedidos_liberar_reserva on public.pedidos;
create trigger trg_pedidos_liberar_reserva after update of status_aprovacao on public.pedidos for each row execute function app_private.liberar_reserva_pedido();

create or replace function public.compras_rejeitar_pedido(p_pedido_id integer,p_justificativa text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
declare p public.pedidos; uid integer;
begin
  uid:=app_private.current_user_id(); if uid is null then raise exception 'Usuário autenticado não encontrado' using errcode='42501'; end if;
  select * into p from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  if not app_private.has_tenant_role(p.tenant_id,array['tenant_admin','compras_manager']) then raise exception 'Sem permissão para rejeitar pedido' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_justificativa,'')),'') is null then raise exception 'Justificativa obrigatória' using errcode='22023'; end if;
  update public.pedidos set status_aprovacao='REPROVADO',status='REPROVADO',aprovado_por=uid,data_aprovacao=current_date,observacao_aprovacao=p_justificativa,updated_at=now() where id=p_pedido_id and tenant_id=p.tenant_id;
  return jsonb_build_object('pedido_id',p_pedido_id,'status','REPROVADO');
end; $$;
grant execute on function public.compras_rejeitar_pedido(integer,text) to authenticated;

create or replace function public.compras_cancelar_pedido(p_pedido_id integer,p_justificativa text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
declare p public.pedidos; uid integer;
begin
  uid:=app_private.current_user_id(); if uid is null then raise exception 'Usuário autenticado não encontrado' using errcode='42501'; end if;
  select * into p from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  if not app_private.has_tenant_role(p.tenant_id,array['tenant_admin','compras_manager']) then raise exception 'Sem permissão para cancelar pedido' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_justificativa,'')),'') is null then raise exception 'Justificativa obrigatória' using errcode='22023'; end if;
  if exists(select 1 from public.pedidos_entregas_itens where pedido_id=p_pedido_id and tenant_id=p.tenant_id) then raise exception 'Pedido com entrega não pode ser cancelado sem estorno formal' using errcode='55000'; end if;
  update public.pedidos set status_aprovacao='CANCELADO',status='CANCELADO',observacao_aprovacao=p_justificativa,updated_at=now() where id=p_pedido_id and tenant_id=p.tenant_id;
  return jsonb_build_object('pedido_id',p_pedido_id,'status','CANCELADO');
end; $$;
grant execute on function public.compras_cancelar_pedido(integer,text) to authenticated;

create or replace function public.compras_registrar_entrega(p_pedido_id integer,p_itens jsonb,p_tipo text default 'PARCIAL',p_data_entrega date default current_date,p_documento text default null,p_observacao text default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
declare p public.pedidos; e public.pedidos_entregas; x jsonb; ip public.itens_pedido%rowtype; entregue numeric; nova numeric; n integer; uid integer;
begin
  uid:=app_private.current_user_id(); if uid is null then raise exception 'Usuário autenticado não encontrado' using errcode='42501'; end if;
  if p_tipo not in ('PARCIAL','FINAL') then raise exception 'Tipo de entrega inválido'; end if;
  select * into p from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  if not app_private.has_tenant_role(p.tenant_id,array['tenant_admin','compras_manager']) then raise exception 'Sem permissão para registrar entrega' using errcode='42501'; end if;
  select coalesce(max(numero),0)+1 into n from public.pedidos_entregas where pedido_id=p_pedido_id and tenant_id=p.tenant_id;
  insert into public.pedidos_entregas(pedido_id,tenant_id,numero,data_entrega,tipo,documento_referencia,observacao,recebido_por) values(p_pedido_id,p.tenant_id,n,p_data_entrega,p_tipo,p_documento,p_observacao,uid) returning * into e;
  for x in select * from jsonb_array_elements(coalesce(p_itens,'[]')) loop
    select * into ip from public.itens_pedido where id=(x->>'item_pedido_id')::integer and pedido_id=p_pedido_id and tenant_id=p.tenant_id;
    if not found then raise exception 'Item de pedido inválido'; end if;
    nova:=(x->>'quantidade')::numeric; if nova is null or nova<=0 then raise exception 'Quantidade de entrega inválida'; end if;
    select coalesce(sum(quantidade),0) into entregue from public.pedidos_entregas_itens where item_pedido_id=ip.id and tenant_id=p.tenant_id;
    if entregue+nova>ip.quantidade_solicitada then raise exception 'Entrega excede quantidade do item %',ip.id using errcode='22023'; end if;
    insert into public.pedidos_entregas_itens(entrega_id,pedido_id,item_pedido_id,tenant_id,quantidade,observacao) values(e.id,p_pedido_id,ip.id,p.tenant_id,nova,x->>'observacao');
  end loop;
  if not exists(select 1 from public.pedidos_entregas_itens where entrega_id=e.id) then raise exception 'Entrega sem itens'; end if;
  perform app_private.registrar_evento_pedido(p_pedido_id,'ENTREGA_REGISTRADA',p.status,p.status,p_observacao,jsonb_build_object('entrega_id',e.id,'numero',e.numero));
  return jsonb_build_object('entrega_id',e.id,'numero',e.numero,'pedido_id',p_pedido_id);
end; $$;
grant execute on function public.compras_registrar_entrega(integer,jsonb,text,date,text,text) to authenticated;

comment on table public.pedidos_reservas is 'Reservas de saldo para pedidos pendentes, liberadas ou consumidas transacionalmente.';
comment on table public.pedidos_entregas is 'Entregas parciais ou finais vinculadas a pedidos.';
comment on table public.pedidos_eventos is 'Trilha append-only do ciclo de vida do pedido.';
