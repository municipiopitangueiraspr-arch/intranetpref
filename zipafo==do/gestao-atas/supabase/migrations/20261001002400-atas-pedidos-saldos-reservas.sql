-- Reserva automática de saldo para itens de pedidos pendentes.
create or replace function app_private.reservar_item_pedido() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,app_private as $$
declare p public.pedidos; ia public.itens_ata%rowtype; reservado numeric; disponivel numeric; uid integer;
begin
  select * into p from public.pedidos where id=new.pedido_id and tenant_id=new.tenant_id;
  if not found or p.status_aprovacao<>'AGUARDANDO_APROVACAO' then return new; end if;
  uid:=app_private.current_user_id();
  select * into ia from public.itens_ata where id=new.item_ata_id and tenant_id=new.tenant_id for update;
  if not found then raise exception 'Item da ata não pertence ao tenant do pedido' using errcode='P0002'; end if;
  select coalesce(sum(r.quantidade),0) into reservado from public.pedidos_reservas r where r.item_ata_id=new.item_ata_id and r.tenant_id=new.tenant_id and r.status='ATIVA' and r.pedido_id<>new.pedido_id;
  disponivel:=greatest(0,coalesce(ia.saldo_quantidade,0)-reservado);
  if new.quantidade_solicitada>disponivel then raise exception 'Saldo utilizável insuficiente para reservar o item %: disponível %, solicitado %',new.item_ata_id,disponivel,new.quantidade_solicitada using errcode='23514'; end if;
  insert into public.pedidos_reservas(pedido_id,item_pedido_id,item_ata_id,tenant_id,quantidade,valor,status,criada_por)
  values(new.pedido_id,new.id,new.item_ata_id,new.tenant_id,new.quantidade_solicitada,coalesce(new.valor_total,0),'ATIVA',uid)
  on conflict(pedido_id,item_pedido_id) do update set quantidade=excluded.quantidade,valor=excluded.valor,status='ATIVA',liberada_em=null,motivo_liberacao=null;
  perform app_private.registrar_evento_pedido(new.pedido_id,'SALDO_RESERVADO',p.status,p.status,null,jsonb_build_object('item_pedido_id',new.id,'quantidade',new.quantidade_solicitada));
  return new;
end; $$;
drop trigger if exists trg_reservar_item_pedido on public.itens_pedido;
create trigger trg_reservar_item_pedido after insert or update of quantidade_solicitada,item_ata_id on public.itens_pedido for each row execute function app_private.reservar_item_pedido();
